import { execSync, fork } from "child_process";

import chalk from "chalk";
import React from "react";

import { configureConsoleForHeadless } from "../init.js";
import { logger } from "../util/logger.js";

import { ExtendedCommandOptions } from "./BaseCommandOptions.js";
import type { DiffContext } from "./review/diffContext.js";
import { computeDiffContext } from "./review/diffContext.js";
import type { ReviewResult } from "./review/renderReport.js";
import { renderReport } from "./review/renderReport.js";
import { resolveReviews } from "./review/resolveReviews.js";
import { ReviewProgress } from "./review/ReviewProgress.js";
import type { ReviewState } from "./review/ReviewProgress.js";
import type { WorkerConfig, WorkerResult } from "./review/reviewWorker.js";
import { cleanupWorktree, createWorktree } from "./review/worktree.js";

export interface ReviewOptions extends ExtendedCommandOptions {
  base?: string;
  format?: string;
  fix?: boolean;
  patch?: boolean;
  failFast?: boolean;
  reviewAgents?: string[];
}

async function runReviewInWorker(
  agentSource: string,
  worktreePath: string,
  diffContext: DiffContext,
  options: ReviewOptions,
): Promise<WorkerResult> {
  return new Promise<WorkerResult>((resolve) => {
    const workerPath = process.argv[1];
    const child = fork(workerPath, ["--internal-review-worker"], {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      env: {
        ...process.env,
        NODE_OPTIONS: process.env.NODE_OPTIONS || "",
      },
    });

    let settled = false;
    const timeout = setTimeout(
      () => {
        if (!settled) {
          settled = true;
          child.kill("SIGTERM");
          resolve({
            patch: "",
            agentOutput: "",
            duration: 0,
            error: "Review timed out after 5 minutes",
          });
        }
      },
      5 * 60 * 1000,
    );

    child.on("message", (message: { type: string; result?: WorkerResult }) => {
      if (message.type === "ready") {
        const config: WorkerConfig = {
          agentSource,
          worktreePath,
          diffContext,
          options: {
            config: options.config,
            org: options.org,
            rule: options.rule,
            verbose: options.verbose,
          },
        };
        child.send({ type: "run-review", config });
      } else if (message.type === "result" && message.result) {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve(message.result);
        }
      }
    });

    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve({
          patch: "",
          agentOutput: "",
          duration: 0,
          error: error.message,
        });
      }
    });

    child.on("exit", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve({
          patch: "",
          agentOutput: "",
          duration: 0,
          error: `Worker exited with code ${code}`,
        });
      }
    });

    if (child.stderr) {
      let stderr = "";
      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });
      child.on("exit", () => {
        if (stderr.trim()) {
          logger.debug("Review worker stderr:", { stderr: stderr.trim() });
        }
      });
    }
  });
}

function applyPatches(results: ReviewResult[]): void {
  const patchResults = results.filter(
    (result) => result.status === "fail" && result.patch.trim(),
  );

  if (patchResults.length === 0) {
    console.log(chalk.dim("No patches to apply."));
    return;
  }

  let applied = 0;
  let failed = 0;

  for (const result of patchResults) {
    try {
      execSync("git apply --check -", {
        input: result.patch,
        stdio: ["pipe", "pipe", "pipe"],
      });
      execSync("git apply -", {
        input: result.patch,
        stdio: ["pipe", "pipe", "pipe"],
      });
      applied++;
      console.log(chalk.green(`  Applied patch from ${result.name}`));
    } catch {
      failed++;
      console.log(
        chalk.red(
          `  Could not apply patch from ${result.name} (conflict with working tree)`,
        ),
      );
    }
  }

  console.log(
    `\nApplied ${applied}/${patchResults.length} patches.` +
      (failed > 0 ? ` ${failed} had conflicts.` : ""),
  );
}

interface LiveUIProps {
  checks: ReviewState[];
  baseBranch?: string;
  changedFileCount?: number;
  loading?: boolean;
}

async function mountProgressUI(
  props: LiveUIProps,
  options: ReviewOptions,
): Promise<{ rerender: () => void; unmount: () => void }> {
  const useLiveUI =
    process.stdout.isTTY && !options.patch && options.format !== "json";

  if (!useLiveUI) {
    return {
      rerender: () => {},
      unmount: () => {},
    };
  }

  const { render } = await import("ink");
  const instance = render(React.createElement(ReviewProgress, props));
  return {
    rerender: () =>
      instance.rerender(React.createElement(ReviewProgress, props)),
    unmount: () => instance.unmount(),
  };
}

