# GraphCLI

![GraphCLI logo](graphcli-logo.svg)

GraphCLI is an advanced, IDE-agnostic code context engine focused on minimizing LLM token usage by avoiding full-repository reads.

## Completed Phases

1. Multi-backend parser architecture
- Backends: ts-morph, lsp scaffold, universal multi-language parser.

2. Incremental indexing
- File hash cache detects changed files in .smart-context-cache.json.

3. Symbol-aware dependency pruning
- Upstream/downstream closure with target-symbol prioritization.

4. Token-budget context composition
- Hard-cap budget packing with priority ranking and omitted internals.

5. Risk scoring
- Change risk based on blast radius, fan-out, fan-in, and symbol churn.

6. Storage and integration
- SQLite graph persistence in .smart-context-map.db.
- JSON graph export and Markdown or XML context outputs.

7. Watch mode
- Continuous rebuild on file change.

8. Tree-sitter true AST backend
- Real AST parsing for JS/TS/TSX/Python using tree-sitter grammars.
- Hybrid fallback to universal parser for unsupported languages.

9. MCP mature tool catalog (20+ tools)
- Graph build/query, impact, minimal/review context, semantic search,
  detect changes, communities, flows, architecture, hubs/bridges,
  external deps, graph import/export.

10. Postprocess and benchmark pipeline
- Community detection, flow tracing, architecture summaries.
- Benchmark suite for latency, token ratio, retrieval quality.

## What it does

- Indexes JS/TS files into a graph of symbols, imports, and lightweight call edges.
- Prunes dependencies around a target file into upstream and downstream slices.
- Generates a single Markdown context file designed for LLM review prompts.
- Adds hot-path ranking from Git change history to prioritize high-churn files.
- Enforces token budgets with priority-based packing.
- Supports parser adapter architecture (`ts-morph` now, `lsp` adapter scaffolded).
- Supports universal multi-language indexing with language-specific regex maps and generic fallback.
- Supports symbol-targeted context for tighter pruning.
- Persists full graph to local SQLite for fast downstream queries.
- Supports markdown and xml context generation.

## Architecture (IDE agnostic)

1. Core Engine (CLI-first)
- Parse project with Tree-sitter or LSP-backed adapters.
- Normalize extracted data into a language-neutral graph schema.
- Persist graph in JSON and optionally vectorize symbol docs.

2. Pruning and Context Composer
- Input: target file or target symbol.
- Traverse import and usage edges with depth limits.
- Apply context policy: full summary for target + upstream, interface-only for downstream.
- Emit single context artifact in Markdown/XML.

3. Integration Layer
- Node CLI command for direct use and CI.
- Thin adapters for VS Code, IntelliJ, Vim/Neovim to call CLI and open output.
- Optional daemon mode for incremental re-index.

## Data Flow Logic

- File watcher or manual trigger starts indexing.
- Parser adapters emit symbol and edge events.
- Graph store updates nodes and edge weights.
- User selects target file/function.
- Pruner computes upstream/downstream minimal closure.
- Composer writes smart-context.md for the LLM.

## Dependency Pruning Logic

- Upstream graph: import dependencies (A imports B => A -> B).
- Downstream graph: reverse import dependencies (B <- A).
- BFS with max depth over both graphs.
- Keep downstream as interface-only by default to avoid over-fetching internals.

## Hot Path Analysis

- Use git history to compute churn score per file:
  - score(file) = commits_touching_file over rolling time window.
- Prioritize top N churn files in output metadata and ranking.

## Usage

1. Install deps

```bash
npm install
```

Published CLI usage (after npm publish):

```bash
npx graphcli --root . --target-file src/cli.ts --backend treesitter --output-format packet --hard-cap --max-tokens 2200
```

2. Run

```bash
npm run dev -- --root . --target-file src/cli.ts --backend universal --upstream-depth 2 --downstream-depth 1 --top-hot 10
```

Tree-sitter AST mode:

```bash
npm run dev -- --root . --target-file src/cli.ts --backend treesitter --upstream-depth 2 --downstream-depth 1
```

Universal minimum-token mode (recommended for any AI: Claude, GPT, Gemini):

```bash
npm run dev -- --root . --target-file src/cli.ts --backend universal --provider auto --compression ultra --output-format packet --context-out smart-context.packet.json --hard-cap --max-tokens 2500
```

Supported provider targets:
- claude, chatgpt, gpt, codex, copilot, gemini
- cursor, windsurf, continue, kiro
- deepseek, qwen, mistral, grok, perplexity
- auto, other

Example (Codex-focused):

```bash
npm run one-click -- --root . --backend universal --provider codex --compression ultra --task "review this patch"
```

Two-stage mode (minimum burn first, expand only if needed):

```bash
npm run dev -- --root . --target-file src/cli.ts --backend universal --provider auto --compression ultra --output-format packet --two-stage --stage1-out smart-context.stage1.packet.json --stage2-out smart-context.stage2.packet.json --generate-prompt --prompt-out smart-context.prompt.md --task "review this patch"
```

One-click mode (auto-detect changes + build shareable payload):

```bash
npm run one-click -- --root . --backend universal --provider auto --compression ultra --task "review this patch"
```

Fast profile (recommended default for lower latency):

```bash
npm run one-click:fast -- --root . --task "review this patch"
```

One-click outputs:
- smart-context.stage1.packet.json
- smart-context.stage2.packet.json
- smart-context.prompt.md
- smart-context.share.json
- smart-context.changed.json

Token usage dashboard outputs:
- smart-context.token-report.json
- smart-context.token-report.html

Auto-refresh dashboard (useful with --watch):

