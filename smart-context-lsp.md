# SMART_CONTEXT_MAP
target_file: src/cli.ts
generated_at: 2026-04-18T20:05:50.991Z
included_files_count: 3

# CONTEXT_POLICY
- upstream: include imported definition summaries
- downstream: include interface-only summaries unless explicitly requested
- omit function bodies to reduce token usage
- max_tokens: 1200
- hard_cap: true

# HOT_PATH
- (none)

# TOKEN_USAGE_ESTIMATE
- estimated_tokens=263
- budget_tokens=1200

## FILE: src/cli.ts
REASONS: target
MODE: full-symbol-summary

### Imports
- src/context.ts :: [generateContextMarkdown]
- src/prune.ts :: [pruneDependencies]

### Symbols
- function execute | exported=false | loc=59-111 | sig=function execute(): void

## FILE: src/context.ts
REASONS: upstream_import:src/cli.ts
MODE: full-symbol-summary

### Imports
- (none)

### Symbols
- function generateContextMarkdown | exported=true | loc=57-122 | sig=function generateContextMarkdown(...)

## FILE: src/prune.ts
REASONS: upstream_import:src/cli.ts
MODE: full-symbol-summary

### Imports
- (none)

### Symbols
- function pruneDependencies | exported=true | loc=63-132 | sig=function pruneDependencies(...)
