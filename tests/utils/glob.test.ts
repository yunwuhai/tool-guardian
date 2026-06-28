// tests/utils/glob.test.ts
import { describe, it, expect } from "bun:test";
import { matchGlob, matchesAnyGlob } from "../../src/utils/glob.ts";

describe("matchGlob", () => {
  describe("** patterns (any depth)", () => {
    it("matches any depth with **/", () => {
      expect(matchGlob("/src/**", "/src/a.ts")).toBe(true);
      expect(matchGlob("/src/**", "/src/a/b.ts")).toBe(true);
      expect(matchGlob("/src/**", "/src/a/b/c.ts")).toBe(true);
    });

    it("**/ at start matches everything under prefix", () => {
      expect(matchGlob("/home/project/**", "/home/project/src/main.ts")).toBe(true);
      expect(matchGlob("/home/project/**", "/home/project/README.md")).toBe(true);
    });

    it("** without trailing / matches anything", () => {
      expect(matchGlob("/src/**", "/src/anything_here")).toBe(true);
      expect(matchGlob("/data/**", "/data/sub/deep/file.txt")).toBe(true);
    });
  });

  describe("* patterns (single segment)", () => {
    it("matches any file in a directory", () => {
      expect(matchGlob("/src/*.ts", "/src/a.ts")).toBe(true);
      expect(matchGlob("/src/*.ts", "/src/main.ts")).toBe(true);
    });

    it("does not cross directory boundaries", () => {
      expect(matchGlob("/src/*.ts", "/src/sub/a.ts")).toBe(false);
      expect(matchGlob("/data/*.txt", "/data/a/b/c.txt")).toBe(false);
    });

    it("matches partial filenames", () => {
      expect(matchGlob("/tmp/file-*.log", "/tmp/file-error.log")).toBe(true);
      expect(matchGlob("/tmp/file-*.log", "/tmp/file-access.log")).toBe(true);
    });
  });

  describe("? patterns (single character)", () => {
    it("matches exactly one character", () => {
      expect(matchGlob("/data/file-?.txt", "/data/file-1.txt")).toBe(true);
      expect(matchGlob("/data/file-?.txt", "/data/file-a.txt")).toBe(true);
    });

    it("does not match multiple characters", () => {
      expect(matchGlob("/data/file-?.txt", "/data/file-12.txt")).toBe(false);
    });
  });

  describe("special regex characters in patterns", () => {
    it("escapes regex special chars in the pattern", () => {
      expect(matchGlob("/home/user/.git", "/home/user/.git")).toBe(true);
      expect(matchGlob("/home/user/project+(test)", "/home/user/project+(test)")).toBe(true);
    });

    it("matches dotfiles", () => {
      expect(matchGlob("/home/**/.env", "/home/project/.env")).toBe(true);
      expect(matchGlob("/home/project/.*", "/home/project/.gitignore")).toBe(true);
    });
  });

  describe("exact matching", () => {
    it("exact path matches literally", () => {
      expect(matchGlob("/etc/passwd", "/etc/passwd")).toBe(true);
      expect(matchGlob("/etc/passwd", "/etc/shadow")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("empty pattern matches empty path", () => {
      expect(matchGlob("", "")).toBe(true);
    });

    it("empty pattern does not match non-empty path", () => {
      expect(matchGlob("", "/something")).toBe(false);
    });

    it("root pattern", () => {
      expect(matchGlob("/", "/")).toBe(true);
      expect(matchGlob("/", "/other")).toBe(false);
    });
  });
});

describe("matchesAnyGlob", () => {
  it("matches if any pattern matches", () => {
    expect(matchesAnyGlob(["/src/**", "/tests/**"], "/src/main.ts")).toBe(true);
    expect(matchesAnyGlob(["/src/**", "/tests/**"], "/tests/main.test.ts")).toBe(true);
  });

  it("returns false if no pattern matches", () => {
    expect(matchesAnyGlob(["/src/**", "/tests/**"], "/docs/readme.md")).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(matchesAnyGlob([], "/anything.txt")).toBe(false);
  });

  it("returns true if one pattern matches out of many", () => {
    expect(matchesAnyGlob(["/a/**", "/b/**", "/c/**"], "/a/file.txt")).toBe(true);
  });
});
