import fs from "node:fs";
import path from "node:path";
import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import TypeScript from "tree-sitter-typescript";
import Python from "tree-sitter-python";
import { CallEdge, GraphData, ImportEdge, SymbolKind, SymbolSummary } from "./types";
import { indexProjectUniversal } from "./universalIndexer";

const EXT_TO_LANGUAGE: Record<string, any> = {
  ".js": JavaScript,
  ".jsx": JavaScript,
  ".mjs": JavaScript,
  ".cjs": JavaScript,
  ".ts": TypeScript.typescript,
  ".tsx": TypeScript.tsx,
  ".py": Python,
  ".pyi": Python,
};

function normalizePath(baseDir: string, absolutePath: string): string {
  return path.relative(baseDir, absolutePath).replace(/\\/g, "/");
}

function collectFiles(baseDir: string): string[] {
  const out: string[] = [];
  const stack = [baseDir];

  while (stack.length > 0) {
    const dir = stack.pop()!;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") continue;

      const absPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(absPath);
      } else if (entry.isFile()) {
        out.push(absPath);
      }
    }
  }

  return out;
}

function nodeText(source: string, node: Parser.SyntaxNode): string {
  return source.slice(node.startIndex, node.endIndex);
}

function getNamedChild(node: Parser.SyntaxNode, field: string): Parser.SyntaxNode | null {
  try {
    return node.childForFieldName(field);
  } catch {
    return null;
  }
}

function symbolId(file: string, kind: SymbolKind, name: string, line: number): string {
  return `${file}::${kind}::${name}::L${line}`;
}

function pushSymbol(
  symbols: SymbolSummary[],
  file: string,
  kind: SymbolKind,
  name: string,
  signature: string,
  exported: boolean,
  startLine: number,
  endLine: number,
): void {
  symbols.push({
    id: symbolId(file, kind, name, startLine),
    name,
    kind,
    file,
    signature,
    exported,
    locStart: startLine,
    locEnd: endLine,
  });
}

