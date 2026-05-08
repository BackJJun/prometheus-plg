import { describe, expect, it } from "vitest";
import { normalizeToolCallArguments } from "./openaiTypeConverters";

describe("normalizeToolCallArguments", () => {
  it("keeps valid JSON arguments", () => {
    expect(normalizeToolCallArguments('{"filepath":"README.md"}')).toBe(
      '{"filepath":"README.md"}',
    );
  });

  it("converts empty arguments to an empty object", () => {
    expect(normalizeToolCallArguments("")).toBe("{}");
  });

  it("replaces malformed arguments with an empty object", () => {
    expect(normalizeToolCallArguments("{")).toBe("{}");
  });

  it("stringifies non-string arguments", () => {
    expect(normalizeToolCallArguments({ filepath: "README.md" })).toBe(
      '{"filepath":"README.md"}',
    );
  });
});
