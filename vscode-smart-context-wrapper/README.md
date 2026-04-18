# AI GraphCLI Extension

This VS Code extension adds IDE-first Command Palette actions for AI GraphCLI workflows.

Commands:
- AI GraphCLI: Run Active File (Fast)
- AI GraphCLI: Run One-Click (Fast)
- AI GraphCLI: Run Active File Watch (Fast)
- AI GraphCLI: Open Token Dashboard
- AI GraphCLI: One-Click + Open Dashboard

## Local development usage

1. Open this folder in VS Code.
2. Run `Developer: Install Extension from Location...`.
3. Select `vscode-smart-context-wrapper`.
4. Open Command Palette and run either AI GraphCLI command.

Recommended flow:
1. Run `AI GraphCLI: One-Click + Open Dashboard`.
2. Inspect token usage in the dashboard.
3. For continuous updates, run `AI GraphCLI: Run Active File Watch (Fast)`.

## Package VSIX

From repository root:

```bash
npm run vscode-ext:package
```
