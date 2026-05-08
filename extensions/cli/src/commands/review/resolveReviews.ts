import * as fs from "fs";
import * as path from "path";

export interface ResolvedReview {
  name: string;
  source: string;
  sourceType: "hub" | "local";
}

const LOCAL_REVIEW_DIRS = [
  [".prometheus", "agents"],
  [".prometheus", "checks"],
  [".continue", "agents"],
  [".continue", "checks"],
];

export async function resolveReviews(
  agentFlags?: string[],
): Promise<ResolvedReview[]> {
  if (agentFlags && agentFlags.length > 0) {
    return agentFlags.map((agent) => ({
      name: agentDisplayName(agent),
      source: resolveAgentSource(agent),
      sourceType: isLocalPath(agent) ? "local" : "hub",
    }));
  }

  return resolveFromLocal();
}

function resolveFromLocal(): ResolvedReview[] {
  const cwd = process.cwd();
  const seen = new Set<string>();
  const results: ResolvedReview[] = [];

  for (const dirParts of LOCAL_REVIEW_DIRS) {
    const dir = path.join(cwd, ...dirParts);
    if (!fs.existsSync(dir)) {
      continue;
    }

    try {
      const files = fs.readdirSync(dir).filter((file) => file.endsWith(".md"));
      for (const file of files) {
        if (seen.has(file)) {
          continue;
        }
        seen.add(file);
        results.push({
          name: path.basename(file, ".md").replace(/[-_]/g, " "),
          source: path.join(dir, file),
          sourceType: "local",
        });
      }
    } catch {
      // Best-effort local discovery.
    }
  }

  return results;
}

function isLocalPath(agent: string): boolean {
  return (
    agent.startsWith(".") ||
    agent.startsWith("/") ||
    agent.startsWith("~") ||
    agent.endsWith(".md") ||
    agent.endsWith(".yaml") ||
    agent.endsWith(".yml") ||
    /^[A-Za-z]:[/\\]/.test(agent)
  );
}

function resolveAgentSource(agent: string): string {
  if (!isLocalPath(agent)) {
    return agent;
  }
  if (agent.startsWith("~")) {
    const home = process.env.HOME || process.env.USERPROFILE || "";
    return path.join(home, agent.slice(1));
  }
  return path.resolve(agent);
}

function agentDisplayName(agent: string): string {
  if (isLocalPath(agent)) {
    return path.basename(agent, path.extname(agent)).replace(/[-_]/g, " ");
  }

  const parts = agent.split("/");
  return (parts[parts.length - 1] || agent).replace(/[-_]/g, " ");
}
