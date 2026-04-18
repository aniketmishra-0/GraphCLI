"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.indexProjectFromLsp = indexProjectFromLsp;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function normalizeFile(baseDir, file) {
    if (file.startsWith("external:"))
        return file;
    const resolved = node_path_1.default.isAbsolute(file) ? file : node_path_1.default.join(baseDir, file);
    return node_path_1.default.relative(baseDir, resolved).replace(/\\/g, "/");
}
function symbolId(file, kind, name, locStart) {
    return `${file}::${kind}::${name}::L${locStart}`;
}
function loadIndexFile(baseDir, lspIndexPath) {
    const absPath = node_path_1.default.isAbsolute(lspIndexPath) ? lspIndexPath : node_path_1.default.join(baseDir, lspIndexPath);
    if (!node_fs_1.default.existsSync(absPath)) {
        throw new Error(`LSP index file not found: ${absPath}`);
    }
    const parsed = JSON.parse(node_fs_1.default.readFileSync(absPath, "utf8"));
    if (!Array.isArray(parsed.files) || !Array.isArray(parsed.symbols) || !Array.isArray(parsed.references)) {
        throw new Error("Invalid LSP index format. Required keys: files, symbols, references.");
    }
    return parsed;
}
function indexProjectFromLsp(baseDir, lspIndexPath) {
    const lsp = loadIndexFile(baseDir, lspIndexPath);
    const files = lsp.files.map((f) => normalizeFile(baseDir, f));
    const symbolMap = new Map();
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
    const importEdges = [];
    const callEdges = [];
    const symbolIndexByName = new Map();
    for (const s of symbols) {
        if (!symbolIndexByName.has(s.name)) {
            symbolIndexByName.set(s.name, []);
        }
        symbolIndexByName.get(s.name).push(s.id);
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
                    calleeName: r.toSymbol ?? node_path_1.default.basename(toFile),
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
