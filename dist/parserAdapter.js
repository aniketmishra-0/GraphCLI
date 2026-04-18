"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createParserAdapter = createParserAdapter;
const indexer_1 = require("./indexer");
const universalIndexer_1 = require("./universalIndexer");
const lspSemanticAdapter_1 = require("./lspSemanticAdapter");
const treeSitterAdapter_1 = require("./treeSitterAdapter");
class TsMorphParserAdapter {
    constructor() {
        this.backend = "ts-morph";
    }
    index(baseDir, includeGlobs) {
        return (0, indexer_1.indexProject)(baseDir, includeGlobs);
    }
}
class LspParserAdapter {
    constructor() {
        this.backend = "lsp";
    }
    index(baseDir, _includeGlobs, options) {
        if (!options?.lspIndexPath) {
            throw new Error("LSP backend requires --lsp-index <path>. Provide a JSON index with files, symbols, and references.");
        }
        return (0, lspSemanticAdapter_1.indexProjectFromLsp)(baseDir, options.lspIndexPath);
    }
}
class UniversalParserAdapter {
    constructor() {
        this.backend = "universal";
    }
    index(baseDir, _includeGlobs) {
        return (0, universalIndexer_1.indexProjectUniversal)(baseDir);
    }
}
class TreeSitterParserAdapter {
    constructor() {
        this.backend = "treesitter";
    }
    index(baseDir, _includeGlobs) {
        return (0, treeSitterAdapter_1.indexProjectTreeSitter)(baseDir);
    }
}
function createParserAdapter(backend) {
    if (backend === "ts-morph") {
        return new TsMorphParserAdapter();
    }
    if (backend === "treesitter") {
        return new TreeSitterParserAdapter();
    }
    if (backend === "universal") {
        return new UniversalParserAdapter();
    }
    return new LspParserAdapter();
}
