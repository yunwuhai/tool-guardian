// tests/engine/path-check.test.ts
import { describe, it, expect } from "bun:test";
import {
  checkReadPath,
  checkWritePath,
  checkEditPath,
} from "../../src/engine/path-check.ts";
import type { ReadRule, WriteRule, EditRule } from "../../src/policy/types.ts";

describe("checkReadPath", () => {
  const rules: ReadRule[] = [
    { action: "allow", path: "/home/project/**", lines_begin: undefined, lines_end: undefined, comment: undefined },
    { action: "deny", path: "/home/project/secrets/**", lines_begin: undefined, lines_end: undefined, comment: undefined },
  ];

  it("allows path matching allow rule", () => {
    const result = checkReadPath(rules, { path: "/home/project/src/main.ts" });
    expect(result.allowed).toBe(true);
    expect(result.ruleIndex).toBe(0);
  });

  it("denies path matching deny rule", () => {
    const result = checkReadPath(rules, { path: "/home/project/secrets/key.pem" });
    expect(result.allowed).toBe(false);
    expect(result.ruleIndex).toBe(1);
  });

  it("uses fallback when no rules match", () => {
    const result = checkReadPath(rules, { path: "/etc/passwd" }, "deny");
    expect(result.allowed).toBe(false);
    expect(result.ruleIndex).toBe(-1);
  });

  it("returns allow when no rules and fallback is allow", () => {
    const result = checkReadPath(undefined, { path: "/anywhere" }, "allow");
    expect(result.allowed).toBe(true);
  });

  describe("line-level checking", () => {
    const lineRules: ReadRule[] = [
      { action: "allow", path: "/home/project/src/**", lines_begin: 1, lines_end: 100, comment: undefined },
    ];

    it("allows reading within line range", () => {
      const result = checkReadPath(lineRules, {
        path: "/home/project/src/main.ts",
        lineRange: { begin: 1, end: 50 },
      });
      expect(result.allowed).toBe(true);
    });

    it("denies reading outside line range", () => {
      const result = checkReadPath(lineRules, {
        path: "/home/project/src/main.ts",
        lineRange: { begin: 101, end: 200 },
      });
      expect(result.allowed).toBe(false);
    });

    it("denies when line range is not provided but rule requires it", () => {
      const result = checkReadPath(lineRules, {
        path: "/home/project/src/main.ts",
      });
      expect(result.allowed).toBe(false);
    });
  });
});

describe("checkWritePath", () => {
  const rules: WriteRule[] = [
    { action: "allow", path: "/home/project/output/**", lines_begin: undefined, lines_end: undefined, comment: undefined },
    { action: "deny", path: "/home/project/output/secrets/**", lines_begin: undefined, lines_end: undefined, comment: undefined },
  ];

  it("allows writing to allowed path", () => {
    const result = checkWritePath(rules, { path: "/home/project/output/build.js" });
    expect(result.allowed).toBe(true);
  });

  it("denies writing to denied path", () => {
    const result = checkWritePath(rules, { path: "/home/project/output/secrets/key.pem" });
    expect(result.allowed).toBe(false);
  });

  it("deny takes precedence over allow", () => {
    // The deny rule at index 1 matches before any later allow rules
    const result = checkWritePath(rules, { path: "/home/project/output/secrets/key.pem" });
    expect(result.allowed).toBe(false);
  });
});

describe("checkEditPath", () => {
  const rules: EditRule[] = [
    { action: "allow", path: "/home/project/src/**", lines_begin: undefined, lines_end: undefined, comment: undefined },
    { action: "deny", path: "/home/project/src/generated/**", lines_begin: undefined, lines_end: undefined, comment: undefined },
  ];

  it("allows editing allowed path", () => {
    const result = checkEditPath(rules, { path: "/home/project/src/main.ts" });
    expect(result.allowed).toBe(true);
  });

  it("denies editing generated files", () => {
    const result = checkEditPath(rules, { path: "/home/project/src/generated/config.ts" });
    expect(result.allowed).toBe(false);
  });
});
