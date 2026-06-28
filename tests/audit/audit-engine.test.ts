// tests/audit/audit-engine.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { AuditEngine } from "../../src/audit/audit-engine.ts";
import { loadPolicyFile } from "../../src/parser/toml-policy.ts";

describe("AuditEngine", () => {
  let engine: AuditEngine;

  beforeEach(() => {
    engine = new AuditEngine();
  });

  describe("policy lifecycle", () => {
    it("loads a policy from file", () => {
      engine.loadPolicy("tests/fixtures/policy-basic.toml");
      expect(engine.hasPolicy()).toBe(true);
    });

    it("returns policy info", () => {
      engine.loadPolicy("tests/fixtures/policy-basic.toml");
      const info = engine.getPolicyInfo();
      expect(info).not.toBeNull();
      expect(info!.readRuleCount).toBe(2);
      expect(info!.bashRuleCount).toBe(2);
    });

    it("reloads policy", () => {
      engine.loadPolicy("tests/fixtures/policy-basic.toml");
      expect(() => engine.reloadPolicy()).not.toThrow();
    });

    it("throws on reload with no policy loaded", () => {
      expect(() => engine.reloadPolicy()).toThrow();
    });

    it("switches policy", () => {
      engine.loadPolicy("tests/fixtures/policy-basic.toml");
      engine.switchPolicy("tests/fixtures/policy-bash.toml");
      const info = engine.getPolicyInfo();
      expect(info!.bashRuleCount).toBe(5);
    });

    it("loads inline policy document", () => {
      engine.loadPolicyDocument({ default_action: "allow" });
      expect(engine.hasPolicy()).toBe(true);
      expect(engine.getPolicyInfo()!.defaultAction).toBe("allow");
    });
  });

  describe("check read", () => {
    beforeEach(() => {
      engine.loadPolicy("tests/fixtures/policy-basic.toml");
    });

    it("allows reading allowed path", () => {
      const verdict = engine.check("read", { path: "/home/project/src/main.ts" });
      expect(verdict.allowed).toBe(true);
    });

    it("denies reading denied path", () => {
      const verdict = engine.check("read", { path: "/home/project/secrets/key.pem" });
      expect(verdict.allowed).toBe(false);
    });

    it("denies read without path", () => {
      const verdict = engine.check("read", {});
      expect(verdict.allowed).toBe(false);
    });

    it("handles line-level read checks", () => {
      // Load line-level policy
      engine.loadPolicy("tests/fixtures/policy-line-level.toml");
      const verdict = engine.check("read", {
        path: "/home/project/src/main.ts",
        offset: 1,
        limit: 50,
      });
      expect(verdict.allowed).toBe(true);
    });
  });

  describe("check write", () => {
    beforeEach(() => {
      engine.loadPolicy("tests/fixtures/policy-basic.toml");
    });

    it("allows writing to allowed path", () => {
      const verdict = engine.check("write", { path: "/home/project/output/build.js" });
      expect(verdict.allowed).toBe(true);
    });

    it("denies writing without path", () => {
      const verdict = engine.check("write", {});
      expect(verdict.allowed).toBe(false);
    });
  });

  describe("check bash", () => {
    beforeEach(() => {
      engine.loadPolicy("tests/fixtures/policy-bash.toml");
    });

    it("allows safe commands", () => {
      const verdict = engine.check("bash", { command: "cat /home/project/file.txt" });
      expect(verdict.allowed).toBe(true);
    });

    it("denies rm -rf", () => {
      const verdict = engine.check("bash", { command: "rm -rf /tmp" });
      expect(verdict.allowed).toBe(false);
    });

    it("denies sudo", () => {
      const verdict = engine.check("bash", { command: "sudo ls" });
      expect(verdict.allowed).toBe(false);
    });

    it("denies bash without command", () => {
      const verdict = engine.check("bash", {});
      expect(verdict.allowed).toBe(false);
    });
  });

  describe("check grep/find/ls", () => {
    beforeEach(() => {
      engine.loadPolicy("tests/fixtures/policy-basic.toml");
    });

    it("passes through grep (no grep rules in basic policy, fallback deny)", () => {
      const verdict = engine.check("grep", { path: "/home/project/src" });
      // Basic policy has no grep_rules, tool_defaults has no grep → falls to default_action=deny
      expect(verdict.allowed).toBe(false);
    });
  });

  describe("unknown tool", () => {
    it("passes through unknown tools", () => {
      const verdict = engine.check("some_future_tool", {});
      expect(verdict.allowed).toBe(true);
    });
  });

  describe("audit log integration", () => {
    it("logs every decision", () => {
      engine.loadPolicy("tests/fixtures/policy-basic.toml");
      engine.check("read", { path: "/home/project/src/main.ts" });
      engine.check("bash", { command: "cat /etc/hosts" });
      expect(engine.getAuditLog().count).toBe(2);
    });
  });
});
