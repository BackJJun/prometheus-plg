import type {
  RuntimeApplyState,
  RuntimeClientAdapter,
  RuntimePermissionRequest,
  RuntimeSessionState,
  RuntimeToolState,
} from "core/runtime/types.js";
import * as vscode from "vscode";

import { VsCodeWebviewProtocol } from "../webviewProtocol";

export class VsCodeRuntimeClientAdapter implements RuntimeClientAdapter {
  constructor(private readonly webviewProtocol: VsCodeWebviewProtocol) {}

  async onApplyStateChanged(applyState: RuntimeApplyState) {
    await this.webviewProtocol.request("updateApplyState", {
      streamId: applyState.streamId,
      status: applyState.status as any,
      fileContent: applyState.fileContent,
      originalFileContent: applyState.originalFileContent,
      numDiffs: applyState.numDiffs,
      toolCallId: applyState.toolCallId,
    });
  }

  onPermissionRequested(request: RuntimePermissionRequest) {
    void vscode.window.showInformationMessage(
      `Tool "${request.toolName}" is awaiting permission.`,
    );
  }

  onSessionChanged(_state: RuntimeSessionState) {}

  onToolStateChanged(_toolState: RuntimeToolState) {}
}
