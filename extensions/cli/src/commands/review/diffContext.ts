import { execSync } from "child_process";

import { logger } from "../../util/logger.js";

const MAX_DIFF_SIZE = 50 * 1024;

export interface DiffContext {
  baseBranch: string;
  diff: string;
  changedFiles: string[];
  stat: string;
  truncated: boolean;
}

function detectDefaultBranch(): string {
  try {
    const ref = execSync("git symbolic-ref refs/remotes/origin/HEAD", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return ref.replace("refs/remotes/origin/", "");
  } catch {
    try {
      execSync("git rev-parse --verify main", {
        stdio: ["pipe", "pipe", "pipe"],
      });
      return "main";
    } catch {
      try {
        execSync("git rev-parse --verify master", {
          stdio: ["pipe", "pipe", "pipe"],
        });
        return "master";
      } catch {
        return "main";
      }
    }
  }
}

export function computeDiffContext(baseBranch?: string): DiffContext {
  const base = baseBranch || detectDefaultBranch();

  let mergeBase: string;
  try {
    mergeBase = execSync(`git merge-base ${base} HEAD`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    logger.warn(
      `Could not find merge-base with ${base}, falling back to direct diff`,
    );
    mergeBase = base;
  }

  let diff = "";
  let truncated = false;
  try {
    diff = execSync(`git diff ${mergeBase}`, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {}

  if (diff.length > MAX_DIFF_SIZE) {
    diff = diff.slice(0, MAX_DIFF_SIZE);
    truncated = true;
  }

  let changedFiles: string[] = [];
  try {
    const fileList = execSync(`git diff --name-only ${mergeBase}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    changedFiles = fileList ? fileList.split("\n") : [];
  } catch {}

  let stat = "";
  try {
    stat = execSync(`git diff --stat ${mergeBase}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {}

  return {
    baseBranch: base,
    diff,
    changedFiles,
    stat,
    truncated,
  };
}
