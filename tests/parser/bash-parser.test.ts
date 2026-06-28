// tests/parser/bash-parser.test.ts
import { describe, it, expect } from "bun:test";
import { parseBashCommand, isFlagPresent, extractSubcommands } from "../../src/parser/bash-parser.ts";

describe("parseBashCommand", () => {
  // -----------------------------------------------------------------------
  // Simple commands
  // -----------------------------------------------------------------------

  describe("simple commands", () => {
    it("parses a bare command", () => {
      const result = parseBashCommand("ls");
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]!.command).toBe("ls");
      expect(result.segments[0]!.subcommand).toBeNull();
      expect(result.segments[0]!.flags).toEqual([]);
    });

    it("parses command with flags", () => {
      const result = parseBashCommand("ls -la");
      const cmd = result.segments[0]!;
      expect(cmd.command).toBe("ls");
      expect(cmd.combinedFlags).toContain("-la");
      expect(cmd.flags).toContain("-l");
      expect(cmd.flags).toContain("-a");
    });

    it("parses command with path argument", () => {
      const result = parseBashCommand("ls /tmp");
      const cmd = result.segments[0]!;
      expect(cmd.command).toBe("ls");
      expect(cmd.paths).toContain("/tmp");
    });

    it("parses command with multiple path arguments", () => {
      const result = parseBashCommand("cat /tmp/a.txt /home/b.txt");
      const cmd = result.segments[0]!;
      expect(cmd.paths).toHaveLength(2);
      expect(cmd.paths).toContain("/tmp/a.txt");
      expect(cmd.paths).toContain("/home/b.txt");
    });
  });

  // -----------------------------------------------------------------------
  // Flag parsing
  // -----------------------------------------------------------------------

  describe("flag parsing", () => {
    it("expands -rf into individual -r and -f", () => {
      const result = parseBashCommand("rm -rf /tmp/test");
      const cmd = result.segments[0]!;
      expect(cmd.flags).toContain("-r");
      expect(cmd.flags).toContain("-f");
      expect(cmd.combinedFlags).toContain("-rf");
    });

    it("parses long flags", () => {
      const result = parseBashCommand("git commit --amend --no-verify");
      const cmd = result.segments[0]!;
      expect(cmd.flags).toContain("--amend");
      expect(cmd.flags).toContain("--no-verify");
    });

    it("parses --flag=value syntax", () => {
      const result = parseBashCommand("some-tool --output=result.txt");
      const cmd = result.segments[0]!;
      expect(cmd.flagsArgValues["--output"]).toBe("result.txt");
      // Bare filename w/o path prefix is not auto-detected as a path
      expect(cmd.flags).toContain("--output");
    });

    it("parses short flag with value", () => {
      const result = parseBashCommand("git -C /repo status");
      const cmd = result.segments[0]!;
      expect(cmd.flagsArgValues["-C"]).toBe("/repo");
      expect(cmd.paths).toContain("/repo");
      expect(cmd.subcommand).toBe("status");
    });
  });

  // -----------------------------------------------------------------------
  // Compound commands
  // -----------------------------------------------------------------------

  describe("compound commands", () => {
    it("detects git subcommand", () => {
      const result = parseBashCommand("git push origin main");
      const cmd = result.segments[0]!;
      expect(cmd.command).toBe("git");
      expect(cmd.subcommand).toBe("push");
    });

    it("detects npm subcommand", () => {
      const result = parseBashCommand("npm install lodash");
      const cmd = result.segments[0]!;
      expect(cmd.command).toBe("npm");
      expect(cmd.subcommand).toBe("install");
    });

    it("detects docker subcommand", () => {
      const result = parseBashCommand("docker build -t myimage .");
      const cmd = result.segments[0]!;
      expect(cmd.command).toBe("docker");
      expect(cmd.subcommand).toBe("build");
    });

    it("parses git with flags and path", () => {
      const result = parseBashCommand("git --git-dir=/repo/.git status");
      const cmd = result.segments[0]!;
      expect(cmd.command).toBe("git");
      expect(cmd.subcommand).toBe("status");
      expect(cmd.flagsArgValues["--git-dir"]).toBe("/repo/.git");
      expect(cmd.paths).toContain("/repo/.git");
    });

    it("handles full path to compound command", () => {
      const result = parseBashCommand("/usr/bin/git status");
      const cmd = result.segments[0]!;
      expect(cmd.command).toBe("git");
      expect(cmd.subcommand).toBe("status");
    });
  });

  // -----------------------------------------------------------------------
  // Quoted strings
  // -----------------------------------------------------------------------

  describe("quoted strings", () => {
    it("preserves single-quoted arguments", () => {
      const result = parseBashCommand("echo 'hello world'");
      const cmd = result.segments[0]!;
      expect(cmd.positionalArgs).toContain("hello world");
    });

    it("preserves double-quoted arguments", () => {
      const result = parseBashCommand('echo "hello world"');
      const cmd = result.segments[0]!;
      expect(cmd.positionalArgs).toContain("hello world");
    });

    it("handles quoted arguments with spaces as single token", () => {
      const result = parseBashCommand("git commit -m 'fix: update login flow'");
      const cmd = result.segments[0]!;
      // -m is a short flag, its value is stored in flagsArgValues
      expect(cmd.flagsArgValues["-m"]).toBe("fix: update login flow");
      expect(cmd.subcommand).toBe("commit");
    });
  });

  // -----------------------------------------------------------------------
  // Command chains
  // -----------------------------------------------------------------------

  describe("command chains (&&, ;, ||)", () => {
    it("splits on &&", () => {
      const result = parseBashCommand("cd /repo && npm test");
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]!.command).toBe("cd");
      expect(result.segments[1]!.command).toBe("npm");
      expect(result.segments[1]!.subcommand).toBe("test");
    });

    it("splits on ;", () => {
      const result = parseBashCommand("echo hello; echo world");
      expect(result.segments).toHaveLength(2);
    });

    it("splits on ||", () => {
      const result = parseBashCommand("make build || echo failed");
      expect(result.segments).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // Pipes
  // -----------------------------------------------------------------------

  describe("pipes", () => {
    it("splits on pipe", () => {
      const result = parseBashCommand("cat file.txt | grep pattern");
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]!.command).toBe("cat");
      expect(result.segments[1]!.command).toBe("grep");
    });

    it("handles multiple pipes", () => {
      const result = parseBashCommand("cat file | grep foo | sort | uniq");
      expect(result.segments).toHaveLength(4);
    });
  });

  // -----------------------------------------------------------------------
  // Environment variables
  // -----------------------------------------------------------------------

  describe("environment variables", () => {
    it("extracts VAR=value before command", () => {
      const result = parseBashCommand("NODE_ENV=production node server.js");
      const cmd = result.segments[0]!;
      expect(cmd.envVars["NODE_ENV"]).toBe("production");
      expect(cmd.command).toBe("node");
    });

    it("extracts multiple env vars", () => {
      const result = parseBashCommand("VAR1=a VAR2=b command arg");
      const cmd = result.segments[0]!;
      expect(cmd.envVars["VAR1"]).toBe("a");
      expect(cmd.envVars["VAR2"]).toBe("b");
    });
  });

  // -----------------------------------------------------------------------
  // Path detection
  // -----------------------------------------------------------------------

  describe("path detection", () => {
    it("detects absolute paths", () => {
      const result = parseBashCommand("cat /etc/hosts");
      const cmd = result.segments[0]!;
      expect(cmd.paths).toContain("/etc/hosts");
    });

    it("detects relative paths", () => {
      const result = parseBashCommand("node ./script.js");
      const cmd = result.segments[0]!;
      expect(cmd.paths).toContain("./script.js");
    });

    it("detects parent directory paths", () => {
      const result = parseBashCommand("ls ../sibling/file.txt");
      const cmd = result.segments[0]!;
      expect(cmd.paths).toContain("../sibling/file.txt");
    });

    it("detects home directory paths", () => {
      const result = parseBashCommand("cat ~/.bashrc");
      const cmd = result.segments[0]!;
      expect(cmd.paths).toContain("~/.bashrc");
    });

    it("detects dot and dot-dot", () => {
      let result = parseBashCommand("ls .");
      expect(result.segments[0]!.paths).toContain(".");

      result = parseBashCommand("ls ..");
      expect(result.segments[0]!.paths).toContain("..");
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe("edge cases", () => {
    it("handles empty string", () => {
      const result = parseBashCommand("");
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]!.command).toBe("");
    });

    it("handles whitespace-only string", () => {
      const result = parseBashCommand("   ");
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]!.command).toBe("");
    });

    it("handles command with only flags", () => {
      const result = parseBashCommand("ls -la");
      const cmd = result.segments[0]!;
      expect(cmd.command).toBe("ls");
      expect(cmd.positionalArgs).toEqual([]);
    });

    it("handles rm -rf with path", () => {
      const result = parseBashCommand("rm -rf /home/user/project");
      const cmd = result.segments[0]!;
      expect(cmd.command).toBe("rm");
      expect(cmd.flags).toContain("-r");
      expect(cmd.flags).toContain("-f");
      expect(cmd.paths).toContain("/home/user/project");
    });

    it("handles sudo", () => {
      const result = parseBashCommand("sudo rm -rf /");
      const cmd = result.segments[0]!;
      expect(cmd.command).toBe("sudo");
      // rm itself is NOT the subcommand — sudo is not compound
      expect(cmd.subcommand).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// isFlagPresent tests
// ---------------------------------------------------------------------------

describe("isFlagPresent", () => {
  it("matches a single flag", () => {
    const result = parseBashCommand("ls -la");
    expect(isFlagPresent(result.segments[0]!, "-l")).toBe(true);
    expect(isFlagPresent(result.segments[0]!, "-a")).toBe(true);
    expect(isFlagPresent(result.segments[0]!, "-r")).toBe(false);
  });

  it("matches combined flag spec", () => {
    const result = parseBashCommand("rm -rf /tmp");
    expect(isFlagPresent(result.segments[0]!, "-rf")).toBe(true);
    expect(isFlagPresent(result.segments[0]!, "-fr")).toBe(true); // same flags
  });

  it("matches multi-part flag spec", () => {
    const result = parseBashCommand("rm -r -f /tmp");
    expect(isFlagPresent(result.segments[0]!, "-r -f")).toBe(true);
  });

  it("matches long flags", () => {
    const result = parseBashCommand("git commit --amend");
    expect(isFlagPresent(result.segments[0]!, "--amend")).toBe(true);
    expect(isFlagPresent(result.segments[0]!, "--no-verify")).toBe(false);
  });

  it("does not partial-match combined flags", () => {
    // -rf check should require BOTH -r and -f
    const result = parseBashCommand("rm -r /tmp"); // only -r, not -f
    expect(isFlagPresent(result.segments[0]!, "-rf")).toBe(false);
  });
});

describe("extractSubcommands", () => {
  it("extracts single $() substitution", () => {
    const result = extractSubcommands("echo $(whoami)");
    expect(result).toEqual(["whoami"]);
  });

  it("extracts nested $() substitution recursively", () => {
    const result = extractSubcommands("echo $(echo $(rm -rf /tmp))");
    expect(result).toContain("rm -rf /tmp");
    expect(result).toContain("echo $(rm -rf /tmp)");
    expect(result).toHaveLength(2);
  });

  it("extracts deeply nested $() substitution", () => {
    const result = extractSubcommands("echo $(echo $(echo $(rm -rf /tmp)))");
    expect(result).toContain("rm -rf /tmp");
    expect(result).toHaveLength(3);
  });

  it("extracts backtick substitution", () => {
    const result = extractSubcommands("echo `whoami`");
    expect(result).toEqual(["whoami"]);
  });

  it("extracts nested backtick + $() substitution", () => {
    // Both extraction methods run on the same input, so inner content may
    // appear twice (once from $() extraction, once from backtick extraction).
    // Duplicate entries are harmless — callers independently check each one.
    const result = extractSubcommands("echo `echo $(rm -rf /tmp)`");
    expect(result.filter(s => s === "rm -rf /tmp")).toHaveLength(2);
    expect(result.filter(s => s === "echo $(rm -rf /tmp)")).toHaveLength(1);
  });

  it("returns empty array for command without substitution", () => {
    const result = extractSubcommands("echo hello world");
    expect(result).toEqual([]);
  });

  it("handles empty string", () => {
    const result = extractSubcommands("");
    expect(result).toEqual([]);
  });
});