function parseJsTsFile(
  file: string,
  source: string,
  parser: Parser,
  symbols: SymbolSummary[],
  importEdges: ImportEdge[],
  callEdges: CallEdge[],
): void {
  const tree = parser.parse(source);
  const stack: Parser.SyntaxNode[] = [tree.rootNode];
  const symbolByLine = new Map<number, string>();

  while (stack.length > 0) {
    const node = stack.pop()!;

    if (node.type === "import_statement") {
      const srcNode = getNamedChild(node, "source");
      if (srcNode) {
        const raw = nodeText(source, srcNode).replace(/^['\"]|['\"]$/g, "");
        const toFile = raw.startsWith(".")
          ? path.normalize(path.join(path.dirname(file), raw)).replace(/\\/g, "/")
          : `external:${raw}`;

        importEdges.push({ fromFile: file, toFile, specifiers: [] });
      }
    }

    if (node.type === "class_declaration") {
      const nameNode = getNamedChild(node, "name");
      if (nameNode) {
        const name = nodeText(source, nameNode);
        const line = node.startPosition.row + 1;
        pushSymbol(symbols, file, "class", name, `class ${name}`, true, line, node.endPosition.row + 1);
        symbolByLine.set(line, symbolId(file, "class", name, line));
      }
    }

    if (node.type === "function_declaration" || node.type === "method_definition") {
      const nameNode = getNamedChild(node, "name");
      if (nameNode) {
        const name = nodeText(source, nameNode);
        const line = node.startPosition.row + 1;
        const kind: SymbolKind = node.type === "method_definition" ? "method" : "function";
        pushSymbol(symbols, file, kind, name, `${kind} ${name}`, true, line, node.endPosition.row + 1);
        symbolByLine.set(line, symbolId(file, kind, name, line));
      }
    }

    if (node.type === "call_expression") {
      const fnNode = getNamedChild(node, "function");
      const name = fnNode ? nodeText(source, fnNode) : "unknown";
      let callerSymbolId: string | undefined;
      let seek = node.startPosition.row + 1;
      while (seek > 0) {
        if (symbolByLine.has(seek)) {
          callerSymbolId = symbolByLine.get(seek);
          break;
        }
        seek -= 1;
      }
      if (callerSymbolId) {
        callEdges.push({ callerSymbolId, calleeName: name });
      }
    }

    for (let i = node.namedChildCount - 1; i >= 0; i -= 1) {
      const child = node.namedChild(i);
      if (child) stack.push(child);
    }
  }
}

function parsePythonFile(
  file: string,
  source: string,
  parser: Parser,
  symbols: SymbolSummary[],
  importEdges: ImportEdge[],
  callEdges: CallEdge[],
): void {
  const tree = parser.parse(source);
  const stack: Parser.SyntaxNode[] = [tree.rootNode];
  const symbolByLine = new Map<number, string>();

  while (stack.length > 0) {
    const node = stack.pop()!;

    if (node.type === "import_statement" || node.type === "import_from_statement") {
      const text = nodeText(source, node);
      const m = text.match(/(?:from|import)\s+([A-Za-z0-9_\.]+)/);
      if (m) {
        const spec = m[1];
        const toFile = spec.startsWith(".")
          ? path.normalize(path.join(path.dirname(file), spec)).replace(/\\/g, "/")
          : `external:${spec}`;
        importEdges.push({ fromFile: file, toFile, specifiers: [] });
      }
    }

    if (node.type === "class_definition") {
      const nameNode = getNamedChild(node, "name");
      if (nameNode) {
        const name = nodeText(source, nameNode);
        const line = node.startPosition.row + 1;
        pushSymbol(symbols, file, "class", name, `class ${name}`, true, line, node.endPosition.row + 1);
        symbolByLine.set(line, symbolId(file, "class", name, line));
      }
    }

    if (node.type === "function_definition") {
      const nameNode = getNamedChild(node, "name");
      if (nameNode) {
        const name = nodeText(source, nameNode);
        const line = node.startPosition.row + 1;
        pushSymbol(symbols, file, "function", name, `function ${name}`, true, line, node.endPosition.row + 1);
        symbolByLine.set(line, symbolId(file, "function", name, line));
      }
    }

    if (node.type === "call") {
      const fnNode = getNamedChild(node, "function");
      const name = fnNode ? nodeText(source, fnNode) : "unknown";
      let callerSymbolId: string | undefined;
      let seek = node.startPosition.row + 1;
      while (seek > 0) {
        if (symbolByLine.has(seek)) {
          callerSymbolId = symbolByLine.get(seek);
          break;
        }
        seek -= 1;
      }
      if (callerSymbolId) {
        callEdges.push({ callerSymbolId, calleeName: name });
      }
    }

    for (let i = node.namedChildCount - 1; i >= 0; i -= 1) {
      const child = node.namedChild(i);
      if (child) stack.push(child);
    }
  }
}

export function indexProjectTreeSitter(baseDir: string): GraphData {
  const universal = indexProjectUniversal(baseDir);
  const parser = new Parser();

  const symbols: SymbolSummary[] = [];
  const importEdges: ImportEdge[] = [];
  const callEdges: CallEdge[] = [];

  const filesAbs = collectFiles(baseDir);
  const files = filesAbs.map((f) => normalizePath(baseDir, f));

  for (const absFile of filesAbs) {
    const relFile = normalizePath(baseDir, absFile);
    const ext = path.extname(absFile).toLowerCase();
    const lang = EXT_TO_LANGUAGE[ext];

    if (!lang) continue;

    const source = fs.readFileSync(absFile, "utf8");
    parser.setLanguage(lang);

    symbols.push({
      id: `${relFile}::file::${relFile}::L1`,
      name: relFile,
      kind: "file",
      file: relFile,
      signature: relFile,
      exported: false,
      locStart: 1,
      locEnd: source.split("\n").length,
    });

    if ([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"].includes(ext)) {
      parseJsTsFile(relFile, source, parser, symbols, importEdges, callEdges);
    } else if ([".py", ".pyi"].includes(ext)) {
      parsePythonFile(relFile, source, parser, symbols, importEdges, callEdges);
    }
  }

  const coveredFiles = new Set(symbols.map((s) => s.file));
  const merged = {
    files: [...new Set([...universal.files, ...files])],
    symbols: [...symbols, ...universal.symbols.filter((s) => !coveredFiles.has(s.file))],
    importEdges: [...importEdges, ...universal.importEdges.filter((e) => !coveredFiles.has(e.fromFile))],
    callEdges: [...callEdges, ...universal.callEdges.filter((e) => {
      const caller = symbols.find((s) => s.id === e.callerSymbolId);
      return !caller || !coveredFiles.has(caller.file);
    })],
    generatedAt: new Date().toISOString(),
  } satisfies GraphData;

  return merged;
}
