import * as fs from "fs";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveReviews } from "./resolveReviews.js";

vi.mock("fs", async () => {
  const actual = await vi.importActual("fs");
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
  };
});

describe("resolveReviews local discovery", () => {
  const originalCwd = process.cwd;

  beforeEach(() => {
    process.cwd = () => "/test/repo";
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readdirSync).mockReturnValue([]);
  });

  afterEach(() => {
    process.cwd = originalCwd;
    vi.restoreAllMocks();
  });

  it("prefers .prometheus agents over .continue compatibility paths", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockImplementation(((dir: fs.PathLike) => {
      const dirString = String(dir);
      if (dirString.endsWith(path.join(".prometheus", "agents"))) {
        return ["security-review.md", "shared.md"];
      }
      if (dirString.endsWith(path.join(".prometheus", "checks"))) {
        return ["api-contract.md"];
      }
      if (dirString.endsWith(path.join(".continue", "agents"))) {
        return ["shared.md", "legacy.md"];
      }
      return [];
    }) as typeof fs.readdirSync);

    const reviews = await resolveReviews();

    expect(reviews.map((review) => review.name)).toEqual([
      "security review",
      "shared",
      "api contract",
      "legacy",
    ]);
    expect(
      reviews.find((review) => review.name === "shared")?.source,
    ).toContain(path.join(".prometheus", "agents"));
  });

  it("returns explicit local agent flags without local discovery", async () => {
    const reviews = await resolveReviews(["./reviews/custom-check.md"]);

    expect(reviews).toHaveLength(1);
    expect(reviews[0].name).toBe("custom check");
    expect(reviews[0].sourceType).toBe("local");
    expect(fs.readdirSync).not.toHaveBeenCalled();
  });
});
