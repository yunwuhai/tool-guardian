// tests/engine/matcher.test.ts
import { describe, it, expect } from "bun:test";
import { matchRules, type MatchResult, type RuleWithAction } from "../../src/engine/matcher.ts";

interface TestRule extends RuleWithAction {
  name?: string;
  pattern?: string;
}

describe("matchRules", () => {
  describe("first-match-wins", () => {
    const rules: TestRule[] = [
      { action: "allow", pattern: "/a/**" },
      { action: "deny", pattern: "/a/secret/**" },
      { action: "allow", pattern: "/b/**" },
    ];

    it("matches first applicable rule", () => {
      const checkFn = (rule: TestRule) => true;
      const result = matchRules(rules, checkFn);
      expect(result.action).toBe("allow");
      expect(result.ruleIndex).toBe(0);
    });

    it("returns first matching rule, not last", () => {
      let callCount = 0;
      const checkFn = (rule: TestRule) => {
        callCount++;
        return rule.pattern !== "/a/**"; // skip first
      };
      const result = matchRules(rules, checkFn);
      expect(result.action).toBe("deny");
      expect(result.ruleIndex).toBe(1);
      expect(callCount).toBe(2); // stopped after match
    });
  });

  describe("fallback", () => {
    it("uses default deny fallback when no rules match", () => {
      const result = matchRules([], () => false, "deny");
      expect(result.allowed).toBe(false);
      expect(result.action).toBe("deny");
      expect(result.ruleIndex).toBe(-1);
      expect(result.reason).toContain("fallback");
    });

    it("uses allow fallback when specified", () => {
      const result = matchRules([], () => false, "allow");
      expect(result.allowed).toBe(true);
      expect(result.action).toBe("allow");
      expect(result.ruleIndex).toBe(-1);
    });
  });

  describe("section", () => {
    it("includes section in result", () => {
      const rules: TestRule[] = [{ action: "allow" }];
      const result = matchRules(rules, () => true, "deny", "read_rules");
      expect(result.section).toBe("read_rules");
    });
  });

  describe("comment", () => {
    it("includes comment from matched rule", () => {
      const rules: TestRule[] = [
        { action: "allow", name: "Allow all reads" },
      ];
      // Simulate a rule with a comment
      const rulesWithComment = [
        { action: "allow" as const, comment: "Allow all reads" },
      ];
      const result = matchRules(rulesWithComment, () => true);
      expect(result.comment).toBe("Allow all reads");
    });
  });
});
