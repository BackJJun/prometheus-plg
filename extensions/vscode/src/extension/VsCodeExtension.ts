import fs from "fs";
import path from "path";

import { IContextProvider } from "core";
import { ConfigHandler } from "core/config/ConfigHandler";
import { EXTENSION_NAME, getControlPlaneEnv } from "core/control-plane/env";
import { Core } from "core/core";
import { FromCoreProtocol, ToCoreProtocol } from "core/protocol";
import { InProcessMessenger } from "core/protocol/messenger";
import {
  getConfigJsonPath,
  getConfigTsPath,
  getConfigYamlPath,
  getContinueGlobalPath,
} from "core/util/paths";
import { v4 as uuidv4 } from "uuid";
import * as vscode from "vscode";

import { ContinueCompletionProvider } from "../autocomplete/completionProvider";
import {
  monitorBatteryChanges,
  setupStatusBar,
  StatusBarStatus,
} from "../autocomplete/statusBar";
import { registerAllCommands } from "../commands";
import { ContinueConsoleWebviewViewProvider } from "../ContinueConsoleWebviewViewProvider";
import { ContinueGUIWebviewViewProvider } from "../ContinueGUIWebviewViewProvider";
import { VerticalDiffManager } from "../diff/vertical/manager";
import { registerAllCodeLensProviders } from "../lang-server/codeLens";
import { registerAllPromptFilesCompletionProviders } from "../lang-server/promptFileCompletions";
import EditDecorationManager from "../quickEdit/EditDecorationManager";
import { QuickEdit } from "../quickEdit/QuickEditQuickPick";
import { setupRemoteConfigSync } from "../stubs/activation";
import { UriEventHandler } from "../stubs/uriHandler";
import {
  getControlPlaneSessionInfo,
  WorkOsAuthProvider,
} from "../stubs/WorkOsAuthProvider";
import { Battery } from "../util/battery";
import { FileSearch } from "../util/FileSearch";
import { VsCodeIdeUtils } from "../util/ideUtils";
import { VsCodeIde } from "../VsCodeIde";

import { ConfigYamlDocumentLinkProvider } from "./ConfigYamlDocumentLinkProvider";
import { VsCodeMessenger } from "./VsCodeMessenger";

import { modelSupportsNextEdit } from "core/llm/autodetect";
import { NEXT_EDIT_MODELS } from "core/llm/constants";
import { NextEditProvider } from "core/nextEdit/NextEditProvider";
import { isNextEditTest } from "core/nextEdit/utils";
import { JumpManager } from "../activation/JumpManager";
import setupNextEditWindowManager, {
  NextEditWindowManager,
} from "../activation/NextEditWindowManager";
import {
  HandlerPriority,
  SelectionChangeManager,
} from "../activation/SelectionChangeManager";
import { GhostTextAcceptanceTracker } from "../autocomplete/GhostTextAcceptanceTracker";
import { getDefinitionsFromLsp } from "../autocomplete/lsp";
import { handleTextDocumentChange } from "../util/editLoggingUtils";
import type { VsCodeWebviewProtocol } from "../webviewProtocol";

// Security scan result types
interface SecurityIssue {
  cwe_ids: string[];
  id: string;
  title: string;
  description: string;
  documentation_url: string;
  line_number: number;
  full_filename: string; // This will be hidden in output
  filename: string;
  source: {
    start: number;
    end: number;
    column: { start: number; end: number };
  };
  code_extract: string;
}

interface SecurityScanOutput {
  critical?: SecurityIssue[];
  high?: SecurityIssue[];
  medium?: SecurityIssue[];
  low?: SecurityIssue[];
  warning?: SecurityIssue[];
}

// Helper function to format security scan results as Markdown
function formatSecurityReportMarkdown(
  fileName: string,
  output: SecurityScanOutput,
): string {
  const severityEmoji: Record<string, string> = {
    critical: "🔴",
    high: "🟠",
    medium: "🟡",
    low: "🟢",
    warning: "⚪",
  };

  const severityLabels: Record<string, string> = {
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
    warning: "Warning",
  };

  let markdown = `# 🛡️ Security Scan Report\n\n`;
  markdown += `**File:** \`${fileName}\`\n\n`;
  markdown += `---\n\n`;

  // Count issues
  const counts: Record<string, number> = {};
  let totalIssues = 0;
  for (const severity of Object.keys(severityLabels)) {
    const issues = output[severity as keyof SecurityScanOutput] || [];
    counts[severity] = issues.length;
    totalIssues += issues.length;
  }

  // Summary
  markdown += `## 📊 Summary\n\n`;
  markdown += `| Severity | Count |\n`;
  markdown += `|----------|-------|\n`;
  for (const severity of Object.keys(severityLabels)) {
    if (counts[severity] > 0) {
      markdown += `| ${severityEmoji[severity]} ${severityLabels[severity]} | ${counts[severity]} |\n`;
    }
  }
  markdown += `| **Total** | **${totalIssues}** |\n\n`;

  // Details by severity
  for (const severity of Object.keys(severityLabels)) {
    const issues = output[severity as keyof SecurityScanOutput] || [];
    if (issues.length === 0) continue;

    markdown += `---\n\n`;
    markdown += `## ${severityEmoji[severity]} ${severityLabels[severity]} Issues (${issues.length})\n\n`;

    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];
      markdown += `### ${i + 1}. ${issue.title}\n\n`;
      markdown += `- **Rule ID:** \`${issue.id}\`\n`;
      markdown += `- **CWE:** ${issue.cwe_ids.map((id) => `[CWE-${id}](https://cwe.mitre.org/data/definitions/${id}.html)`).join(", ")}\n`;
      markdown += `- **Line:** ${issue.line_number}\n`;
      markdown += `- **Documentation:** [View Details](${issue.documentation_url})\n\n`;

      if (issue.code_extract) {
        markdown += `**Vulnerable Code:**\n\`\`\`\n${issue.code_extract}\n\`\`\`\n\n`;
      }

      markdown += `${issue.description}\n\n`;
    }
  }

  return markdown;
}