function outputResultsAndExit(
  results: ReviewResult[],
  diffContext: DiffContext,
  options: ReviewOptions,
  checksFromHub: boolean,
): void {
  const format = options.format === "json" ? "json" : "text";
  const report = renderReport(results, {
    baseBranch: diffContext.baseBranch,
    changedFileCount: diffContext.changedFiles.length,
    format,
    checksFromHub,
  });

  if (options.patch) {
    const allPatches = results
      .filter((result) => result.patch.trim())
      .map((result) => result.patch)
      .join("\n");
    process.stdout.write(allPatches);
    process.exit(
      results.some(
        (result) => result.status === "fail" || result.status === "error",
      )
        ? 1
        : 0,
    );
  }

  console.log("\n" + report);

  if (options.fix) {
    console.log(chalk.dim("\nApplying fixes..."));
    applyPatches(results);
  }

  const hasFailed = results.some(
    (result) => result.status === "fail" || result.status === "error",
  );
  process.exit(hasFailed ? 1 : 0);
}

export async function review(options: ReviewOptions = {}): Promise<void> {
  configureConsoleForHeadless(false);

  if (options.verbose) {
    logger.setLevel("debug");
  }

  const uiProps: LiveUIProps = {
    checks: [],
    loading: true,
  };
  const { rerender, unmount } = await mountProgressUI(uiProps, options);

  const diffContext = computeDiffContext(options.base);
  if (!diffContext.diff.trim() && diffContext.changedFiles.length === 0) {
    unmount();
    console.log(
      chalk.yellow(
        "No changes detected. Make changes or specify --base with another git ref.",
      ),
    );
    process.exit(0);
  }

  uiProps.baseBranch = diffContext.baseBranch;
  uiProps.changedFileCount = diffContext.changedFiles.length;
  rerender();

  const reviews = await resolveReviews(options.reviewAgents);
  if (reviews.length === 0) {
    unmount();
    console.log(
      chalk.yellow("\nNo reviews found. To add reviews:\n") +
        chalk.dim(
          "  1. Create .prometheus/agents/my-review.md with review instructions\n",
        ) +
        chalk.dim(
          "  2. Or create .prometheus/checks/my-check.md with check instructions\n",
        ) +
        chalk.dim(
          "  3. Existing .continue/agents and .continue/checks are also supported\n",
        ) +
        chalk.dim(
          "  4. Or run: cn review --review-agents ./path/to/agent.md\n",
        ),
    );
    process.exit(0);
  }

  const checksFromHub = reviews.some((review) => review.sourceType === "hub");
  const reviewStates: ReviewState[] = reviews.map((review) => ({
    name: review.name,
    status: "pending",
  }));
  uiProps.checks = reviewStates;
  uiProps.loading = false;
  rerender();

  const results: ReviewResult[] = [];
  const runSingleReview = async (
    resolvedReview: (typeof reviews)[number],
    index: number,
  ): Promise<ReviewResult> => {
    const startTime = Date.now();
    let worktreePath: string | null = null;

    try {
      reviewStates[index].status = "running";
      reviewStates[index].startTime = Date.now();
      rerender();

      worktreePath = await createWorktree(index);
      const workerResult = await runReviewInWorker(
        resolvedReview.source,
        worktreePath,
        diffContext,
        options,
      );

      const status = workerResult.error
        ? ("error" as const)
        : workerResult.patch.trim()
          ? ("fail" as const)
          : ("pass" as const);
      const duration = (Date.now() - startTime) / 1000;

      reviewStates[index].status = status;
      reviewStates[index].duration = duration;
      rerender();

      return {
        agent: resolvedReview.source,
        name: resolvedReview.name,
        status,
        patch: workerResult.patch,
        output: workerResult.agentOutput,
        duration,
        error: workerResult.error,
      };
    } catch (error: any) {
      const duration = (Date.now() - startTime) / 1000;
      reviewStates[index].status = "error";
      reviewStates[index].duration = duration;
      rerender();

      return {
        agent: resolvedReview.source,
        name: resolvedReview.name,
        status: "error",
        patch: "",
        output: "",
        duration,
        error: error?.message || String(error),
      };
    } finally {
      if (worktreePath) {
        await cleanupWorktree(worktreePath);
      }
    }
  };

  if (options.failFast) {
    for (let index = 0; index < reviews.length; index++) {
      const result = await runSingleReview(reviews[index], index);
      results.push(result);
      if (result.status === "fail" || result.status === "error") {
        break;
      }
    }
  } else {
    const settled = await Promise.allSettled(
      reviews.map((resolvedReview, index) =>
        runSingleReview(resolvedReview, index),
      ),
    );
    for (const result of settled) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      }
    }
  }

  unmount();
  outputResultsAndExit(results, diffContext, options, checksFromHub);
}
