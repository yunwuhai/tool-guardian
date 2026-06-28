// tests/engine/generic-check.test.ts
import { describe, it, expect } from "bun:test";
import { checkPathTool } from "../../src/engine/generic-check.ts";
import type { PathToolRule } from "../../src/policy/types.ts";

describe("checkPathTool", () => {
  const rules: PathToolRule[] = [
    { action: "allow", path: "/home/project/**", comment: undefined },
    { action: "deny", path: "/home/project/node_modules/**", comment: undefined },
    { action: "deny", path: "/etc/**", comment: undefined },
  ];

  it("allows path matching allow rule", () => {
    const result = checkPathTool(rules, "/home/project/src", "deny", "grep_rules");
    expect(result.allowed).toBe(true);
    expect(result.section).toBe("grep_rules");
  });

  it("denies path matching deny rule", () => {
    const result = checkPathTool(rules, "/home/project/node_modules/pkg");
    expect(result.allowed).toBe(false);
  });

  it("denies path outside all allow rules", () => {
    const result = checkPathTool(rules, "/tmp/random", "deny");
    expect(result.allowed).toBe(false);
  });

  it("uses fallback when no rules", () => {
    const result = checkPathTool(undefined, "/any/path", "allow");
    expect(result.allowed).toBe(true);
  });

  it("returns section in result", () => {
    const result = checkPathTool(rules, "/home/project/src", "deny", "find_rules");
    expect(result.section).toBe("find_rules");
  });
});
