import * as fs from "fs";

import {
  getService,
  initializeServices,
  services,
  SERVICE_NAMES,
} from "../../services/index.js";
import type { ModelServiceState } from "../../services/types.js";
import { streamChatResponse } from "../../stream/streamChatResponse.js";

import type { DiffContext } from "./diffContext.js";
import { captureWorktreeDiff } from "./worktree.js";

export interface WorkerConfig {
  agentSource: string;
  worktreePath: string;
  diffContext: DiffContext;
  options: {
    config?: string;
    org?: string;
    rule?: string[];
    verbose?: boolean;
  };
}

export interface WorkerResult {
  patch: string;
  agentOutput: string;
  duration: number;
  error?: string;
}

function buildReviewPrompt(diffContext: DiffContext): string {
  const fileList = diffContext.changedFiles
    .map((file) => `- ${file}`)
    .join("\n");

  let prompt = `You are a code review agent. Review only the changed lines in the diff below and check them against your review instructions.

## Scope
- Only review files and lines shown in the diff.
- Do not report pre-existing issues in unchanged code.
- If surrounding context is needed, you may read changed files, but do not flag unchanged lines.

## Changes (base: ${diffContext.baseBranch})
### Changed files
${fileList || "(no files changed)"}

### Diff
\`\`\`diff
${diffContext.diff || "(no diff available)"}
\`\`\`
`;

  if (diffContext.truncated) {
    prompt +=
      "\nThe diff was truncated due to size. You may read the changed files listed above, but do not inspect unrelated files.\n";
  }

  prompt += `
## Rules
- You are in a temporary worktree.
- Only flag issues that exist in the changed lines of the diff.
- Only edit files listed above, and only to fix violations of your review instructions.
- Do not make general improvements, refactors, documentation changes, or style-only fixes.
- If there are no violations, do not edit files. State that no issues were found.
`;

  return prompt;
}

function loadLocalAgentInstructions(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

export async function runReviewWorker(): Promise<void> {
  if (typeof process.send !== "function") {
    console.error("Review worker must be run as a forked process.");
    process.exit(1);
  }

  process.on(
    "message",
    async (message: { type: string; config: WorkerConfig }) => {
      if (message.type !== "run-review") {
        return;
      }

      const { config } = message;
      const startTime = Date.now();

      try {
        process.chdir(config.worktreePath);

        await initializeServices({
          options: {
            config: config.options.config,
            org: config.options.org,
            rule: config.options.rule,
          },
          headless: true,
          toolPermissionOverrides: {
            mode: "auto",
          },
        });

        const modelState = await getService<ModelServiceState>(
          SERVICE_NAMES.MODEL,
        );
        if (!modelState.model || !modelState.llmApi) {
          throw new Error("Failed to initialize model service");
        }

        const promptParts: string[] = [];
        if (
          config.agentSource.endsWith(".md") &&
          fs.existsSync(config.agentSource)
        ) {
          promptParts.push(
            `## Agent Instructions\n\n${loadLocalAgentInstructions(config.agentSource)}`,
          );
        }
        promptParts.push(buildReviewPrompt(config.diffContext));

        services.chatHistory.addUserMessage(promptParts.join("\n\n"));

        const abortController = new AbortController();
        const agentOutput =
          (await streamChatResponse(
            services.chatHistory.getHistory(),
            modelState.model,
            modelState.llmApi,
            abortController,
          )) || "";

        process.send!({
          type: "result",
          result: {
            patch: captureWorktreeDiff(config.worktreePath),
            agentOutput,
            duration: (Date.now() - startTime) / 1000,
          } satisfies WorkerResult,
        });
      } catch (error: any) {
        process.send!({
          type: "result",
          result: {
            patch: "",
            agentOutput: "",
            duration: (Date.now() - startTime) / 1000,
            error: error?.message || String(error),
          } satisfies WorkerResult,
        });
      }
    },
  );

  process.send!({ type: "ready" });
}
