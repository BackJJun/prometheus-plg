import chalk from "chalk";

import { get, post } from "../util/apiClient.js";
import { gracefulExit } from "../util/exit.js";
import { getGitBranch, getGitRemoteUrl } from "../util/git.js";
import { logger } from "../util/logger.js";

interface CheckStatus {
  name: string;
  state: "pending" | "success" | "failure";
  description: string;
  sessionId: string;
  commitMessage: string | null;
  suggestionStatus: string | null;
  agentStatus: string;
}

interface ChecksStatusResponse {
  checks: CheckStatus[];
  pullRequestUrl: string;
}

function parseOwnerRepo(
  remoteUrl: string,
): { owner: string; repo: string } | null {
  const httpsMatch = remoteUrl.match(
    /github\.com\/([^/]+)\/([^/.]+?)(?:\.git)?$/,
  );
  if (httpsMatch && httpsMatch[1] && httpsMatch[2]) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  const sshMatch = remoteUrl.match(/github\.com:([^/]+)\/([^/.]+?)(?:\.git)?$/);
  if (sshMatch && sshMatch[1] && sshMatch[2]) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  return null;
}

async function detectPrUrl(): Promise<string | null> {
  const branch = getGitBranch();
  const remoteUrl = getGitRemoteUrl();
  if (!branch || !remoteUrl) {
    return null;
  }

  const parsed = parseOwnerRepo(remoteUrl);
  if (!parsed) {
    return null;
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/pulls?head=${parsed.owner}:${branch}&state=open`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          ...(process.env.GITHUB_TOKEN
            ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
            : {}),
        },
      },
    );
    if (!response.ok) {
      logger.debug(`GitHub API returned ${response.status}`);
      return null;
    }

    const prs = (await response.json()) as Array<{ html_url: string }>;
    return prs[0]?.html_url || null;
  } catch (error) {
    logger.debug(`Failed to detect PR URL: ${error}`);
    return null;
  }
}

async function resolvePrUrl(prUrlArg: string | undefined): Promise<string> {
  if (prUrlArg) {
    return prUrlArg;
  }

  console.log(chalk.dim("Auto-detecting PR from current branch..."));
  const detected = await detectPrUrl();
  if (!detected) {
    console.error(
      chalk.red(
        "Could not detect a PR for the current branch. Please provide a PR URL.",
      ),
    );
    await gracefulExit(1);
    throw new Error("unreachable");
  }

  console.log(chalk.dim(`Found PR: ${detected}`));
  return detected;
}

const STATE_ICONS: Record<string, string> = {
  success: chalk.green("PASS"),
  failure: chalk.red("FAIL"),
  pending: chalk.yellow("PEND"),
};

async function printCheckDiff(check: CheckStatus): Promise<void> {
  try {
    const diffResponse = await get<{ diff: string }>(
      `agents/${check.sessionId}/diff`,
    );
    if (!diffResponse.data.diff) {
      return;
    }

    console.log(`\n${chalk.bold("   Diff:")}`);
    for (const line of diffResponse.data.diff.split("\n")) {
      console.log(`   ${line}`);
    }
  } catch (error) {
    logger.debug(`Failed to fetch diff for ${check.sessionId}: ${error}`);
  }
}

async function listChecks(prUrl: string): Promise<void> {
  const response = await get<ChecksStatusResponse>(
    `api/checks/status?pullRequestUrl=${encodeURIComponent(prUrl)}`,
  );
  const { checks } = response.data;

  if (checks.length === 0) {
    console.log(chalk.dim("No checks found for this PR."));
    return;
  }

  console.log(chalk.bold(`\nChecks for ${chalk.cyan(prUrl)}\n`));

  for (const check of checks) {
    const icon = STATE_ICONS[check.state] || "????";
    console.log(`${icon}  ${chalk.bold(check.name)}`);
    console.log(`   ${chalk.dim(check.description)}`);

    if (check.commitMessage) {
      console.log(`   Commit: ${check.commitMessage}`);
    }

    if (check.suggestionStatus) {
      const statusColor =
        check.suggestionStatus === "pending"
          ? chalk.yellow
          : check.suggestionStatus === "accepted"
            ? chalk.green
            : chalk.red;
      console.log(`   Suggestion: ${statusColor(check.suggestionStatus)}`);
    }

    if (check.commitMessage) {
      await printCheckDiff(check);
    }

    console.log();
  }

  const pending = checks.filter((check) => check.state === "pending").length;
  const failures = checks.filter((check) => check.state === "failure").length;
  const successes = checks.filter((check) => check.state === "success").length;

  const parts: string[] = [];
  if (successes > 0) parts.push(chalk.green(`${successes} passed`));
  if (failures > 0) parts.push(chalk.red(`${failures} failing`));
  if (pending > 0) parts.push(chalk.yellow(`${pending} pending`));
  console.log(parts.join(", "));

  if (failures > 0) {
    await gracefulExit(1);
  } else if (pending > 0) {
    await gracefulExit(2);
  }
}

async function acceptChecks(prUrl: string): Promise<void> {
  const response = await get<ChecksStatusResponse>(
    `api/checks/status?pullRequestUrl=${encodeURIComponent(prUrl)}`,
  );
  const pending = response.data.checks.filter(
    (check) => check.suggestionStatus === "pending" && check.commitMessage,
  );

  if (pending.length === 0) {
    console.log(chalk.dim("No pending suggestions to accept."));
    return;
  }

  console.log(
    chalk.bold(`Accepting ${pending.length} pending suggestion(s)...\n`),
  );
  for (const check of pending) {
    try {
      await post(`agents/${check.sessionId}/accept`);
      console.log(chalk.green(`PASS  Accepted: ${check.name}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        chalk.red(`FAIL  Failed to accept ${check.name}: ${message}`),
      );
    }
  }
}

async function rejectChecks(prUrl: string): Promise<void> {
  const response = await get<ChecksStatusResponse>(
    `api/checks/status?pullRequestUrl=${encodeURIComponent(prUrl)}`,
  );
  const pending = response.data.checks.filter(
    (check) => check.suggestionStatus === "pending" && check.commitMessage,
  );

  if (pending.length === 0) {
    console.log(chalk.dim("No pending suggestions to reject."));
    return;
  }

  console.log(
    chalk.bold(`Rejecting ${pending.length} pending suggestion(s)...\n`),
  );
  for (const check of pending) {
    try {
      await post(`agents/${check.sessionId}/reject`);
      console.log(chalk.red(`FAIL  Rejected: ${check.name}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        chalk.red(`FAIL  Failed to reject ${check.name}: ${message}`),
      );
    }
  }
}

export async function checks(
  actionOrUrl: string | undefined,
  prUrlArg: string | undefined,
): Promise<void> {
  try {
    let action: "list" | "accept" | "reject" = "list";
    let rawPrUrl = prUrlArg;

    if (actionOrUrl === "accept" || actionOrUrl === "reject") {
      action = actionOrUrl;
    } else if (actionOrUrl) {
      rawPrUrl = actionOrUrl;
    }

    const prUrl = await resolvePrUrl(rawPrUrl);
    if (action === "accept") {
      await acceptChecks(prUrl);
    } else if (action === "reject") {
      await rejectChecks(prUrl);
    } else {
      await listChecks(prUrl);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AuthenticationRequiredError"
    ) {
      console.error(chalk.red(error.message));
      await gracefulExit(1);
    }
    throw error;
  }
}
