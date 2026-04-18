"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.indexProjectUniversal = indexProjectUniversal;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = require("node:crypto");
const EXT_TO_LANG = {
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
const LANGUAGE_PATTERNS = {
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
const GENERIC_PATTERN = {
    importPatterns: [/^\s*import\s+.*?([A-Za-z0-9_\.\/-]+)\s*;?$/gm, /^\s*#include\s+[<"]([^>"]+)[>"]/gm],
    classPatterns: [/\bclass\s+([A-Za-z_][A-Za-z0-9_]*)/g, /\bstruct\s+([A-Za-z_][A-Za-z0-9_]*)/g],
    functionPatterns: [/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(.*?\)\s*\{/g],
    methodPatterns: [/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(.*?\)\s*\{/g],
    interfacePatterns: [/\binterface\s+([A-Za-z_][A-Za-z0-9_]*)/g],
    typePatterns: [/\btype\s+([A-Za-z_][A-Za-z0-9_]*)\b/g],
};
function normalizePath(baseDir, absolutePath) {
    return node_path_1.default.relative(baseDir, absolutePath).replace(/\\/g, "/");
}
function getLanguage(file) {
    return EXT_TO_LANG[node_path_1.default.extname(file).toLowerCase()] ?? "generic";
}
function patternSetFor(file) {
    const lang = getLanguage(file);
    return LANGUAGE_PATTERNS[lang] ?? GENERIC_PATTERN;
}
function hashText(text) {
    return (0, node_crypto_1.createHash)("sha1").update(text).digest("hex");
}
function buildSymbolId(file, kind, name, index) {
    return `${file}::${kind}::${name}::I${index}`;
}
function findAllMatches(text, pattern) {
    const out = [];
    for (const m of text.matchAll(pattern)) {
        if (m[1])
            out.push(m[1]);
    }
    return out;
}
function collectFiles(baseDir) {
    const files = [];
    const stack = [baseDir];
    while (stack.length > 0) {
        const dir = stack.pop();
        const entries = node_fs_1.default.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name.startsWith("."))
                continue;
            if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "build")
                continue;
            const abs = node_path_1.default.join(dir, entry.name);
            if (entry.isDirectory()) {
                stack.push(abs);
            }
            else if (entry.isFile()) {
                const ext = node_path_1.default.extname(abs).toLowerCase();
                if (EXT_TO_LANG[ext]) {
                    files.push(abs);
                }
            }
        }
    }
    return files;
}
function resolveImport(fromFile, specifier) {
    if (specifier.startsWith(".")) {
        const base = node_path_1.default.dirname(fromFile);
        return node_path_1.default.normalize(node_path_1.default.join(base, specifier)).replace(/\\/g, "/");
    }
    return `external:${specifier}`;
}
function indexProjectUniversal(baseDir) {
    const filesAbs = collectFiles(baseDir);
    const files = filesAbs.map((f) => normalizePath(baseDir, f));
    const symbols = [];
    const importEdges = [];
    const callEdges = [];
    for (const absoluteFile of filesAbs) {
        const relFile = normalizePath(baseDir, absoluteFile);
        const text = node_fs_1.default.readFileSync(absoluteFile, "utf8");
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
        const registerSymbols = (kind, pats) => {
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
