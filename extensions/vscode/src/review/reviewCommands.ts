import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import * as vscode from "vscode";

let reviewOutputChannel: vscode.OutputChannel | undefined;

function getReviewOutputChannel(): vscode.OutputChannel {
  reviewOutputChannel ??=
    vscode.window.createOutputChannel("Prometheus Review");
  return reviewOutputChannel;
}

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function findCliEntryPoint(extensionContext: vscode.ExtensionContext) {
  const candidates = [
    path.join(extensionContext.extensionPath, "cli", "dist", "cn.js"),
    path.resolve(extensionContext.extensionPath, "..", "cli", "dist", "cn.js"),
    path.resolve(
      extensionContext.extensionPath,
      "..",
      "..",
      "extensions",
      "cli",
      "dist",
      "cn.js",
    ),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

function getNodeExecutable(): string {
  const executableName = path.basename(process.execPath).toLowerCase();
  return executableName === "node" || executableName === "node.exe"
    ? process.execPath
    : "node";
}

async function runCliReviewCommand(
  extensionContext: vscode.ExtensionContext,
  args: string[],
  title: string,
) {
  const cwd = getWorkspaceRoot();
  if (!cwd) {
    void vscode.window.showErrorMessage(
      "Open a workspace folder before running Prometheus review commands.",
    );
    return;
  }

  const cliEntryPoint = findCliEntryPoint(extensionContext);
  if (!cliEntryPoint) {
    void vscode.window.showErrorMessage(
      "Prometheus CLI build was not found. Build extensions/cli before running review commands from the extension.",
    );
    return;
  }

  const output = getReviewOutputChannel();
  const nodeExecutable = getNodeExecutable();
  output.clear();
  output.show(true);
  output.appendLine(`$ ${nodeExecutable} ${cliEntryPoint} ${args.join(" ")}`);
  output.appendLine(`cwd: ${cwd}`);
  output.appendLine("");

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title,
      cancellable: true,
    },
    async (_progress, token) =>
      new Promise<void>((resolve) => {
        const child = spawn(nodeExecutable, [cliEntryPoint, ...args], {
          cwd,
          env: {
            ...process.env,
            FORCE_COLOR: "0",
            NO_COLOR: "1",
          },
          windowsHide: true,
        });

        token.onCancellationRequested(() => {
          child.kill();
        });

        child.stdout.on("data", (data: Buffer) => {
          output.append(stripAnsi(data.toString()));
        });

        child.stderr.on("data", (data: Buffer) => {
          output.append(stripAnsi(data.toString()));
        });

        child.on("error", (error) => {
          output.appendLine("");
          output.appendLine(`Failed to run command: ${error.message}`);
          void vscode.window.showErrorMessage(
            `Prometheus review command failed: ${error.message}`,
          );
          resolve();
        });

        child.on("close", (code, signal) => {
          output.appendLine("");
          if (signal) {
            output.appendLine(`Command cancelled (${signal}).`);
            void vscode.window.showWarningMessage(
              "Prometheus review command cancelled.",
            );
          } else if (code === 0) {
            output.appendLine("Command completed.");
            void vscode.window.showInformationMessage(
              "Prometheus review command completed.",
            );
          } else {
            output.appendLine(`Command exited with code ${code}.`);
            void vscode.window.showWarningMessage(
              `Prometheus review command exited with code ${code}. See Prometheus Review output.`,
            );
          }
          resolve();
        });
      }),
  );
}

export async function runReviewFromExtension(
  extensionContext: vscode.ExtensionContext,
) {
  const mode = await vscode.window.showQuickPick(
    [
      {
        label: "Review changes",
        description: "Run local review/check agents against the current diff",
        args: ["review"],
      },
      {
        label: "Review changes and show patches",
        description: "Print suggested patches without applying them",
        args: ["review", "--patch"],
      },
      {
        label: "Review changes and apply fixes",
        description: "Apply patches suggested by failing review agents",
        args: ["review", "--fix"],
      },
    ],
    {
      placeHolder: "Select a Prometheus review action",
    },
  );

  if (!mode) {
    return;
  }

  await runCliReviewCommand(
    extensionContext,
    mode.args,
    `Prometheus: ${mode.label}`,
  );
}

export async function runChecksFromExtension(
  extensionContext: vscode.ExtensionContext,
) {
  const action = await vscode.window.showQuickPick(
    [
      {
        label: "List checks",
        args: ["checks"],
      },
      {
        label: "Accept pending suggestions",
        args: ["checks", "accept"],
      },
      {
        label: "Reject pending suggestions",
        args: ["checks", "reject"],
      },
    ],
    {
      placeHolder: "Select a Prometheus checks action",
    },
  );

  if (!action) {
    return;
  }

  const prUrl = await vscode.window.showInputBox({
    prompt: "PR URL. Leave blank to auto-detect from the current branch.",
    ignoreFocusOut: true,
  });

  if (prUrl === undefined) {
    return;
  }

  const args = prUrl.trim() ? [...action.args, prUrl.trim()] : action.args;
  await runCliReviewCommand(
    extensionContext,
    args,
    `Prometheus: ${action.label}`,
  );
}
