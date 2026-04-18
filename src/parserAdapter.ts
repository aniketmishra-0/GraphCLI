import { indexProject as tsMorphIndexProject } from "./indexer";
import { indexProjectUniversal } from "./universalIndexer";
import { indexProjectFromLsp } from "./lspSemanticAdapter";
import { indexProjectTreeSitter } from "./treeSitterAdapter";
import { GraphData, ParserBackend, ParserIndexOptions } from "./types";

export interface ParserAdapter {
  backend: ParserBackend;
  index(baseDir: string, includeGlobs: string[], options?: ParserIndexOptions): GraphData;
}

class TsMorphParserAdapter implements ParserAdapter {
  backend: ParserBackend = "ts-morph";

  index(baseDir: string, includeGlobs: string[]): GraphData {
    return tsMorphIndexProject(baseDir, includeGlobs);
  }
}

class LspParserAdapter implements ParserAdapter {
  backend: ParserBackend = "lsp";

  index(baseDir: string, _includeGlobs: string[], options?: ParserIndexOptions): GraphData {
    if (!options?.lspIndexPath) {
      throw new Error(
        "LSP backend requires --lsp-index <path>. Provide a JSON index with files, symbols, and references.",
      );
    }
    return indexProjectFromLsp(baseDir, options.lspIndexPath);
  }
}

class UniversalParserAdapter implements ParserAdapter {
  backend: ParserBackend = "universal";

  index(baseDir: string, _includeGlobs: string[]): GraphData {
    return indexProjectUniversal(baseDir);
  }
}

class TreeSitterParserAdapter implements ParserAdapter {
  backend: ParserBackend = "treesitter";

  index(baseDir: string, _includeGlobs: string[]): GraphData {
    return indexProjectTreeSitter(baseDir);
  }
}

export function createParserAdapter(backend: ParserBackend): ParserAdapter {
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
