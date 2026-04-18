import path from "node:path";
import { Project, Node } from "ts-morph";
import { CallEdge, GraphData, ImportEdge, SymbolSummary } from "./types";

function normalizePath(baseDir: string, absolutePath: string): string {
  return path.relative(baseDir, absolutePath).replace(/\\/g, "/");
}

function buildSymbolId(file: string, kind: string, name: string, line: number): string {
  return `${file}::${kind}::${name}::L${line}`;
}

function isRepoSourceFile(baseDir: string, absolutePath: string): boolean {
  const rel = normalizePath(baseDir, absolutePath);
  if (rel.startsWith("..")) return false;
  if (rel.includes("node_modules/")) return false;
  return /\.(ts|tsx|js|jsx)$/.test(rel);
}

export function indexProject(baseDir: string, includeGlobs: string[]): GraphData {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
  });

  includeGlobs.forEach((globPattern) => {
    project.addSourceFilesAtPaths(path.join(baseDir, globPattern));
  });

  const sourceFiles = project
    .getSourceFiles()
    .filter((sf) => isRepoSourceFile(baseDir, sf.getFilePath()));
  const symbols: SymbolSummary[] = [];
  const importEdges: ImportEdge[] = [];
  const callEdges: CallEdge[] = [];

  for (const sf of sourceFiles) {
    const file = normalizePath(baseDir, sf.getFilePath());

    symbols.push({
      id: `${file}::file::${file}::L1`,
      name: file,
      kind: "file",
      file,
      signature: file,
      exported: false,
      locStart: 1,
      locEnd: sf.getEndLineNumber(),
    });

    for (const im of sf.getImportDeclarations()) {
      const moduleSpecifier = im.getModuleSpecifierSourceFile();
      const toFile = moduleSpecifier && isRepoSourceFile(baseDir, moduleSpecifier.getFilePath())
        ? normalizePath(baseDir, moduleSpecifier.getFilePath())
        : `external:${im.getModuleSpecifierValue()}`;

      const specifiers = im.getNamedImports().map((n) => n.getName());

      importEdges.push({
        fromFile: file,
        toFile,
        specifiers,
      });
    }

    for (const c of sf.getClasses()) {
      const name = c.getName() ?? "AnonymousClass";
      const line = c.getStartLineNumber();
      const id = buildSymbolId(file, "class", name, line);
      symbols.push({
        id,
        name,
        kind: "class",
        file,
        signature: c.getText().split("{")[0].trim(),
        exported: c.isExported(),
        locStart: line,
        locEnd: c.getEndLineNumber(),
      });

      for (const m of c.getMethods()) {
        const methodName = `${name}.${m.getName()}`;
        const mLine = m.getStartLineNumber();
        const mId = buildSymbolId(file, "method", methodName, mLine);
        symbols.push({
          id: mId,
          name: methodName,
          kind: "method",
          file,
          signature: m.getText().split("{")[0].trim(),
          exported: c.isExported(),
          locStart: mLine,
          locEnd: m.getEndLineNumber(),
        });

        m.forEachDescendant((desc) => {
          if (Node.isCallExpression(desc)) {
            callEdges.push({
              callerSymbolId: mId,
              calleeName: desc.getExpression().getText(),
            });
          }
        });
      }
    }

    for (const fn of sf.getFunctions()) {
      const name = fn.getName() ?? "anonymousFunction";
      const line = fn.getStartLineNumber();
      const id = buildSymbolId(file, "function", name, line);
      symbols.push({
        id,
        name,
        kind: "function",
        file,
        signature: fn.getText().split("{")[0].trim(),
        exported: fn.isExported(),
        locStart: line,
        locEnd: fn.getEndLineNumber(),
      });

      fn.forEachDescendant((desc) => {
        if (Node.isCallExpression(desc)) {
          callEdges.push({
            callerSymbolId: id,
            calleeName: desc.getExpression().getText(),
          });
        }
      });
    }

    for (const iface of sf.getInterfaces()) {
      const name = iface.getName();
      const line = iface.getStartLineNumber();
      const id = buildSymbolId(file, "interface", name, line);
      symbols.push({
        id,
        name,
        kind: "interface",
        file,
        signature: iface.getText().split("{")[0].trim(),
        exported: iface.isExported(),
        locStart: line,
        locEnd: iface.getEndLineNumber(),
      });
    }

    for (const typeAlias of sf.getTypeAliases()) {
      const name = typeAlias.getName();
      const line = typeAlias.getStartLineNumber();
      const id = buildSymbolId(file, "type", name, line);
      symbols.push({
        id,
        name,
        kind: "type",
        file,
        signature: typeAlias.getText().split("=")[0].trim(),
        exported: typeAlias.isExported(),
        locStart: line,
        locEnd: typeAlias.getEndLineNumber(),
      });
    }
  }

  const files = sourceFiles.map((sf) => normalizePath(baseDir, sf.getFilePath()));

  return {
    files,
    symbols,
    importEdges,
    callEdges,
    generatedAt: new Date().toISOString(),
  };
}
