import path from "node:path";
import Database from "better-sqlite3";
import { GraphData } from "./types";

export class GraphStore {
  private db: Database.Database;

  constructor(baseDir: string) {
    const dbPath = path.join(baseDir, ".smart-context-map.db");
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY
      );

      CREATE TABLE IF NOT EXISTS symbols (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        file TEXT NOT NULL,
        signature TEXT NOT NULL,
        exported INTEGER NOT NULL,
        loc_start INTEGER NOT NULL,
        loc_end INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS import_edges (
        from_file TEXT NOT NULL,
        to_file TEXT NOT NULL,
        specifiers TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS call_edges (
        caller_symbol_id TEXT NOT NULL,
        callee_name TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file);
      CREATE INDEX IF NOT EXISTS idx_import_from ON import_edges(from_file);
      CREATE INDEX IF NOT EXISTS idx_import_to ON import_edges(to_file);
    `);
  }

  upsertGraph(graph: GraphData): void {
    const tx = this.db.transaction(() => {
      this.db.prepare("DELETE FROM files").run();
      this.db.prepare("DELETE FROM symbols").run();
      this.db.prepare("DELETE FROM import_edges").run();
      this.db.prepare("DELETE FROM call_edges").run();

      const insertFile = this.db.prepare("INSERT INTO files(path) VALUES (?)");
      for (const file of graph.files) {
        insertFile.run(file);
      }

      const insertSymbol = this.db.prepare(
        `INSERT INTO symbols(id, name, kind, file, signature, exported, loc_start, loc_end)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const s of graph.symbols) {
        insertSymbol.run(s.id, s.name, s.kind, s.file, s.signature, s.exported ? 1 : 0, s.locStart, s.locEnd);
      }

      const insertImport = this.db.prepare(
        "INSERT INTO import_edges(from_file, to_file, specifiers) VALUES (?, ?, ?)",
      );
      for (const e of graph.importEdges) {
        insertImport.run(e.fromFile, e.toFile, JSON.stringify(e.specifiers));
      }

      const insertCall = this.db.prepare(
        "INSERT INTO call_edges(caller_symbol_id, callee_name) VALUES (?, ?)",
      );
      for (const e of graph.callEdges) {
        insertCall.run(e.callerSymbolId, e.calleeName);
      }

      this.db
        .prepare("INSERT OR REPLACE INTO meta(key, value) VALUES ('generatedAt', ?)")
        .run(graph.generatedAt);
    });

    tx();
  }

  getStats(): {
    files: number;
    symbols: number;
    importEdges: number;
    callEdges: number;
    generatedAt: string | null;
  } {
    const files = this.db.prepare("SELECT COUNT(*) AS c FROM files").get() as { c: number };
    const symbols = this.db.prepare("SELECT COUNT(*) AS c FROM symbols").get() as { c: number };
    const importEdges = this.db.prepare("SELECT COUNT(*) AS c FROM import_edges").get() as { c: number };
    const callEdges = this.db.prepare("SELECT COUNT(*) AS c FROM call_edges").get() as { c: number };
    const meta = this.db
      .prepare("SELECT value FROM meta WHERE key = 'generatedAt' LIMIT 1")
      .get() as { value?: string } | undefined;

    return {
      files: files.c,
      symbols: symbols.c,
      importEdges: importEdges.c,
      callEdges: callEdges.c,
      generatedAt: meta?.value ?? null,
    };
  }

  getImportsOf(file: string): string[] {
    const rows = this.db
      .prepare("SELECT DISTINCT to_file AS f FROM import_edges WHERE from_file = ? ORDER BY to_file")
      .all(file) as Array<{ f: string }>;
    return rows.map((r) => r.f);
  }

  getDependentsOf(file: string): string[] {
    const rows = this.db
      .prepare("SELECT DISTINCT from_file AS f FROM import_edges WHERE to_file = ? ORDER BY from_file")
      .all(file) as Array<{ f: string }>;
    return rows.map((r) => r.f);
  }

  getImpactRadius(changedFiles: string[], maxDepth: number): Array<{ file: string; depth: number; direction: "upstream" | "downstream" }> {
    const seedJson = JSON.stringify(changedFiles);

    const upstreamRows = this.db
      .prepare(
        `
        WITH RECURSIVE walk(file, depth) AS (
          SELECT value AS file, 0 AS depth FROM json_each(?)
          UNION
          SELECT ie.to_file AS file, walk.depth + 1 AS depth
          FROM walk
          JOIN import_edges ie ON ie.from_file = walk.file
          WHERE walk.depth < ?
        )
        SELECT file, MIN(depth) AS depth
        FROM walk
        GROUP BY file
        ORDER BY depth, file
      `,
      )
      .all(seedJson, maxDepth) as Array<{ file: string; depth: number }>;

    const downstreamRows = this.db
      .prepare(
        `
        WITH RECURSIVE walk(file, depth) AS (
          SELECT value AS file, 0 AS depth FROM json_each(?)
          UNION
          SELECT ie.from_file AS file, walk.depth + 1 AS depth
          FROM walk
          JOIN import_edges ie ON ie.to_file = walk.file
          WHERE walk.depth < ?
        )
        SELECT file, MIN(depth) AS depth
        FROM walk
        GROUP BY file
        ORDER BY depth, file
      `,
      )
      .all(seedJson, maxDepth) as Array<{ file: string; depth: number }>;

    return [
      ...upstreamRows.map((r) => ({ file: r.file, depth: r.depth, direction: "upstream" as const })),
      ...downstreamRows.map((r) => ({ file: r.file, depth: r.depth, direction: "downstream" as const })),
    ];
  }

  getHubFiles(limit: number): Array<{ file: string; degree: number }> {
    const rows = this.db
      .prepare(
        `
        WITH outbound AS (
          SELECT from_file AS file, COUNT(*) AS c
          FROM import_edges
          GROUP BY from_file
        ),
        inbound AS (
          SELECT to_file AS file, COUNT(*) AS c
          FROM import_edges
          GROUP BY to_file
        ),
        all_counts AS (
          SELECT file, c FROM outbound
          UNION ALL
          SELECT file, c FROM inbound
        )
        SELECT file, SUM(c) AS degree
        FROM all_counts
        GROUP BY file
        ORDER BY degree DESC, file ASC
        LIMIT ?
      `,
      )
      .all(limit) as Array<{ file: string; degree: number }>;
    return rows;
  }

  readGraphData(): GraphData {
    const files = (this.db.prepare("SELECT path FROM files ORDER BY path").all() as Array<{ path: string }>).map(
      (r) => r.path,
    );

    const symbols = (this.db
      .prepare(
        `
        SELECT id, name, kind, file, signature, exported, loc_start, loc_end
        FROM symbols
        ORDER BY file, loc_start, name
      `,
      )
      .all() as Array<{
      id: string;
      name: string;
      kind: string;
      file: string;
      signature: string;
      exported: number;
      loc_start: number;
      loc_end: number;
    }>).map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind as any,
      file: r.file,
      signature: r.signature,
      exported: r.exported === 1,
      locStart: r.loc_start,
      locEnd: r.loc_end,
    }));

    const importEdges = (this.db
      .prepare("SELECT from_file, to_file, specifiers FROM import_edges ORDER BY from_file, to_file")
      .all() as Array<{ from_file: string; to_file: string; specifiers: string }>).map((r) => ({
      fromFile: r.from_file,
      toFile: r.to_file,
      specifiers: JSON.parse(r.specifiers || "[]") as string[],
    }));

    const callEdges = (this.db
      .prepare("SELECT caller_symbol_id, callee_name FROM call_edges ORDER BY caller_symbol_id")
      .all() as Array<{ caller_symbol_id: string; callee_name: string }>).map((r) => ({
      callerSymbolId: r.caller_symbol_id,
      calleeName: r.callee_name,
    }));

    const stats = this.getStats();

    return {
      files,
      symbols,
      importEdges,
      callEdges,
      generatedAt: stats.generatedAt ?? new Date().toISOString(),
    };
  }
}
