"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.indexProject = indexProject;
const node_path_1 = __importDefault(require("node:path"));
const ts_morph_1 = require("ts-morph");
function normalizePath(baseDir, absolutePath) {
    return node_path_1.default.relative(baseDir, absolutePath).replace(/\\/g, "/");
}
function buildSymbolId(file, kind, name, line) {
    return `${file}::${kind}::${name}::L${line}`;
}
function isRepoSourceFile(baseDir, absolutePath) {
    const rel = normalizePath(baseDir, absolutePath);
    if (rel.startsWith(".."))
        return false;
    if (rel.includes("node_modules/"))
        return false;
    return /\.(ts|tsx|js|jsx)$/.test(rel);
}
function indexProject(baseDir, includeGlobs) {
    const project = new ts_morph_1.Project({
        skipAddingFilesFromTsConfig: true,
    });
    includeGlobs.forEach((globPattern) => {
        project.addSourceFilesAtPaths(node_path_1.default.join(baseDir, globPattern));
    });
    const sourceFiles = project
        .getSourceFiles()
        .filter((sf) => isRepoSourceFile(baseDir, sf.getFilePath()));
    const symbols = [];
    const importEdges = [];
    const callEdges = [];
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
                    if (ts_morph_1.Node.isCallExpression(desc)) {
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
                if (ts_morph_1.Node.isCallExpression(desc)) {
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
