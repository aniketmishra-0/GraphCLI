import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { CallEdge, GraphData, ImportEdge, SymbolKind, SymbolSummary } from "./types";

interface LanguagePattern {
  importPatterns: RegExp[];
  classPatterns: RegExp[];
  functionPatterns: RegExp[];
  methodPatterns: RegExp[];
  interfacePatterns: RegExp[];
  typePatterns: RegExp[];
}

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "ts",
  ".tsx": "ts",
  ".js": "js",
  ".jsx": "js",
  ".mjs": "js",
  ".cjs": "js",
  ".py": "py",
  ".pyi": "py",
  ".java": "java",
  ".kt": "kt",
  ".kts": "kt",
  ".swift": "swift",
  ".go": "go",
  ".rs": "rs",
  ".rb": "rb",
  ".php": "php",
  ".cs": "cs",
  ".fs": "fs",
  ".fsi": "fs",
  ".fsx": "fs",
  ".cpp": "cpp",
  ".c": "cpp",
  ".h": "cpp",
  ".hpp": "cpp",
  ".cc": "cpp",
  ".hh": "cpp",
  ".scala": "scala",
  ".sc": "scala",
  ".lua": "lua",
  ".dart": "dart",
  ".r": "r",
  ".R": "r",
  ".pl": "pl",
  ".sol": "sol",
  ".vue": "vue",
  ".sql": "sql",
  ".sh": "sh",
  ".bash": "sh",
  ".zsh": "sh",
  ".ps1": "ps",
  ".jl": "jl",
  ".hs": "hs",
  ".clj": "clj",
  ".cljs": "clj",
  ".cljc": "clj",
  ".ex": "ex",
  ".exs": "ex",
  ".erl": "erl",
  ".hrl": "erl",
  ".zig": "zig",
  ".nim": "nim",
  ".groovy": "groovy",
  ".gradle": "groovy",
  ".hx": "haxe",
  ".m": "objc",
  ".mm": "objc",
};

