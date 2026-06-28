// tests/parser/toml-policy.test.ts
import { describe, it, expect } from "bun:test";
import {
  loadPolicyFile,
  loadPolicyFromString,
  PolicyParseError,
} from "../../src/parser/toml-policy.ts";

describe("loadPolicyFile", () => {
  it("loads and parses a basic policy file", () => {
    const policy = loadPolicyFile("tests/fixtures/policy-basic.toml");
    expect(policy.default_action).toBe("deny");
    expect(policy.tool_defaults?.read).toBe("allow");
    expect(policy.read_rules).toHaveLength(2);
    expect(policy.write_rules).toHaveLength(1);
    expect(policy.bash_rules).toHaveLength(2);
  });

  it("loads a bash-focused policy", () => {
    const policy = loadPolicyFile("tests/fixtures/policy-bash.toml");
    expect(policy.bash_rules).toHaveLength(5);
    expect(policy.bash_rules![0]!.comment).toBe("Allow safe read-only commands");
  });

  it("loads a line-level policy", () => {
    const policy = loadPolicyFile("tests/fixtures/policy-line-level.toml");
    expect(policy.read_rules![0]!.lines_begin).toBe(1);
    expect(policy.read_rules![0]!.lines_end).toBe(500);
  });

  it("throws on non-existent file", () => {
    expect(() => loadPolicyFile("tests/fixtures/nonexistent.toml")).toThrow(
      PolicyParseError,
    );
  });
});

describe("loadPolicyFromString", () => {
  it("parses a minimal valid policy", () => {
    const policy = loadPolicyFromString(`
      default_action = "allow"
    `);
    expect(policy.default_action).toBe("allow");
  });

  it("parses read and write rules", () => {
    const policy = loadPolicyFromString(`
      [[read_rules]]
      action = "allow"
      path = "/src/**"

      [[write_rules]]
      action = "deny"
      path = "/etc/**"
    `);
    expect(policy.read_rules).toHaveLength(1);
    expect(policy.read_rules![0]!.action).toBe("allow");
    expect(policy.write_rules![0]!.action).toBe("deny");
  });

  it("parses bash rules with command_regex", () => {
    const policy = loadPolicyFromString(`
      [[bash_rules]]
      action = "allow"
      command_regex = "^ls$"
    `);
    expect(policy.bash_rules).toHaveLength(1);
    expect(policy.bash_rules![0]!.command_regex).toBe("^ls$");
  });

  it("parses bash rules with required_flags", () => {
    const policy = loadPolicyFromString(`
      [[bash_rules]]
      action = "allow"
      command_regex = "^ls$"
      required_flags = ["-la", "-l", "-a"]
    `);
    expect(policy.bash_rules![0]!.required_flags).toEqual(["-la", "-l", "-a"]);
  });

  it("parses bash rules with flags_forbidden", () => {
    const policy = loadPolicyFromString(`
      [[bash_rules]]
      action = "deny"
      command_regex = "^rm$"
      flags_forbidden = ["-rf"]
    `);
    expect(policy.bash_rules![0]!.flags_forbidden).toEqual(["-rf"]);
  });

  it("parses line-level constraints", () => {
    const policy = loadPolicyFromString(`
      [[read_rules]]
      action = "allow"
      path = "/src/**"
      lines_begin = 1
      lines_end = 100
    `);
    const rule = policy.read_rules![0]!;
    expect(rule.lines_begin).toBe(1);
    expect(rule.lines_end).toBe(100);
  });

  it("parses comment on rules", () => {
    const policy = loadPolicyFromString(`
      [[read_rules]]
      action = "allow"
      path = "/src/**"
      comment = "Allow reading source code"
    `);
    expect(policy.read_rules![0]!.comment).toBe("Allow reading source code");
  });

  it("parses tool_defaults", () => {
    const policy = loadPolicyFromString(`
      [tool_defaults]
      read = "allow"
      write = "deny"
      bash = "deny"
    `);
    expect(policy.tool_defaults).toEqual({
      read: "allow",
      write: "deny",
      bash: "deny",
    });
  });

  describe("validation errors", () => {
    it("throws on invalid TOML syntax", () => {
      expect(() =>
        loadPolicyFromString("this is not valid toml {{{"),
      ).toThrow(PolicyParseError);
    });

    it("throws on bash rule with no conditions", () => {
      expect(() =>
        loadPolicyFromString(`
          [[bash_rules]]
          action = "allow"
        `),
      ).toThrow(PolicyParseError);
    });

    it("throws on missing path in read rule", () => {
      expect(() =>
        loadPolicyFromString(`
          [[read_rules]]
          action = "allow"
        `),
      ).toThrow(PolicyParseError);
    });

    it("throws on invalid action", () => {
      expect(() =>
        loadPolicyFromString(`
          [[read_rules]]
          action = "maybe"
          path = "/src/**"
        `),
      ).toThrow(PolicyParseError);
    });
  });
});
