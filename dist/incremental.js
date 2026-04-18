"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectChangedFiles = detectChangedFiles;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = require("node:crypto");
function hashFile(absPath) {
    const content = node_fs_1.default.readFileSync(absPath);
    return (0, node_crypto_1.createHash)("sha1").update(content).digest("hex");
}
function collectRepoFiles(baseDir) {
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
            const abs = node_path_1.default.join(dir, entry.name);
            if (entry.isDirectory()) {
                stack.push(abs);
            }
            else if (entry.isFile()) {
                out.push(abs);
            }
        }
    }
    return out;
}
function rel(baseDir, absPath) {
    return node_path_1.default.relative(baseDir, absPath).replace(/\\/g, "/");
}
function detectChangedFiles(baseDir) {
    const cachePath = node_path_1.default.join(baseDir, ".smart-context-cache.json");
    const currentFiles = collectRepoFiles(baseDir);
    const previous = node_fs_1.default.existsSync(cachePath)
        ? JSON.parse(node_fs_1.default.readFileSync(cachePath, "utf8"))
        : { hashes: {}, updatedAt: "" };
    const nextHashes = {};
    const changed = [];
    for (const absPath of currentFiles) {
        const file = rel(baseDir, absPath);
        const hash = hashFile(absPath);
        nextHashes[file] = hash;
        if (previous.hashes[file] !== hash) {
            changed.push(file);
        }
    }
    const cacheData = {
        hashes: nextHashes,
        updatedAt: new Date().toISOString(),
    };
    node_fs_1.default.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), "utf8");
    return changed.sort();
}