export class VsCodeExtension {
  // Currently some of these are public so they can be used in testing (test/test-suites)

  private configHandler: ConfigHandler;
  private extensionContext: vscode.ExtensionContext;
  private ide: VsCodeIde;
  private ideUtils: VsCodeIdeUtils;
  private consoleView: ContinueConsoleWebviewViewProvider;
  private sidebar: ContinueGUIWebviewViewProvider;
  private windowId: string;
  private editDecorationManager: EditDecorationManager;
  private verticalDiffManager: VerticalDiffManager;
  webviewProtocolPromise: Promise<VsCodeWebviewProtocol>;
  private core: Core;
  private battery: Battery;
  private workOsAuthProvider: WorkOsAuthProvider;
  private fileSearch: FileSearch;
  private uriHandler = new UriEventHandler();
  private completionProvider: ContinueCompletionProvider;

  private ARBITRARY_TYPING_DELAY = 2000;

  /**
   * This is how you turn next edit on or off at the extension level.
   * This is called on config reload and autocomplete menu updates.
   * This is also the place you want to check to enable/disable next edit during e2e tests,
   * because it tends to stain other e2e tests and make them fail.
   */
  private async updateNextEditState(
    context: vscode.ExtensionContext,
  ): Promise<void> {
    const { config: continueConfig } = await this.configHandler.loadConfig();
    const autocompleteModel = continueConfig?.selectedModelByRole.autocomplete;
    const vscodeConfig = vscode.workspace.getConfiguration(EXTENSION_NAME);

    const modelSupportsNext =
      autocompleteModel &&
      modelSupportsNextEdit(
        autocompleteModel.capabilities,
        autocompleteModel.model,
        autocompleteModel.title,
      );

    // Use smart defaults.
    let nextEditEnabled = vscodeConfig.get<boolean>("enableNextEdit");
    if (nextEditEnabled === undefined) {
      // First time - set smart default.
      nextEditEnabled = modelSupportsNext ?? false;
      await vscodeConfig.update(
        "enableNextEdit",
        nextEditEnabled,
        vscode.ConfigurationTarget.Global,
      );
    }

    // Check if Next Edit is enabled but model doesn't support it.
    if (
      nextEditEnabled &&
      !modelSupportsNext &&
      !isNextEditTest() &&
      process.env.CONTINUE_E2E_NON_NEXT_EDIT_TEST === "true"
    ) {
      vscode.window
        .showWarningMessage(
          `The current autocomplete model (${autocompleteModel?.title || "unknown"}) does not support Next Edit.`,
          "Disable Next Edit",
          "Select different model",
        )
        .then((selection) => {
          if (selection === "Disable Next Edit") {
            vscodeConfig.update(
              "enableNextEdit",
              false,
              vscode.ConfigurationTarget.Global,
            );
          } else if (selection === "Select different model") {
            vscode.commands.executeCommand(
              "continue.openTabAutocompleteConfigMenu",
            );
          }
        });
    }

    const shouldEnableNextEdit =
      (modelSupportsNext && nextEditEnabled) || isNextEditTest();

    if (shouldEnableNextEdit) {
      await setupNextEditWindowManager(context);
      this.activateNextEdit();
      await NextEditWindowManager.freeTabAndEsc();

      const jumpManager = JumpManager.getInstance();
      jumpManager.registerSelectionChangeHandler();

      const ghostTextAcceptanceTracker =
        GhostTextAcceptanceTracker.getInstance();
      ghostTextAcceptanceTracker.registerSelectionChangeHandler();

      const nextEditWindowManager = NextEditWindowManager.getInstance();
      nextEditWindowManager.registerSelectionChangeHandler();
    } else {
      NextEditWindowManager.clearInstance();
      this.deactivateNextEdit();
      await NextEditWindowManager.freeTabAndEsc();

      JumpManager.clearInstance();
      GhostTextAcceptanceTracker.clearInstance();
    }
  }

