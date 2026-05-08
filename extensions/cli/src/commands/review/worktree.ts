import { exec, execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";

import { logger } from "../../util/logger.js";

const execAsync = promisify(exec);

export async function createWorktree(index: number): Promise<string> {
  const worktreePath = path.join(
    os.tmpdir(),
    `prometheus-review-${Date.now()}-${index}`,
  );

  await execAsync(`git worktree add "${worktreePath}" HEAD --detach`);

  try {
    const { stdout: diff } = await execAsync("git diff HEAD", {
      maxBuffer: 10 * 1024 * 1024,
    });
    if (diff.trim()) {
      execSync(`git -C "${worktreePath}" apply --allow-empty -`, {
        input: diff,
        stdio: ["pipe", "pipe", "pipe"],
      });
    }
  } catch (error) {
    logger.debug("Could not apply uncommitted changes to worktree", { error });
  }

  try {
    const { stdout } = await execAsync(
      "git ls-files --others --exclude-standard",
    );
    const untrackedFiles = stdout.trim() ? stdout.trim().split("\n") : [];
    const cwd = process.cwd();

    for (const file of untrackedFiles) {
      const sourcePath = path.join(cwd, file);
      const targetPath = path.join(worktreePath, file);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      try {
        fs.copyFileSync(sourcePath, targetPath);
      } catch {}
    }
  } catch (error) {
    logger.debug("Could not copy untracked files to worktree", { error });
  }

  await execAsync(`git -C "${worktreePath}" add -A`);
  await execAsync(
    `git -C "${worktreePath}" commit -m "prometheus-review: user working tree state" --allow-empty --no-verify`,
  );

  return worktreePath;
}

export function captureWorktreeDiff(worktreePath: string): string {
  try {
    execSync(`git -C "${worktreePath}" add -A`, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    return execSync(`git -C "${worktreePath}" diff --cached`, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    return "";
  }
}

export async function cleanupWorktree(worktreePath: string): Promise<void> {
  try {
    await execAsync(`git worktree remove "${worktreePath}" --force`);
  } catch (error) {
    logger.debug("Could not remove worktree, attempting manual cleanup", {
      worktreePath,
      error,
    });
    try {
      fs.rmSync(worktreePath, { recursive: true, force: true });
      await execAsync("git worktree prune");
    } catch {}
  }
}
