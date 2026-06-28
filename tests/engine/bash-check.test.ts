// tests/engine/bash-check.test.ts
import { describe, it, expect } from "bun:test";
import { checkBashCommand } from "../../src/engine/bash-check.ts";
import type { BashRule } from "../../src/policy/types.ts";

describe("checkBashCommand", () => {
  const rules: BashRule[] = [
    // 0: Allow safe commands (ls handled separately by rule 1)
    {
      action: "allow",
      command_regex: "^(cat|head|tail|echo|pwd|date)$",
      subcommand_regex: undefined,
      required_flags: undefined,
      flags_forbidden: undefined,
      flag_value_pattern: undefined,
      path_pattern: undefined,
      args_pattern: undefined,
      comment: "Safe commands",
    },
    // 1: Allow ls with specific flags and path restriction
    {
      action: "allow",
      command_regex: "^ls$",
      subcommand_regex: undefined,
      required_flags: ["-la"],
      flags_forbidden: undefined,
      flag_value_pattern: undefined,
      path_pattern: "/home/project/**",
      args_pattern: undefined,
      comment: "ls -la within project",
    },
    // 2: Deny rm with -rf
    {
      action: "deny",
      command_regex: "^rm$",
      subcommand_regex: undefined,
      required_flags: undefined,
      flags_forbidden: ["-rf"],
      flag_value_pattern: undefined,
      path_pattern: undefined,
      args_pattern: undefined,
      comment: "Block recursive force remove",
    },
    // 3: Allow git safe subcommands
    {
      action: "allow",
      command_regex: "^git$",
      subcommand_regex: "^(status|diff|log|add|commit)$",
      required_flags: undefined,
      flags_forbidden: undefined,
      flag_value_pattern: undefined,
      path_pattern: undefined,
      args_pattern: undefined,
      comment: "Allow safe git operations",
    },
    // 4: Deny sudo completely
    {
      action: "deny",
      command_regex: "^(sudo|chmod|chown)$",
      subcommand_regex: undefined,
      required_flags: undefined,
      flags_forbidden: undefined,
      flag_value_pattern: undefined,
      path_pattern: undefined,
      args_pattern: undefined,
      comment: "Block privilege commands",
    },
  ];

  describe("safe commands", () => {
    it("allows cat", () => {
      const result = checkBashCommand(rules, "cat /home/project/file.txt");
      expect(result.allowed).toBe(true);
    });

    it("allows echo", () => {
      const result = checkBashCommand(rules, "echo hello");
      expect(result.allowed).toBe(true);
    });

    it("denies ls without flags", () => {
      // ls without flags doesn't match rule 1 (requires -la), so it falls back to deny
      const result = checkBashCommand(rules, "ls /home/project");
      expect(result.allowed).toBe(false);
    });
  });

  describe("flag matching", () => {
    it("denies rm -rf", () => {
      const result = checkBashCommand(rules, "rm -rf /tmp/test");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Block recursive force remove");
    });

    it("allows rm without -rf (no match, fallback to deny)", () => {
      // No rule matches plain "rm", so it falls back to deny
      const result = checkBashCommand(rules, "rm /tmp/test.txt");
      // rm matches the deny rule (forbidden flags), but since -rf is NOT present,
      // the rule doesn't match. Then no rule matches → fallback deny.
      expect(result.allowed).toBe(false);
    });

    it("allows ls -la within project", () => {
      const result = checkBashCommand(rules, "ls -la /home/project/src");
      expect(result.allowed).toBe(true);
    });

    it("denies ls -la outside project", () => {
      const result = checkBashCommand(rules, "ls -la /tmp");
      expect(result.allowed).toBe(false);
    });
  });

  describe("compound commands", () => {
    it("allows git status", () => {
      const result = checkBashCommand(rules, "git status");
      expect(result.allowed).toBe(true);
    });

    it("allows git diff", () => {
      const result = checkBashCommand(rules, "git diff HEAD~1");
      expect(result.allowed).toBe(true);
    });

    it("denies git push (not in allowed subcommands)", () => {
      const result = checkBashCommand(rules, "git push origin main");
      // No rule matches → fallback deny
      expect(result.allowed).toBe(false);
    });
  });

  describe("privilege commands", () => {
    it("denies sudo", () => {
      const result = checkBashCommand(rules, "sudo rm -rf /");
      expect(result.allowed).toBe(false);
    });

    it("denies chmod", () => {
      const result = checkBashCommand(rules, "chmod 777 /etc/passwd");
      expect(result.allowed).toBe(false);
    });
  });

  describe("command chains", () => {
    it("blocks entire chain if one segment is denied", () => {
      const result = checkBashCommand(rules, "echo hello && sudo ls");
      // echo is allowed, but sudo is denied → entire chain denied
      expect(result.allowed).toBe(false);
    });

    it("allows chain where all segments are allowed", () => {
      const result = checkBashCommand(rules, "echo building && git status");
      expect(result.allowed).toBe(true);
    });
  });

  describe("fallback", () => {
    it("no rules → fallback action used", () => {
      const result = checkBashCommand(undefined, "any command", "allow");
      expect(result.allowed).toBe(true);
    });

    it("no matching rules → fallback deny", () => {
      const result = checkBashCommand(rules, "some-unknown-command --flag");
      expect(result.allowed).toBe(false);
      expect(result.ruleIndex).toBe(-1);
    });

    it("allow fallback on unknown command", () => {
      const result = checkBashCommand(rules, "some-unknown-command", "allow");
      expect(result.allowed).toBe(true);
    });
  });
});
