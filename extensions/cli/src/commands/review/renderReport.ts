import chalk from "chalk";

export interface ReviewResult {
  agent: string;
  name: string;
  status: "pass" | "fail" | "error";
  patch: string;
  output: string;
  duration: number;
  error?: string;
}

export interface RenderOptions {
  baseBranch: string;
  changedFileCount: number;
  format: "text" | "json";
  checksFromHub: boolean;
}

export function renderReport(
  results: ReviewResult[],
  options: RenderOptions,
): string {
  if (options.format === "json") {
    return renderJsonReport(results);
  }
  return renderTextReport(results, options);
}

function renderJsonReport(results: ReviewResult[]): string {
  return JSON.stringify(
    {
      reviews: results.map((result) => ({
        agent: result.agent,
        name: result.name,
        status: result.status,
        patch: result.patch,
        output: result.output,
        duration: result.duration,
        ...(result.error ? { error: result.error } : {}),
      })),
      summary: {
        total: results.length,
        passed: results.filter((result) => result.status === "pass").length,
        failed: results.filter((result) => result.status === "fail").length,
        errored: results.filter((result) => result.status === "error").length,
      },
    },
    null,
    2,
  );
}

function renderTextReport(
  results: ReviewResult[],
  options: RenderOptions,
): string {
  const isTTY = process.stdout.isTTY;
  const lines: string[] = [];
  const failedResults = results.filter(
    (result) => result.status === "fail" || result.status === "error",
  );

  for (const result of failedResults) {
    const duration = `(${result.duration.toFixed(1)}s)`;
    const title = `## ${result.name} ${duration}`;
    lines.push(isTTY ? chalk.red(title) : title);

    if (result.status === "error") {
      lines.push(`Error: ${result.error || "Unknown error"}`);
      lines.push("");
      continue;
    }

    if (result.output.trim()) {
      lines.push("");
      lines.push(result.output.trim());
    }

    if (result.patch.trim()) {
      lines.push("");
      lines.push("### Suggested changes:");
      lines.push("```diff");
      lines.push(result.patch.trim());
      lines.push("```");
    }

    lines.push("");
  }

  if (failedResults.length > 0) {
    lines.push("---");
    const summary = `**${failedResults.length} of ${results.length} reviews failed.**`;
    lines.push(isTTY ? chalk.red(summary) : summary);
    lines.push("");
  } else {
    const summary = `All ${results.length} review${results.length === 1 ? "" : "s"} passed.`;
    lines.push(isTTY ? chalk.green(summary) : summary);
  }

  lines.push(
    options.checksFromHub
      ? "Some reviews were resolved from hub agents."
      : "Local review agents were resolved from .prometheus or .continue.",
  );

  return lines.join("\n");
}