```bash
npm run dev -- --root . --target-file src/cli.ts --backend universal --output-format packet --hard-cap --max-tokens 2500 --generate-prompt --token-dashboard-refresh-sec 3 --watch
```

## MCP Server Mode

Run MCP server (stdio transport):

```bash
npm run serve:mcp
```

Built-in MCP tools:
- build_or_update_graph
- list_graph_stats
- get_impact_radius
- get_minimal_context
- query_graph
- get_review_context
- list_files
- get_file_symbols
- semantic_search_nodes
- find_large_functions
- detect_changes
- list_flows
- get_flow
- get_affected_flows
- list_communities
- get_community
- get_architecture_overview
- get_hub_nodes
- get_bridge_nodes
- get_hot_paths
- run_postprocess
- benchmark_workflow
- export_graph
- import_graph
- list_external_dependencies

This gives a server-oriented workflow similar to graph-first review systems while preserving low-token packet generation.

### Modular MCP Structure

Server is split by domain (hardening pass):
- core tools: src/mcp/tools/core.ts
- review tools: src/mcp/tools/review.ts
- flows tools: src/mcp/tools/flows.ts
- communities tools: src/mcp/tools/communities.ts
- analysis tools: src/mcp/tools/analysis.ts
- registry tools: src/mcp/tools/registry.ts

This mirrors mature ecosystem layouts and keeps tool categories isolated and maintainable.

### Image-like Token Comparison

Use MCP tool `compare_token_efficiency` to produce side-by-side metrics similar to
"Without Graph vs With Graph" view (tokens + quality + multiplier).

It returns:
- estimated tokens without graph
- estimated tokens with graph packet
- quality scores
- multiplier (e.g. 6.8x fewer tokens)

## Postprocess Pipeline

Run graph post-processing:

```bash
npm run postprocess -- .
```

Outputs:
- smart-context.communities.json
- smart-context.flows.json
- smart-context.architecture.json

## Benchmark Suite

Run benchmark workflow:

```bash
npm run benchmark -- .
```

Output:
- smart-context-benchmark.json

Metrics included:
- latency (index/persist/packet/postprocess/total)
- token reduction ratio vs naive graph dump
- retrieval quality summary

10x token-efficiency guard:

```bash
npm run benchmark:gate -- .
```

This command fails if token reduction ratio drops below 10x.

Benchmark trend snapshot:

```bash
npm run benchmark:trend -- .
```

This appends latest metrics to `smart-context-benchmark-history.json`.

## VS Code Wrapper

This repo includes workspace tasks in `.vscode/tasks.json`:
- GraphCLI: Active File (fast)
- GraphCLI: One Click (fast)

Run from Command Palette: `Tasks: Run Task`.

For direct commands in Command Palette, a lightweight wrapper extension is included in
`vscode-smart-context-wrapper` with commands:
- GraphCLI: Run Active File (Fast)
- GraphCLI: Run One-Click (Fast)

Package extension VSIX:

```bash
npm run vscode-ext:package
```

## CI

GitHub Actions pipeline is configured in `.github/workflows/ci.yml` and runs:
- build
- one-click generation (fast profile)
- postprocess
- benchmark
- benchmark trend update
- benchmark gate (>=10x token reduction)

Benchmark files are uploaded as CI artifacts:
- smart-context-benchmark.json
- smart-context-benchmark-history.json
- smart-context.token-report.json

## Release

Tag-based npm publish is configured in `.github/workflows/release.yml`.

To publish, push a version tag like:

```bash
git tag v0.1.1
git push origin v0.1.1
```

Required repository secret:
- `NPM_TOKEN`

LSP semantic mode:

```bash
npm run dev -- --root . --target-file src/cli.ts --backend lsp --lsp-index lsp-index.example.json --context-out smart-context-lsp.md
```

Advanced example (strict budget + symbol targeting + XML):

```bash
npm run dev -- --root . --target-file src/cli.ts --target-symbol generateContextMarkdown --backend universal --max-tokens 1800 --hard-cap --output-format xml --context-out smart-context.xml --upstream-depth 2 --downstream-depth 1
```

Watch mode:

```bash
npm run dev -- --root . --target-file src/cli.ts --backend universal --watch
```

3. Outputs
- smart-context-graph.json
- smart-context.md
- smart-context.packet.json
- smart-context.stage1.packet.json
- smart-context.stage2.packet.json
- smart-context.prompt.md
- .smart-context-map.db
- .smart-context-cache.json

## LSP semantic index schema

When using backend=lsp, provide a JSON file with:
- files: list of workspace-relative file paths
- symbols: language-server symbols with kind/signature/ranges
- references: semantic links with kind in [import, call, reference]

Example file: lsp-index.example.json

This enables semantic definitions/references/callers-callees ingestion from any IDE or plugin that can export LSP results.

## How this maps to Tree-sitter and LSP

- Tree-sitter adapter: fast structural parse, stable across many languages.
- LSP adapter: semantic richness (definitions, references, types) where server support is strong.
- Unified schema lets the same pruner/composer logic work regardless of parser backend.

## Language support

Universal backend supports many languages with specialized or generic extraction:
- TypeScript, JavaScript, Python, Java, Kotlin, Swift, Go, Rust, Ruby, PHP
- C, C++, C#, F#, Scala, Lua, Dart, R, Perl, Solidity, Vue SFC
- SQL, Shell, PowerShell, Julia, Haskell, Clojure, Elixir, Erlang
- Zig, Nim, Groovy/Gradle, Haxe, Objective-C and more through generic structural fallback.

Note:
- For maximum semantic precision (exact type-resolution and cross-file symbol linking), implement the LSP backend wiring in src/parserAdapter.ts.
