# GraphCLI

![GraphCLI logo](graphcli-logo.svg)

Token-efficient, graph-powered code context for AI-assisted code review.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

GraphCLI builds a code graph, prunes around your target, and generates compact review packets instead of dumping entire repositories into an LLM.

## What it does

- Indexes source into a graph of symbols, imports, and call edges.
- Prunes upstream and downstream dependencies around a target file or symbol.
- Enforces token budgets with priority-based packing.
- Produces Markdown, XML, and packet outputs for review workflows.
- Supports Tree-sitter, universal parsing, and LSP-backed semantic indexing.

## Quick Start

```bash
npm install
npm run build
```

Generate a compact packet for the active file:

```bash
npm run dev -- --root . --target-file src/cli.ts --backend universal --provider auto --compression ultra --output-format packet --context-out smart-context.packet.json --hard-cap --max-tokens 2500
```

One-click review mode:

```bash
npm run one-click -- --root . --backend universal --provider auto --compression ultra --task "review this patch"
```

Fast profile:

```bash
npm run one-click:fast -- --root . --task "review this patch"
```

## Key Commands

```bash
# Tree-sitter AST mode
npm run dev -- --root . --target-file src/cli.ts --backend treesitter --upstream-depth 2 --downstream-depth 1

# LSP semantic mode
npm run dev -- --root . --target-file src/cli.ts --backend lsp --lsp-index lsp-index.example.json --context-out smart-context-lsp.md

# Strict budget + symbol targeting
npm run dev -- --root . --target-file src/cli.ts --target-symbol generateContextMarkdown --backend universal --max-tokens 1800 --hard-cap --output-format xml --context-out smart-context.xml --upstream-depth 2 --downstream-depth 1

# Watch mode
npm run dev -- --root . --target-file src/cli.ts --backend universal --watch

# MCP server
npm run serve:mcp
```

## Output Files

Common outputs include:

- smart-context-graph.json
- smart-context.md
- smart-context.packet.json
- smart-context.xml
- smart-context.prompt.md
- smart-context.share.json
- smart-context.changed.json
- smart-context.token-report.json
- smart-context.token-report.html
- smart-context.communities.json
- smart-context.flows.json
- smart-context.architecture.json

## Benchmarks

```bash
npm run benchmark -- .
npm run benchmark:gate -- .
npm run benchmark:trend -- .
```

## VS Code Wrapper

Workspace tasks:

- GraphCLI: Active File (fast)
- GraphCLI: One Click (fast)

Package the wrapper extension:

```bash
npm run vscode-ext:package
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, branching, PR checklist, and quality expectations.

## License

GraphCLI is licensed under the MIT License. See [LICENSE](LICENSE).
