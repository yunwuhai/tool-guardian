// tests/audit/audit-log.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { AuditLog } from "../../src/audit/audit-log.ts";
import type { AppVerdict } from "../../src/audit/types.ts";

describe("AuditLog", () => {
  let log: AuditLog;

  beforeEach(() => {
    log = new AuditLog();
  });

  const allowedVerdict: AppVerdict = {
    allowed: true,
    reason: "allowed by rule 1",
  };

  const deniedVerdict: AppVerdict = {
    allowed: false,
    reason: "blocked by rule 2",
    matchedRule: {
      section: "bash_rules",
      index: 2,
      action: "deny",
      comment: undefined,
    },
  };

  it("records entries", () => {
    log.record("read", { path: "/home/test.txt" }, allowedVerdict);
    expect(log.count).toBe(1);
  });

  it("retrieves entries", () => {
    log.record("read", { path: "/home/test.txt" }, allowedVerdict);
    const entries = log.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.tool).toBe("read");
    expect(entries[0]!.verdict.allowed).toBe(true);
  });

  it("gets last entry", () => {
    log.record("read", { path: "/a" }, allowedVerdict);
    log.record("bash", { command: "ls" }, deniedVerdict);
    expect(log.getLastEntry()?.tool).toBe("bash");
  });

  it("returns undefined for empty log", () => {
    expect(log.getLastEntry()).toBeUndefined();
  });

  it("filters by tool", () => {
    log.record("read", { path: "/a" }, allowedVerdict);
    log.record("bash", { command: "ls" }, deniedVerdict);
    log.record("read", { path: "/b" }, allowedVerdict);
    expect(log.getEntriesByTool("read")).toHaveLength(2);
    expect(log.getEntriesByTool("bash")).toHaveLength(1);
    expect(log.getEntriesByTool("write")).toHaveLength(0);
  });

  it("filters denied entries", () => {
    log.record("read", { path: "/a" }, allowedVerdict);
    log.record("bash", { command: "rm" }, deniedVerdict);
    log.record("write", { path: "/b" }, deniedVerdict);
    expect(log.getDeniedEntries()).toHaveLength(2);
  });

  it("clears entries", () => {
    log.record("read", { path: "/a" }, allowedVerdict);
    log.clear();
    expect(log.count).toBe(0);
  });

  it("fires callbacks", () => {
    const received: string[] = [];
    log.onEntry((entry) => {
      received.push(entry.tool);
    });
    log.record("read", { path: "/a" }, allowedVerdict);
    log.record("bash", { command: "ls" }, allowedVerdict);
    expect(received).toEqual(["read", "bash"]);
  });

  it("ring buffer evicts oldest entries", () => {
    const smallLog = new AuditLog(3);
    for (let i = 0; i < 5; i++) {
      smallLog.record("read", { path: `/file${i}` }, allowedVerdict);
    }
    expect(smallLog.count).toBe(3);
    // Oldest 2 should be evicted
    const entries = smallLog.getEntries();
    expect(entries[0]!.input["path"]).toBe("/file2");
    expect(entries[2]!.input["path"]).toBe("/file4");
  });
});
