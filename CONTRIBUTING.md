# Contributing to GraphCLI

Thanks for your interest in contributing.

This guide explains how to propose changes, run checks, and submit high-quality pull requests.

## Ground Rules

- Be respectful and constructive in issues and code reviews.
- Prefer small, focused pull requests over broad refactors.
- Discuss significant architectural changes in an issue before implementation.

## Development Setup

1. Fork and clone the repository.
2. Install dependencies.
3. Build once to verify local setup.

```bash
npm install
npm run build
```

Useful scripts:

```bash
npm run dev -- --root . --target-file src/cli.ts --backend universal
npm run one-click -- --root . --backend universal --task "review this patch"
npm run postprocess -- .
npm run benchmark -- .
npm run benchmark:gate -- .
```

## Branching and Commits

- Create feature branches from main.
- Use clear commit messages that explain intent.
- Keep unrelated changes out of the same PR.

Suggested commit style:

```text
feat: add symbol-weighted pruning for downstream ranking
fix: avoid duplicate external dependency nodes
docs: improve one-click usage examples
```

## Code Quality Expectations

Before opening a PR, ensure:

- TypeScript build passes.
- Benchmarks run successfully.
- Token reduction quality is not regressed.
- New behavior is covered by tests or validation steps.

Recommended pre-PR checks:

```bash
npm run build
npm run one-click:fast -- --root . --task "review this patch"
npm run benchmark -- .
npm run benchmark:gate -- .
```

## Pull Request Checklist

- Describe what changed and why.
- Link related issue(s).
- Add before/after impact notes for token usage, latency, or context quality.
- Include sample command and output artifacts when behavior changes.
- Update README or docs when user-facing behavior changes.

## Reporting Bugs

Please include:

- Operating system and Node version.
- Exact command used.
- Target file and backend.
- Repro steps and expected vs actual behavior.
- Relevant output files (for example smart-context.packet.json, benchmark reports).

## Feature Requests

A strong feature request includes:

- Problem statement.
- Proposed CLI/API shape.
- Trade-offs and compatibility considerations.
- Example usage and expected output.

## Security

If you discover a security-sensitive issue, avoid public disclosure first. Open a private report with maintainers and include reproducible details.

## License for Contributions

By contributing, you agree that your contributions will be licensed under the MIT License of this repository.
