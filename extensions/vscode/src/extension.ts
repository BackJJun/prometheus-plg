/**
 * This is the entry point for the extension.
 */

import * as vscode from "vscode";
import { getExtensionVersion } from "./util/util";

export { default as buildTimestamp } from "./.buildTimestamp";

// Define types for the dynamically imported modules
type TelemetryType = typeof import("core/util/posthog").Telemetry;
type SentryLoggerType =
  typeof import("core/util/sentry/SentryLogger").SentryLogger;

// Module-level variables to hold the imported modules for use in deactivate
let Telemetry: TelemetryType | undefined;
let SentryLogger: SentryLoggerType | undefined;

async function dynamicImportAndActivate(context: vscode.ExtensionContext) {
  // 1. Dynamically import Core modules
  // This ensures that process.env is set BEFORE these modules are loaded
  const caModule = await import("core/util/ca");
  const posthogModule = await import("core/util/posthog");
  const sentryModule = await import("core/util/sentry/SentryLogger");
  const activateModule = await import("./activation/activate");

  // 2. Initialize module-level variables
  Telemetry = posthogModule.Telemetry;
  SentryLogger = sentryModule.SentryLogger;

  // 3. Setup CA
  await caModule.setupCa();

  // 4. Activate extension
  return await activateModule.activateExtension(context);
}

export function activate(context: vscode.ExtensionContext) {
  return dynamicImportAndActivate(context).catch((e) => {
    console.log("Error activating extension: ", e);

    // If Telemetry is loaded, use it. Otherwise, just log to console.
    if (Telemetry) {
      // We need to dynamically import extractMinimalStackTraceInfo if we want to use it
      // But for simplicity in this error handler, we might skip it or try to import it here
      import("core/util/extractMinimalStackTraceInfo")
        .then((module) => {
          Telemetry?.capture(
            "vscode_extension_activation_error",
            {
              stack: module.extractMinimalStackTraceInfo(e.stack),
              message: e.message,
            },
            false,
            true,
          );
        })
        .catch(() => {
          // Fallback if import fails
          Telemetry?.capture(
            "vscode_extension_activation_error",
            {
              message: e.message,
            },
            false,
            true,
          );
        });
    }

    vscode.window
      .showWarningMessage(
        "Error activating the Prometheus extension.",
        "View Logs",
        "Retry",
      )
      .then((selection) => {
        if (selection === "View Logs") {
          vscode.commands.executeCommand("continue.viewLogs");
        } else if (selection === "Retry") {
          // Reload VS Code window
          vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
      });
  });
}

export function deactivate() {
  if (Telemetry) {
    void Telemetry.capture(
      "deactivate",
      {
        extensionVersion: getExtensionVersion(),
      },
      true,
    );
    Telemetry.shutdownPosthogClient();
  }

  if (SentryLogger) {
    SentryLogger.shutdownSentryClient();
  }
}
