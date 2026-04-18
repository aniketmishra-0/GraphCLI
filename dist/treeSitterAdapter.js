"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.indexProjectTreeSitter = indexProjectTreeSitter;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const tree_sitter_1 = __importDefault(require("tree-sitter"));
const tree_sitter_javascript_1 = __importDefault(require("tree-sitter-javascript"));
const tree_sitter_typescript_1 = __importDefault(require("tree-sitter-typescript"));
const tree_sitter_python_1 = __importDefault(require("tree-sitter-python"));
const universalIndexer_1 = require("./universalIndexer");
const EXT_TO_LANGUAGE = {
    ".js": tree_sitter_javascript_1.default,
    ".jsx": tree_sitter_javascript_1.default,
    ".mjs": tree_sitter_javascript_1.default,
    ".cjs": tree_sitter_javascript_1.default,
    ".ts": tree_sitter_typescript_1.default.typescript,
    ".tsx": tree_sitter_typescript_1.default.tsx,
    ".py": tree_sitter_python_1.default,
    ".pyi": tree_sitter_python_1.default,
};
function normalizePath(baseDir, absolutePath) {
    return node_path_1.default.relative(baseDir, absolutePath).replace(/\\/g, "/");
}
function collectFiles(baseDir) {
    const out = [];
    const stack = [baseDir];
    while (stack.length > 0) {
        const dir = stack.pop();
        const entries = node_fs_1.default.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name.startsWith("."))
                continue;
            if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "build")
                continue;
            const absPath = node_path_1.default.join(dir, entry.name);
            if (entry.isDirectory()) {
                stack.push(absPath);
            }
            else if (entry.isFile()) {
                out.push(absPath);
            }
        }
    }
    return out;
}
function nodeText(source, node) {
    return source.slice(node.startIndex, node.endIndex);
}
function getNamedChild(node, field) {
    try {
        return node.childForFieldName(field);
    }
    catch {
        return null;
    }
}
function symbolId(file, kind, name, line) {
    return `${file}::${kind}::${name}::L${line}`;
}
function pushSymbol(symbols, file, kind, name, signature, exported, startLine, endLine) {
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
function parseJsTsFile(file, source, parser, symbols, importEdges, callEdges) {
    const tree = parser.parse(source);
    const stack = [tree.rootNode];
    const symbolByLine = new Map();
    while (stack.length > 0) {
        const node = stack.pop();
        if (node.type === "import_statement") {
            const srcNode = getNamedChild(node, "source");
            if (srcNode) {
                const raw = nodeText(source, srcNode).replace(/^['\"]|['\"]$/g, "");
                const toFile = raw.startsWith(".")
                    ? node_path_1.default.normalize(node_path_1.default.join(node_path_1.default.dirname(file), raw)).replace(/\\/g, "/")
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
                const kind = node.type === "method_definition" ? "method" : "function";
                pushSymbol(symbols, file, kind, name, `${kind} ${name}`, true, line, node.endPosition.row + 1);
                symbolByLine.set(line, symbolId(file, kind, name, line));
            }
        }
        if (node.type === "call_expression") {
            const fnNode = getNamedChild(node, "function");
            const name = fnNode ? nodeText(source, fnNode) : "unknown";
            let callerSymbolId;
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
            if (child)
                stack.push(child);
        }
    }
}
function parsePythonFile(file, source, parser, symbols, importEdges, callEdges) {
    const tree = parser.parse(source);
    const stack = [tree.rootNode];
    const symbolByLine = new Map();
    while (stack.length > 0) {
        const node = stack.pop();
        if (node.type === "import_statement" || node.type === "import_from_statement") {
            const text = nodeText(source, node);
            const m = text.match(/(?:from|import)\s+([A-Za-z0-9_\.]+)/);
            if (m) {
                const spec = m[1];
                const toFile = spec.startsWith(".")
                    ? node_path_1.default.normalize(node_path_1.default.join(node_path_1.default.dirname(file), spec)).replace(/\\/g, "/")
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
            let callerSymbolId;
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
            if (child)
                stack.push(child);
        }
    }
}
function indexProjectTreeSitter(baseDir) {
    const universal = (0, universalIndexer_1.indexProjectUniversal)(baseDir);
    const parser = new tree_sitter_1.default();
    const symbols = [];
    const importEdges = [];
    const callEdges = [];
    const filesAbs = collectFiles(baseDir);
    const files = filesAbs.map((f) => normalizePath(baseDir, f));
    for (const absFile of filesAbs) {
        const relFile = normalizePath(baseDir, absFile);
        const ext = node_path_1.default.extname(absFile).toLowerCase();
        const lang = EXT_TO_LANGUAGE[ext];
        if (!lang)
            continue;
        const source = node_fs_1.default.readFileSync(absFile, "utf8");
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
        }
        else if ([".py", ".pyi"].includes(ext)) {
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
    };
    return merged;
}