  constructor(context: vscode.ExtensionContext) {
    // Register auth provider
    this.workOsAuthProvider = new WorkOsAuthProvider(context, this.uriHandler);

    void this.workOsAuthProvider.refreshSessions();
    context.subscriptions.push(this.workOsAuthProvider);

    this.editDecorationManager = new EditDecorationManager(context);

    let resolveWebviewProtocol: any = undefined;
    this.webviewProtocolPromise = new Promise<VsCodeWebviewProtocol>(
      (resolve) => {
        resolveWebviewProtocol = resolve;
      },
    );
    this.ide = new VsCodeIde(this.webviewProtocolPromise, context);
    this.ideUtils = new VsCodeIdeUtils();
    this.extensionContext = context;
    this.windowId = uuidv4();

    // Check if model supports next edit to determine if we should use full file diff.
    const getUsingFullFileDiff = async () => {
      const { config } = await this.configHandler.loadConfig();
      const autocompleteModel = config?.selectedModelByRole.autocomplete;

      if (!autocompleteModel) {
        return false;
      }

      if (
        !modelSupportsNextEdit(
          autocompleteModel.capabilities,
          autocompleteModel.model,
          autocompleteModel.title,
        )
      ) {
        return false;
      }

      if (autocompleteModel.model.includes(NEXT_EDIT_MODELS.INSTINCT)) {
        return false;
      }

      return true;
    };

    const usingFullFileDiff = true;
    const selectionManager = SelectionChangeManager.getInstance();
    selectionManager.initialize(this.ide, usingFullFileDiff);

    selectionManager.registerListener(
      "typing",
      async (e, state) => {
        const timeSinceLastDocChange =
          Date.now() - state.lastDocumentChangeTime;
        if (
          state.isTypingSession &&
          timeSinceLastDocChange < this.ARBITRARY_TYPING_DELAY &&
          !NextEditWindowManager.getInstance().hasAccepted()
        ) {
          // console.debug(
          //   "VsCodeExtension: typing in progress, preserving chain",
          // );
          return true;
        }

        return false;
      },
      HandlerPriority.NORMAL,
    );

    // Dependencies of core
    let resolveVerticalDiffManager: any = undefined;
    const verticalDiffManagerPromise = new Promise<VerticalDiffManager>(
      (resolve) => {
        resolveVerticalDiffManager = resolve;
      },
    );
    let resolveConfigHandler: any = undefined;
    const configHandlerPromise = new Promise<ConfigHandler>((resolve) => {
      resolveConfigHandler = resolve;
    });
    this.sidebar = new ContinueGUIWebviewViewProvider(
      this.windowId,
      this.extensionContext,
    );

    // Sidebar
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        "continue.continueGUIView",
        this.sidebar,
        {
          webviewOptions: { retainContextWhenHidden: true },
        },
      ),
    );
    resolveWebviewProtocol(this.sidebar.webviewProtocol);

    const inProcessMessenger = new InProcessMessenger<
      ToCoreProtocol,
      FromCoreProtocol
    >();

    new VsCodeMessenger(
      inProcessMessenger,
      this.sidebar.webviewProtocol,
      this.ide,
      verticalDiffManagerPromise,
      configHandlerPromise,
      this.workOsAuthProvider,
      this.editDecorationManager,
      context,
      this,
    );

    this.core = new Core(inProcessMessenger, this.ide);
    this.configHandler = this.core.configHandler;
    resolveConfigHandler?.(this.configHandler);

    void this.configHandler.loadConfig();

    this.verticalDiffManager = new VerticalDiffManager(
      this.sidebar.webviewProtocol,
      this.editDecorationManager,
      this.ide,
    );
    resolveVerticalDiffManager?.(this.verticalDiffManager);

    void setupRemoteConfigSync(() =>
      this.configHandler.reloadConfig.bind(this.configHandler)(
        "Remote config sync",
      ),
    );

    void this.configHandler.loadConfig().then(async ({ config }) => {
      const shouldUseFullFileDiff = await getUsingFullFileDiff();
      this.completionProvider.updateUsingFullFileDiff(shouldUseFullFileDiff);
      selectionManager.updateUsingFullFileDiff(shouldUseFullFileDiff);

      const { verticalDiffCodeLens } = registerAllCodeLensProviders(
        context,
        this.verticalDiffManager.fileUriToCodeLens,
        config,
      );

      this.verticalDiffManager.refreshCodeLens =
        verticalDiffCodeLens.refresh.bind(verticalDiffCodeLens);
    });

    this.configHandler.onConfigUpdate(
      async ({ config: newConfig, configLoadInterrupted }) => {
        const shouldUseFullFileDiff = await getUsingFullFileDiff();
        this.completionProvider.updateUsingFullFileDiff(shouldUseFullFileDiff);
        selectionManager.updateUsingFullFileDiff(shouldUseFullFileDiff);

        await this.updateNextEditState(context);

        if (configLoadInterrupted) {
          // Show error in status bar
          setupStatusBar(undefined, undefined, true);
        } else if (newConfig) {
          setupStatusBar(undefined, undefined, false);

          registerAllCodeLensProviders(
            context,
            this.verticalDiffManager.fileUriToCodeLens,
            newConfig,
          );
        }
      },
    );

    // Tab autocomplete
    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
    const enabled = config.get<boolean>("enableTabAutocomplete");

    // Register inline completion provider
    setupStatusBar(
      enabled ? StatusBarStatus.Enabled : StatusBarStatus.Disabled,
    );
    this.completionProvider = new ContinueCompletionProvider(
      this.configHandler,
      this.ide,
      this.sidebar.webviewProtocol,
      usingFullFileDiff,
    );
    context.subscriptions.push(
      vscode.languages.registerInlineCompletionItemProvider(
        [{ pattern: "**" }],
        this.completionProvider,
      ),
    );

    // Handle uri events
    this.uriHandler.event((uri) => {
      const queryParams = new URLSearchParams(uri.query);
      let profileId = queryParams.get("profile_id");
      let orgId = queryParams.get("org_id");

      this.core.invoke("config/refreshProfiles", {
        reason: "VS Code deep link",
        selectOrgId: orgId === "null" ? undefined : (orgId ?? undefined),
        selectProfileId:
          profileId === "null" ? undefined : (profileId ?? undefined),
      });
    });

    // Battery
    this.battery = new Battery();
    context.subscriptions.push(this.battery);
    context.subscriptions.push(monitorBatteryChanges(this.battery));

    // FileSearch
    this.fileSearch = new FileSearch(this.ide);
    registerAllPromptFilesCompletionProviders(
      context,
      this.fileSearch,
      this.ide,
    );

    const quickEdit = new QuickEdit(
      this.verticalDiffManager,
      this.configHandler,
      this.sidebar.webviewProtocol,
      this.ide,
      context,
      this.fileSearch,
    );

    // LLM Log view
    this.consoleView = new ContinueConsoleWebviewViewProvider(
      this.windowId,
      this.extensionContext,
      this.core.llmLogger,
    );

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        "continue.continueConsoleView",
        this.consoleView,
      ),
    );

    // Commands
    registerAllCommands(
      context,
      this.ide,
      context,
      this.sidebar,
      this.consoleView,
      this.configHandler,
      this.verticalDiffManager,
      this.battery,
      quickEdit,
      this.core,
      this.editDecorationManager,
    );

    // Disabled due to performance issues
    // registerDebugTracker(this.sidebar.webviewProtocol, this.ide);

    // Listen for file saving - use global file watcher so that changes
    // from outside the window are also caught
    fs.watchFile(getConfigJsonPath(), { interval: 1000 }, async (stats) => {
      if (stats.size === 0) {
        return;
      }
      await this.configHandler.reloadConfig(
        "Global JSON config updated - fs file watch",
      );
    });

    fs.watchFile(
      getConfigYamlPath("vscode"),
      { interval: 1000 },
      async (stats) => {
        if (stats.size === 0) {
          return;
        }
        await this.configHandler.reloadConfig(
          "Global YAML config updated - fs file watch",
        );
      },
    );

    fs.watchFile(getConfigTsPath(), { interval: 1000 }, (stats) => {
      if (stats.size === 0) {
        return;
      }
      void this.configHandler.reloadConfig("config.ts updated - fs file watch");
    });

    // watch global rules directory for changes
    const globalRulesDir = path.join(getContinueGlobalPath(), "rules");
    if (fs.existsSync(globalRulesDir)) {
      fs.watch(globalRulesDir, { recursive: true }, (eventType, filename) => {
        if (filename && filename.endsWith(".md")) {
          void this.configHandler.reloadConfig(
            "Global rules directory updated - fs file watch",
          );
        }
      });
    }

    vscode.workspace.onDidChangeTextDocument(async (event) => {
      if (event.contentChanges.length > 0) {
        selectionManager.documentChanged();
      }

      const editInfo = await handleTextDocumentChange(
        event,
        this.configHandler,
        this.ide,
        this.completionProvider,
        getDefinitionsFromLsp,
      );

      if (editInfo) this.core.invoke("files/smallEdit", editInfo);
    });

    vscode.workspace.onDidSaveTextDocument(async (event) => {
      this.core.invoke("files/changed", {
        uris: [event.uri.toString()],
      });

      // Security check on file save
      try {
        // Skip if plugin panel not loaded yet
        if (!this.sidebar?.isReady) {
          console.log("[Security Check] Skipped: Plugin panel not loaded yet");
          return;
        }

        console.log("[Security Check] File saved:", event.uri.fsPath);

        const { config } = await this.configHandler.loadConfig();
        console.log(
          "[Security Check] Config loaded - serverApiUrl:",
          config?.serverApiUrl,
          "securityTarget:",
          config?.securityTarget,
        );

        if (!config?.serverApiUrl) {
          console.log("[Security Check] Skipped: No serverApiUrl configured");
          return;
        }

        // Default security targets if not configured
        const securityTargets = config?.securityTarget || [
          "java",
          "py",
          "kt",
          "ts",
          "js",
        ];

        // Get file extension
        const filePath = event.uri.fsPath;
        const fileExtension = filePath.split(".").pop()?.toLowerCase() || "";
        console.log(
          "[Security Check] File extension:",
          fileExtension,
          "Targets:",
          securityTargets,
        );

        // Check if file extension is in security_target
        if (!securityTargets.includes(fileExtension)) {
          console.log(
            "[Security Check] Skipped: File extension not in target list",
          );
          return;
        }

        // Get security check mode from webview
        let securityCheckMode = "askFirst"; // Default mode
        try {
          const webviewProtocol = await this.webviewProtocolPromise;
          const modeResponse = await Promise.race([
            webviewProtocol.request("getSecurityCheckMode", undefined),
            new Promise<string>((resolve) =>
              setTimeout(() => resolve("askFirst"), 2000),
            ),
          ]);
          securityCheckMode = modeResponse as string;
          console.log("[Security Check] Mode from webview:", securityCheckMode);
        } catch (e) {
          console.log(
            "[Security Check] Failed to get mode from webview, using default:",
            securityCheckMode,
          );
        }

        if (securityCheckMode === "off") {
          console.log("[Security Check] Skipped: Mode is off");
          return;
        }

        const runSecurityCheck = async () => {
          // Create status bar item for loading indicator
          const statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100,
          );
          statusBarItem.text = "$(sync~spin) 🛡️ Security Check 진행 중...";
          statusBarItem.tooltip = "보안 검사가 진행 중입니다";
          statusBarItem.show();

          let scanResult: {
            fileName: string;
            success: boolean;
            output: string;
            error?: string;
          } | null = null;

          try {
            scanResult = await vscode.window.withProgress(
              {
                location: vscode.ProgressLocation.Notification,
                title: "🛡️ Security Check",
                cancellable: false,
              },
              async (progress) => {
                const fs = await import("fs");
                const path = await import("path");

                const fileName = path.basename(filePath);
                progress.report({ message: `${fileName} 검사 중...` });
                statusBarItem.text = `$(sync~spin) 🛡️ ${fileName} 검사 중...`;

                console.log("[Security Check] Running security check...");
                const fileContent = fs.readFileSync(filePath);

                // Create multipart form-data manually
                const boundary = `----FormBoundary${Date.now()}`;
                const crlf = "\r\n";

                const preFileData =
                  `--${boundary}${crlf}` +
                  `Content-Disposition: form-data; name="file"; filename="${fileName}"${crlf}` +
                  `Content-Type: application/octet-stream${crlf}${crlf}`;

                const postFileData = `${crlf}--${boundary}--${crlf}`;

                const preBuffer = Buffer.from(preFileData, "utf-8");
                const postBuffer = Buffer.from(postFileData, "utf-8");
                const body = Buffer.concat([
                  preBuffer,
                  fileContent,
                  postBuffer,
                ]);

                console.log(
                  "[Security Check] Calling API:",
                  `${config.serverApiUrl}/scan`,
                );
                const response = await fetch(`${config.serverApiUrl}/scan`, {
                  method: "POST",
                  body: body,
                  headers: {
                    "Content-Type": `multipart/form-data; boundary=${boundary}`,
                  },
                });

                if (!response.ok) {
                  throw new Error(
                    `API returned ${response.status}: ${response.statusText}`,
                  );
                }

                const result = (await response.json()) as {
                  filename: string;
                  output:
                    | string
                    | {
                        critical?: SecurityIssue[];
                        high?: SecurityIssue[];
                        medium?: SecurityIssue[];
                        low?: SecurityIssue[];
                        warning?: SecurityIssue[];
                      };
                  error: string;
                  exit_code: number;
                  success: boolean;
                };
                console.log("[Security Check] API Result:", result);

                // Format output as Markdown if it's JSON
                let formattedOutput = "";
                if (
                  typeof result.output === "object" &&
                  result.output !== null
                ) {
                  formattedOutput = formatSecurityReportMarkdown(
                    fileName,
                    result.output,
                  );
                } else {
                  formattedOutput = String(result.output);
                }

                return {
                  fileName,
                  success: result.success,
                  output: formattedOutput,
                  error: result.error,
                };
              },
            );
          } catch (error) {
            console.error("[Security Check] API call failed:", error);
            vscode.window.showErrorMessage(
              `🛡️ Security Check 실패: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
          } finally {
            // Always hide status bar item
            statusBarItem.hide();
            statusBarItem.dispose();
          }

          // Handle result display outside of withProgress
          if (scanResult) {
            if (scanResult.success) {
              vscode.window.showInformationMessage(
                `🛡️ Security Check: ${scanResult.fileName} - 문제가 발견되지 않았습니다.`,
              );
            } else {
              // Get security display mode
              let securityDisplayMode = "preview"; // Default mode
              try {
                const webviewProtocol = await this.webviewProtocolPromise;
                const displayModeResponse = await Promise.race([
                  webviewProtocol.request("getSecurityDisplayMode", undefined),
                  new Promise<string>((resolve) =>
                    setTimeout(() => resolve("preview"), 2000),
                  ),
                ]);
                securityDisplayMode = displayModeResponse as string;
                console.log(
                  "[Security Check] Display mode from webview:",
                  securityDisplayMode,
                );
              } catch (e) {
                console.log(
                  "[Security Check] Failed to get display mode, using default:",
                  securityDisplayMode,
                );
              }

              if (securityDisplayMode === "editor") {
                // Show security report immediately in virtual file (Editor)
                await this.ide.showVirtualFile(
                  `Security Report - ${scanResult.fileName}.md`,
                  scanResult.output,
                );
              } else {
                // Show security report as Markdown Preview
                const reportFileName = `Security Report - ${scanResult.fileName}.md`;
                const uri = vscode.Uri.parse(
                  `${
                    VsCodeExtension.continueVirtualDocumentScheme
                  }:${encodeURIComponent(reportFileName)}?${encodeURIComponent(scanResult.output)}`,
                );
                await vscode.commands.executeCommand(
                  "markdown.showPreview",
                  uri,
                );
              }

              // Get security fix mode
              let securityFixMode = "manual"; // Default mode
              try {
                const webviewProtocol = await this.webviewProtocolPromise;
                const fixModeResponse = await Promise.race([
                  webviewProtocol.request("getSecurityFixMode", undefined),
                  new Promise<string>((resolve) =>
                    setTimeout(() => resolve("manual"), 2000),
                  ),
                ]);
                securityFixMode = fixModeResponse as string;
                console.log(
                  "[Security Fix] Fix mode from webview:",
                  securityFixMode,
                );
              } catch (e) {
                console.log(
                  "[Security Fix] Failed to get fix mode, using default:",
                  securityFixMode,
                );
              }

              // Determine whether to call fix API based on mode
              let shouldCallFixApi = false;
              if (securityFixMode === "automatic") {
                shouldCallFixApi = true;
              } else if (securityFixMode === "manual") {
                const userChoice = await vscode.window.showInformationMessage(
                  `🔧 Security Fix: ${scanResult.fileName} - 보안 스캔 보고서를 확인 후, 수정을 진행하시겠습니까?`,
                  { modal: true },
                  "수정 진행",
                  "건너뛰기",
                );
                shouldCallFixApi = userChoice === "수정 진행";
              }
              // securityFixMode === "off" → shouldCallFixApi remains false

              if (shouldCallFixApi) {
                // Call /scan/fix with visible progress notification
                await vscode.window.withProgress(
                  {
                    location: vscode.ProgressLocation.Notification,
                    title: "🔧 Security Fix",
                    cancellable: false,
                  },
                  async (progress) => {
                    try {
                      progress.report({
                        message: `${scanResult.fileName} 보안 문제 수정 중...`,
                      });
                      console.log("[Security Fix] Calling /scan/fix API...");
                      const fs = await import("fs");
                      const fileContent = fs.readFileSync(filePath, "utf-8");

                      const scanFixResponse = await fetch(
                        `${config.serverApiUrl}/scan/fix`,
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            messages: [
                              {
                                role: "user",
                                content: `다음은 보안 검사 결과입니다. 발견된 보안 문제를 수정해주세요.\n\n## 보안 검사 결과\n${scanResult.output}\n\n## 원본 소스코드 (${scanResult.fileName})\n\`\`\`\n${fileContent}\n\`\`\`\n\nedit_existing_file 도구를 사용하여 보안 문제가 수정된 전체 파일 내용을 제공해주세요.`,
                              },
                            ],
                          }),
                        },
                      );

                      if (!scanFixResponse.ok) {
                        throw new Error(
                          `API returned ${scanFixResponse.status}: ${scanFixResponse.statusText}`,
                        );
                      }

                      const fixResult = (await scanFixResponse.json()) as any;
                      console.log("[Security Fix] API Result:", fixResult);

                      progress.report({
                        message: `${scanResult.fileName} 수정 결과 처리 중...`,
                      });

                      // Extract edit_existing_file tool call from response
                      const message = fixResult?.choices?.[0]?.message;
                      let fixContent = "";

                      if (
                        message?.tool_calls &&
                        message.tool_calls.length > 0
                      ) {
                        // LLM responded with tool_calls (edit_existing_file)
                        for (const toolCall of message.tool_calls) {
                          if (
                            toolCall.function?.name === "edit_existing_file"
                          ) {
                            try {
                              const args = JSON.parse(
                                toolCall.function.arguments,
                              );
                              fixContent = args.changes || "";
                              console.log(
                                "[Security Fix] edit_existing_file filepath:",
                                args.filepath,
                              );
                            } catch (parseError) {
                              console.error(
                                "[Security Fix] Failed to parse tool call args:",
                                parseError,
                              );
                            }
                            break;
                          }
                        }
                      } else if (message?.content) {
                        // Fallback: LLM responded with plain content
                        fixContent = message.content;
                      }

                      if (!fixContent) {
                        vscode.window.showWarningMessage(
                          `🔧 Security Fix: ${scanResult.fileName} - 수정 내용을 받지 못했습니다.`,
                        );
                        return;
                      }

                      if (securityFixMode === "automatic") {
                        // Auto-apply: Write fixed content directly to file
                        fs.writeFileSync(filePath, fixContent, "utf-8");
                        vscode.window.showInformationMessage(
                          `🔧 Security Fix: ${scanResult.fileName} - 보안 문제가 자동으로 수정되었습니다.`,
                        );
                      } else if (securityFixMode === "manual") {
                        // Manual: Show diff editor (original vs modified) with Apply button
                        const path = await import("path");
                        const os = await import("os");
                        const tmpFilePath = path.join(
                          os.tmpdir(),
                          `security-fix-${Date.now()}-${scanResult.fileName}`,
                        );

                        // Write fixed content to temp file
                        fs.writeFileSync(tmpFilePath, fixContent, "utf-8");

                        try {
                          const originalUri = vscode.Uri.file(filePath);
                          const modifiedUri = vscode.Uri.file(tmpFilePath);

                          // Show diff view
                          await vscode.commands.executeCommand(
                            "vscode.diff",
                            originalUri,
                            modifiedUri,
                            `🔧 Security Fix: ${scanResult.fileName} (원본 ↔ 수정)`,
                          );

                          // Ask user to apply (modal so it won't auto-dismiss)
                          const applyChoice =
                            await vscode.window.showInformationMessage(
                              `🔧 Security Fix: ${scanResult.fileName} - 수정 사항을 적용하시겠습니까?`,
                              { modal: true },
                              "적용",
                              "취소",
                            );

                          if (applyChoice === "적용") {
                            fs.writeFileSync(filePath, fixContent, "utf-8");
                            vscode.window.showInformationMessage(
                              `🔧 Security Fix: ${scanResult.fileName} - 보안 수정이 적용되었습니다.`,
                            );
                          } else {
                            vscode.window.showInformationMessage(
                              `🔧 Security Fix: ${scanResult.fileName} - 수정이 취소되었습니다.`,
                            );
                          }

                          // Close the diff editor
                          await vscode.commands.executeCommand(
                            "workbench.action.closeActiveEditor",
                          );
                        } finally {
                          // Always clean up temp file
                          try {
                            fs.unlinkSync(tmpFilePath);
                          } catch {}
                        }
                      }
                    } catch (fixError) {
                      console.error(
                        "[Security Fix] API call failed:",
                        fixError,
                      );
                      vscode.window.showErrorMessage(
                        `🔧 Security Fix 실패: ${fixError instanceof Error ? fixError.message : "Unknown error"}`,
                      );
                    }
                  },
                );
              }
            }
          }
        };

        if (securityCheckMode === "automatic") {
          await runSecurityCheck();
        } else if (securityCheckMode === "askFirst") {
          const fileName = filePath.split(/[\\/]/).pop() || "file";
          const selection = await vscode.window.showInformationMessage(
            `Prometheus\n시큐리티 검사를 하시겠습니까? (${fileName})`,
            { modal: true },
            "Yes",
            "No",
          );
          if (selection === "Yes") {
            await runSecurityCheck();
          }
        }
      } catch (error) {
        console.error("[Security Check] Setup failed:", error);
      }
    });

    vscode.workspace.onDidDeleteFiles(async (event) => {
      this.core.invoke("files/deleted", {
        uris: event.files.map((uri) => uri.toString()),
      });
    });

    vscode.workspace.onDidCloseTextDocument(async (event) => {
      this.core.invoke("files/closed", {
        uris: [event.uri.toString()],
      });
    });

    vscode.workspace.onDidCreateFiles(async (event) => {
      this.core.invoke("files/created", {
        uris: event.files.map((uri) => uri.toString()),
      });
    });

    vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
      const dirs = vscode.workspace.workspaceFolders?.map(
        (folder) => folder.uri,
      );

      this.ideUtils.setWokspaceDirectories(dirs);

      this.core.invoke("index/forceReIndex", {
        dirs: [
          ...event.added.map((folder) => folder.uri.toString()),
          ...event.removed.map((folder) => folder.uri.toString()),
        ],
      });
    });

    // TODO merge this and re-enable https://github.com/continuedev/continue/pull/8364
    // vscode.workspace.onDidOpenTextDocument(async (event) => {
    //   const ast = await getAst(event.fileName, event.getText());
    //   if (ast) {
    //     DocumentHistoryTracker.getInstance().addDocument(
    //       localPathOrUriToPath(event.fileName),
    //       event.getText(),
    //       ast,
    //     );
    //   }
    // });

    // When GitHub sign-in status changes, reload config
    vscode.authentication.onDidChangeSessions(async (e) => {
      const env = await getControlPlaneEnv(this.ide.getIdeSettings());
      if (e.provider.id === env.AUTH_TYPE) {
        void vscode.commands.executeCommand(
          "setContext",
          "continue.isSignedInToControlPlane",
          true,
        );

        const sessionInfo = await getControlPlaneSessionInfo(true, false);
        void this.core.invoke("didChangeControlPlaneSessionInfo", {
          sessionInfo,
        });
      } else {
        void vscode.commands.executeCommand(
          "setContext",
          "continue.isSignedInToControlPlane",
          false,
        );

        if (e.provider.id === "github") {
          this.configHandler.reloadConfig("Github sign-in status changed");
        }
      }
    });

    // Listen for editor changes to clean up decorations when editor closes.
    vscode.window.onDidChangeVisibleTextEditors(async () => {
      // If our active editor is no longer visible, clear decorations.
      console.log("deleteChain called from onDidChangeVisibleTextEditors");
      await NextEditProvider.getInstance().deleteChain();
    });

    // Listen for selection changes to hide tooltip when cursor moves.
    vscode.window.onDidChangeTextEditorSelection(async (e) => {
      await selectionManager.handleSelectionChange(e);
    });

    // Refresh index when branch is changed
    void this.ide.getWorkspaceDirs().then((dirs) =>
      dirs.forEach(async (dir) => {
        const repo = await this.ide.getRepo(dir);
        if (repo) {
          repo.state.onDidChange(() => {
            // args passed to this callback are always undefined, so keep track of previous branch
            const currentBranch = repo?.state?.HEAD?.name;
            if (currentBranch) {
              if (this.PREVIOUS_BRANCH_FOR_WORKSPACE_DIR[dir]) {
                if (
                  currentBranch !== this.PREVIOUS_BRANCH_FOR_WORKSPACE_DIR[dir]
                ) {
                  // Trigger refresh of index only in this directory
                  this.core.invoke("index/forceReIndex", { dirs: [dir] });
                }
              }

              this.PREVIOUS_BRANCH_FOR_WORKSPACE_DIR[dir] = currentBranch;
            }
          });
        }
      }),
    );

    // Register a content provider for the readonly virtual documents
    const documentContentProvider = new (class
      implements vscode.TextDocumentContentProvider
    {
      // emitter and its event
      onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
      onDidChange = this.onDidChangeEmitter.event;

      provideTextDocumentContent(uri: vscode.Uri): string {
        return uri.query;
      }
    })();
    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(
        VsCodeExtension.continueVirtualDocumentScheme,
        documentContentProvider,
      ),
    );

    const linkProvider = vscode.languages.registerDocumentLinkProvider(
      { language: "yaml" },
      new ConfigYamlDocumentLinkProvider(),
    );
    context.subscriptions.push(linkProvider);

    this.ide.onDidChangeActiveTextEditor((filepath) => {
      void this.core.invoke("files/opened", { uris: [filepath] });
    });

    // initializes openedFileLruCache with files that are already open when the extension is activated
    let initialOpenedFilePaths = this.ideUtils
      .getOpenFiles()
      .map((uri) => uri.toString());
    this.core.invoke("files/opened", { uris: initialOpenedFilePaths });

    // This is how you would enable/disable next edit in the autocomplete menu.
    // See extensions/vscode/src/autocomplete/statusBar.ts.
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration(EXTENSION_NAME)) {
        const settings = await this.ide.getIdeSettings();
        void this.core.invoke("config/ideSettingsUpdate", settings);

        if (event.affectsConfiguration(`${EXTENSION_NAME}.enableNextEdit`)) {
          await this.updateNextEditState(context);
        }
      }
    });
  }

  static continueVirtualDocumentScheme = EXTENSION_NAME;

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private PREVIOUS_BRANCH_FOR_WORKSPACE_DIR: { [dir: string]: string } = {};

  registerCustomContextProvider(contextProvider: IContextProvider) {
    this.configHandler.registerCustomContextProvider(contextProvider);
  }

  public activateNextEdit() {
    this.completionProvider.activateNextEdit();
  }

  public deactivateNextEdit() {
    this.completionProvider.deactivateNextEdit();
  }
}
