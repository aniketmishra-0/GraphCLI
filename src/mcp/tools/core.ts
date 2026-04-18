// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createParserAdapter } from "../../parserAdapter";
import { GraphStore } from "../../graphStore";
import { fail, ok, resolveRoot } from "../common";

export function registerCoreTools(server: any): void {
  server.tool(
    "build_or_update_graph",
    {
      root: z.string().optional(),
      backend: z.enum(["treesitter", "universal", "ts-morph", "lsp"]).default("treesitter"),
      lspIndex: z.string().optional(),
    },
    async ({ root, backend, lspIndex }) => {
      try {
        const baseDir = resolveRoot(root);
        const adapter = createParserAdapter(backend);
        const graph = adapter.index(baseDir, ["**/*"], { lspIndexPath: lspIndex });
        const store = new GraphStore(baseDir);
        store.upsertGraph(graph);

        return ok({
          root: baseDir,
          backend,
          files: graph.files.length,
          symbols: graph.symbols.length,
          importEdges: graph.importEdges.length,
          callEdges: graph.callEdges.length,
          generatedAt: graph.generatedAt,
        });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "build_or_update_graph failed");
      }
    },
  );

  server.tool(
    "list_graph_stats",
    {
      root: z.string().optional(),
      topHubs: z.number().int().min(1).max(20).default(5),
    },
    async ({ root, topHubs }) => {
      try {
        const baseDir = resolveRoot(root);
        const store = new GraphStore(baseDir);
        const stats = store.getStats();
        const hubs = store.getHubFiles(topHubs);
        return ok({ root: baseDir, stats, hubs });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "list_graph_stats failed");
      }
    },
  );

  server.tool(
    "list_files",
    {
      root: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(200),
    },
    async ({ root, limit }) => {
      try {
        const baseDir = resolveRoot(root);
        const graph = new GraphStore(baseDir).readGraphData();
        return ok({ root: baseDir, files: graph.files.slice(0, limit), total: graph.files.length });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "list_files failed");
      }
    },
  );

  server.tool(
    "get_file_symbols",
    {
      root: z.string().optional(),
      file: z.string(),
    },
    async ({ root, file }) => {
      try {
        const baseDir = resolveRoot(root);
        const graph = new GraphStore(baseDir).readGraphData();
        const symbols = graph.symbols.filter((s: any) => s.file === file);
        return ok({ root: baseDir, file, symbols, count: symbols.length });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "get_file_symbols failed");
      }
    },
  );

  server.tool(
    "query_graph",
    {
      root: z.string().optional(),
      file: z.string(),
      query: z.enum(["imports_of", "dependents_of"]),
    },
    async ({ root, file, query }) => {
      try {
        const baseDir = resolveRoot(root);
        const store = new GraphStore(baseDir);
        const result = query === "imports_of" ? store.getImportsOf(file) : store.getDependentsOf(file);
        return ok({ root: baseDir, file, query, result });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "query_graph failed");
      }
    },
  );

  server.tool(
    "export_graph",
    {
      root: z.string().optional(),
      outFile: z.string().default("smart-context-export.graph.json"),
    },
    async ({ root, outFile }) => {
      try {
        const baseDir = resolveRoot(root);
        const graph = new GraphStore(baseDir).readGraphData();
        const outPath = path.join(baseDir, outFile);
        fs.writeFileSync(outPath, JSON.stringify(graph, null, 2));
        return ok({ root: baseDir, outFile: outPath, files: graph.files.length });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "export_graph failed");
      }
    },
  );

  server.tool(
    "import_graph",
    {
      root: z.string().optional(),
      graphFile: z.string().default("smart-context-graph.json"),
    },
    async ({ root, graphFile }) => {
      try {
        const baseDir = resolveRoot(root);
        const filePath = path.join(baseDir, graphFile);
        if (!fs.existsSync(filePath)) return fail(`Graph file not found: ${filePath}`);
        const graph = JSON.parse(fs.readFileSync(filePath, "utf8"));
        const store = new GraphStore(baseDir);
        store.upsertGraph(graph);
        return ok({ root: baseDir, imported: filePath, files: graph.files?.length ?? 0 });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "import_graph failed");
      }
    },
  );
}
