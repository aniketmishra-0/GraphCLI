import fs from "node:fs";
import path from "node:path";
import { CallEdge, GraphData, ImportEdge, SymbolKind, SymbolSummary } from "./types";

interface LspSymbol {
  name: string;
  kind: SymbolKind;
  file: string;
  signature: string;
  exported: boolean;
  locStart: number;
  locEnd: number;
}

interface LspReference {
  fromFile: string;
  fromSymbol?: string;
  toFile: string;
  toSymbol?: string;
  kind: "import" | "call" | "reference";
}

interface LspIndex {
  files: string[];
  symbols: LspSymbol[];
  references: LspReference[];
  generatedAt?: string;
}

function normalizeFile(baseDir: string, file: string): string {
  if (file.startsWith("external:")) return file;
  const resolved = path.isAbsolute(file) ? file : path.join(baseDir, file);
  return path.relative(baseDir, resolved).replace(/\\/g, "/");
}

function symbolId(file: string, kind: SymbolKind, name: string, locStart: number): string {
  return `${file}::${kind}::${name}::L${locStart}`;
}

function loadIndexFile(baseDir: string, lspIndexPath: string): LspIndex {
  const absPath = path.isAbsolute(lspIndexPath) ? lspIndexPath : path.join(baseDir, lspIndexPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`LSP index file not found: ${absPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(absPath, "utf8")) as LspIndex;
  if (!Array.isArray(parsed.files) || !Array.isArray(parsed.symbols) || !Array.isArray(parsed.references)) {
    throw new Error("Invalid LSP index format. Required keys: files, symbols, references.");
  }

  return parsed;
}

export function indexProjectFromLsp(baseDir: string, lspIndexPath: string): GraphData {
  const lsp = loadIndexFile(baseDir, lspIndexPath);

  const files = lsp.files.map((f) => normalizeFile(baseDir, f));
  const symbolMap = new Map<string, SymbolSummary>();

  for (const s of lsp.symbols) {
    const file = normalizeFile(baseDir, s.file);
    const id = symbolId(file, s.kind, s.name, s.locStart);
    symbolMap.set(id, {
      id,
      name: s.name,
      kind: s.kind,
      file,
      signature: s.signature,
      exported: s.exported,
      locStart: s.locStart,
      locEnd: s.locEnd,
    });
  }

  const symbols = [...symbolMap.values()];

  const importEdges: ImportEdge[] = [];
  const callEdges: CallEdge[] = [];

  const symbolIndexByName = new Map<string, string[]>();
  for (const s of symbols) {
    if (!symbolIndexByName.has(s.name)) {
      symbolIndexByName.set(s.name, []);
    }
    symbolIndexByName.get(s.name)!.push(s.id);
  }

  for (const r of lsp.references) {
    const fromFile = normalizeFile(baseDir, r.fromFile);
    const toFile = r.toFile.startsWith("external:")
      ? r.toFile
      : normalizeFile(baseDir, r.toFile);

    if (r.kind === "import") {
      importEdges.push({
        fromFile,
        toFile,
        specifiers: r.toSymbol ? [r.toSymbol] : [],
      });
      continue;
    }

    if (r.kind === "call") {
      const callerCandidates = r.fromSymbol ? (symbolIndexByName.get(r.fromSymbol) ?? []) : [];
      const fallbackCaller = symbols.find((s) => s.file === fromFile && (s.kind === "function" || s.kind === "method"));
      const callerSymbolId = callerCandidates[0] ?? fallbackCaller?.id;

      if (callerSymbolId) {
        callEdges.push({
          callerSymbolId,
          calleeName: r.toSymbol ?? path.basename(toFile),
        });
      }
    }
  }

  return {
    files,
    symbols,
    importEdges,
    callEdges,
    generatedAt: lsp.generatedAt ?? new Date().toISOString(),
  };
}
