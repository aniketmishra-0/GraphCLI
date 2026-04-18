const vscode = require("vscode");
const path = require("path");

function shellTask(name, command, cwd) {
  const execution = new vscode.ShellExecution(command, { cwd });
  return new vscode.Task(
    { type: "shell" },
    vscode.TaskScope.Workspace,
    name,
    "graphcli-wrapper",
    execution,
    []
  );
}

function runCommandInTerminal(name, command, cwd) {
  const terminal = vscode.window.createTerminal({ name, cwd });
  terminal.show(true);
  terminal.sendText(command);
}

function workspaceFolder() {
  const ws = vscode.workspace.workspaceFolders;
  if (!ws || ws.length === 0) {
    vscode.window.showErrorMessage("Open a workspace folder first.");
    return null;
  }
  return ws[0].uri.fsPath;
}

async function openTokenDashboard(root) {
  const dashboardUri = vscode.Uri.file(path.join(root, "smart-context.token-report.html"));
  try {
    await vscode.commands.executeCommand("vscode.open", dashboardUri);
  } catch (_error) {
    await vscode.env.openExternal(dashboardUri);
  }
}

function activate(context) {
  const runActive = vscode.commands.registerCommand("graphcli.runActiveFast", async () => {
    const root = workspaceFolder();
    if (!root) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("Open a file in the editor first.");
      return;
    }

    const filePath = vscode.workspace.asRelativePath(editor.document.uri.fsPath, false);
    const cmd = `npm run dev -- --root . --target-file \"${filePath}\" --backend treesitter --provider auto --compression ultra --output-format packet --context-out smart-context.packet.json --hard-cap --max-tokens 2200`;
    const task = shellTask("GraphCLI: Active File (fast)", cmd, root);
    await vscode.tasks.executeTask(task);
  });

  const runOneClick = vscode.commands.registerCommand("graphcli.runOneClickFast", async () => {
    const root = workspaceFolder();
    if (!root) return;

    const cmd = "npm run one-click -- --root . --backend treesitter --provider auto --compression ultra --hard-cap --max-tokens 2200 --task \"review this patch\"";
    const task = shellTask("GraphCLI: One Click (fast)", cmd, root);
    await vscode.tasks.executeTask(task);
  });

  const runWatchActive = vscode.commands.registerCommand("graphcli.runWatchActiveFast", async () => {
    const root = workspaceFolder();
    if (!root) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("Open a file in the editor first.");
      return;
    }

    const filePath = vscode.workspace.asRelativePath(editor.document.uri.fsPath, false);
    const cmd = `npm run dev -- --root . --target-file \"${filePath}\" --backend universal --provider auto --compression ultra --output-format packet --context-out smart-context.packet.json --hard-cap --max-tokens 2500 --generate-prompt --token-dashboard-refresh-sec 3 --watch`;

    runCommandInTerminal("GraphCLI: Watch Active (fast)", cmd, root);
  });

  const openDashboard = vscode.commands.registerCommand("graphcli.openTokenDashboard", async () => {
    const root = workspaceFolder();
    if (!root) return;
    await openTokenDashboard(root);
  });

  const runOneClickAndOpenDashboard = vscode.commands.registerCommand(
    "graphcli.runOneClickAndOpenDashboard",
    async () => {
      const root = workspaceFolder();
      if (!root) return;

      const cmd = "npm run one-click -- --root . --backend universal --provider auto --compression ultra --hard-cap --max-tokens 2200 --task \"review this patch\" --token-dashboard-refresh-sec 3";
      const taskName = "GraphCLI: One Click + Dashboard";
      const task = shellTask(taskName, cmd, root);

      const disposable = vscode.tasks.onDidEndTaskProcess(async (event) => {
        if (event.execution.task.name === taskName) {
          disposable.dispose();
          if (event.exitCode === 0) {
            await openTokenDashboard(root);
            vscode.window.showInformationMessage("GraphCLI run completed. Token dashboard opened.");
          } else {
            vscode.window.showWarningMessage("GraphCLI run failed. Check terminal output.");
          }
        }
      });

      await vscode.tasks.executeTask(task);
    },
  );

  context.subscriptions.push(
    runActive,
    runOneClick,
    runWatchActive,
    openDashboard,
    runOneClickAndOpenDashboard,
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