const LANGUAGE_PATTERNS: Record<string, LanguagePattern> = {
  ts: {
    importPatterns: [/^\s*import\s+.*?from\s+["']([^"']+)["']/gm, /^\s*import\s+["']([^"']+)["']/gm],
    classPatterns: [/\bclass\s+([A-Za-z_][A-Za-z0-9_]*)/g],
    functionPatterns: [/\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g, /\bconst\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\(?.*?\)?\s*=>/g],
    methodPatterns: [/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(.*?\)\s*\{/g],
    interfacePatterns: [/\binterface\s+([A-Za-z_][A-Za-z0-9_]*)/g],
    typePatterns: [/\btype\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g],
  },
  js: {
    importPatterns: [/^\s*import\s+.*?from\s+["']([^"']+)["']/gm, /^\s*const\s+.*?=\s*require\(["']([^"']+)["']\)/gm],
    classPatterns: [/\bclass\s+([A-Za-z_][A-Za-z0-9_]*)/g],
    functionPatterns: [/\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g, /\bconst\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\(?.*?\)?\s*=>/g],
    methodPatterns: [/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(.*?\)\s*\{/g],
    interfacePatterns: [],
    typePatterns: [],
  },
  py: {
    importPatterns: [/^\s*import\s+([A-Za-z0-9_\.]+)/gm, /^\s*from\s+([A-Za-z0-9_\.]+)\s+import\s+/gm],
    classPatterns: [/\bclass\s+([A-Za-z_][A-Za-z0-9_]*)\s*[:\(]/g],
    functionPatterns: [/\bdef\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g],
    methodPatterns: [/\bdef\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g],
    interfacePatterns: [],
    typePatterns: [],
  },
  java: {
    importPatterns: [/^\s*import\s+([A-Za-z0-9_\.]+)\s*;/gm],
    classPatterns: [/\bclass\s+([A-Za-z_][A-Za-z0-9_]*)/g],
    functionPatterns: [/\b(?:public|private|protected)?\s*(?:static\s+)?[A-Za-z0-9_<>,\[\]]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g],
    methodPatterns: [/\b(?:public|private|protected)?\s*(?:static\s+)?[A-Za-z0-9_<>,\[\]]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g],
    interfacePatterns: [/\binterface\s+([A-Za-z_][A-Za-z0-9_]*)/g],
    typePatterns: [],
  },
};

const GENERIC_PATTERN: LanguagePattern = {
  importPatterns: [/^\s*import\s+.*?([A-Za-z0-9_\.\/-]+)\s*;?$/gm, /^\s*#include\s+[<"]([^>"]+)[>"]/gm],
  classPatterns: [/\bclass\s+([A-Za-z_][A-Za-z0-9_]*)/g, /\bstruct\s+([A-Za-z_][A-Za-z0-9_]*)/g],
  functionPatterns: [/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(.*?\)\s*\{/g],
  methodPatterns: [/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(.*?\)\s*\{/g],
  interfacePatterns: [/\binterface\s+([A-Za-z_][A-Za-z0-9_]*)/g],
  typePatterns: [/\btype\s+([A-Za-z_][A-Za-z0-9_]*)\b/g],
};

function normalizePath(baseDir: string, absolutePath: string): string {
  return path.relative(baseDir, absolutePath).replace(/\\/g, "/");
}

function getLanguage(file: string): string {
  return EXT_TO_LANG[path.extname(file).toLowerCase()] ?? "generic";
}

function patternSetFor(file: string): LanguagePattern {
  const lang = getLanguage(file);
  return LANGUAGE_PATTERNS[lang] ?? GENERIC_PATTERN;
}

function hashText(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

function buildSymbolId(file: string, kind: SymbolKind, name: string, index: number): string {
  return `${file}::${kind}::${name}::I${index}`;
}

function findAllMatches(text: string, pattern: RegExp): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(pattern)) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

function collectFiles(baseDir: string): string[] {
  const files: string[] = [];
  const stack = [baseDir];

  while (stack.length > 0) {
    const dir = stack.pop()!;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") continue;

      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
      } else if (entry.isFile()) {
        const ext = path.extname(abs).toLowerCase();
        if (EXT_TO_LANG[ext]) {
          files.push(abs);
        }
      }
    }
  }

  return files;
}

function resolveImport(fromFile: string, specifier: string): string {
  if (specifier.startsWith(".")) {
    const base = path.dirname(fromFile);
    return path.normalize(path.join(base, specifier)).replace(/\\/g, "/");
  }
  return `external:${specifier}`;
}

export function indexProjectUniversal(baseDir: string): GraphData {
  const filesAbs = collectFiles(baseDir);
  const files = filesAbs.map((f) => normalizePath(baseDir, f));

  const symbols: SymbolSummary[] = [];
  const importEdges: ImportEdge[] = [];
  const callEdges: CallEdge[] = [];

  for (const absoluteFile of filesAbs) {
    const relFile = normalizePath(baseDir, absoluteFile);
    const text = fs.readFileSync(absoluteFile, "utf8");
    const patterns = patternSetFor(relFile);

    symbols.push({
      id: buildSymbolId(relFile, "file", relFile, 1),
      name: relFile,
      kind: "file",
      file: relFile,
      signature: `file:${hashText(text).slice(0, 8)}`,
      exported: false,
      locStart: 1,
      locEnd: text.split("\n").length,
    });

    for (const p of patterns.importPatterns) {
      for (const spec of findAllMatches(text, p)) {
        importEdges.push({
          fromFile: relFile,
          toFile: resolveImport(relFile, spec),
          specifiers: [],
        });
      }
    }

    const registerSymbols = (kind: SymbolKind, pats: RegExp[]): void => {
      let i = 0;
      for (const p of pats) {
        for (const name of findAllMatches(text, p)) {
          i += 1;
          symbols.push({
            id: buildSymbolId(relFile, kind, name, i),
            name,
            kind,
            file: relFile,
            signature: `${kind} ${name}`,
            exported: true,
            locStart: 1,
            locEnd: text.split("\n").length,
          });
        }
      }
    };

    registerSymbols("class", patterns.classPatterns);
    registerSymbols("function", patterns.functionPatterns);
    registerSymbols("method", patterns.methodPatterns);
    registerSymbols("interface", patterns.interfacePatterns);
    registerSymbols("type", patterns.typePatterns);
  }

  return {
    files,
    symbols,
    importEdges,
    callEdges,
    generatedAt: new Date().toISOString(),
  };
}
