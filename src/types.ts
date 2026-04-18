export type SymbolKind =
  | "class"
  | "interface"
  | "function"
  | "method"
  | "variable"
  | "type"
  | "import"
  | "file";

export interface SymbolSummary {
  id: string;
  name: string;
  kind: SymbolKind;
  file: string;
  signature: string;
  exported: boolean;
  locStart: number;
  locEnd: number;
}

export interface ImportEdge {
  fromFile: string;
  toFile: string;
  specifiers: string[];
}

export interface CallEdge {
  callerSymbolId: string;
  calleeName: string;
}

export interface GraphData {
  files: string[];
  symbols: SymbolSummary[];
  importEdges: ImportEdge[];
  callEdges: CallEdge[];
  generatedAt: string;
}

export interface HotPathScore {
  file: string;
  churn: number;
  weightedChurn: number;
}

export interface ContextRequest {
  targetFile: string;
  targetSymbol?: string;
  upstreamDepth: number;
  downstreamDepth: number;
  includeHotPathTopN: number;
}

export interface PrunedContextSelection {
  targetFile: string;
  includedFiles: string[];
  interfaceOnlyFiles: string[];
  reasonByFile: Record<string, string[]>;
  prioritizedSymbolsByFile: Record<string, string[]>;
}

export type ParserBackend = "ts-morph" | "lsp" | "universal" | "treesitter";

export interface ParserIndexOptions {
  lspIndexPath?: string;
}

export interface ContextBudget {
  maxTokens: number;
  hardCap: boolean;
}

export type AiProvider =
  | "auto"
  | "claude"
  | "chatgpt"
  | "gpt"
  | "codex"
  | "copilot"
  | "gemini"
  | "cursor"
  | "windsurf"
  | "continue"
  | "kiro"
  | "deepseek"
  | "qwen"
  | "mistral"
  | "grok"
  | "perplexity"
  | "other";

export type CompressionMode = "ultra" | "minimal" | "balanced";
