// audit/audit-engine.ts
// ===========================================================================
// Central audit engine — orchestrates tool call permission checking.
//
// Responsibilities:
//   1. Load and cache policies from TOML files
//   2. Normalize policy rules into GenericRule[] via normalizeRules()
//   3. Convert tool-specific inputs to StructuredRequest via templates
//   4. Check each request against the generic checker (deny-first)
//   5. Apply per-tool defaults and global fallback
//   6. Log every decision to the audit log
//   7. Support runtime policy switching and reloading
//
// Architecture:
//   AuditEngine is a convenience layer on top of the generic orchestration
//   layer (core/generic-checker + templates). It handles PI-specific routing
//   so that callers just call `engine.check("read", {path: "/file"})`.
//   External agents can skip the engine entirely and use checkGeneric() directly.
// ===========================================================================

import { loadPolicyFile, normalizeRules } from "../parser/toml-policy.ts";
import { checkGeneric } from "../core/generic-checker.ts";
import { requestFromRead } from "../templates/read.ts";
import { requestFromWrite } from "../templates/write.ts";
import { requestFromEdit } from "../templates/edit.ts";
import { requestFromBash } from "../templates/bash.ts";
import { requestFromPathTool } from "../templates/path-tool.ts";
import { parseBashCommand, extractSubcommands } from "../parser/bash-parser.ts";
import type { GenericRule, GenericMatchResult, StructuredRequest } from "../core/types.ts";
import { AuditLog } from "./audit-log.ts";
import type { AppVerdict, PolicyInfo } from "./types.ts";
import type { PolicyDocument } from "../policy/types.ts";

// ---------------------------------------------------------------------------
// AuditEngine class
// ---------------------------------------------------------------------------

export class AuditEngine {
  private policy: PolicyDocument | null = null;
  private genericRules: GenericRule[] = [];
  private policyPath: string | null = null;
  private loadedAt: string | null = null;
  private log: AuditLog;

  constructor(log?: AuditLog) {
    this.log = log ?? new AuditLog();
  }

  // -----------------------------------------------------------------------
  // Policy lifecycle
  // -----------------------------------------------------------------------

  /**
   * Load a policy from a TOML file.
   * Rules are normalized into GenericRule[] for the generic checker.
   */
  loadPolicy(filePath: string): void {
    this.policy = loadPolicyFile(filePath);
    this.genericRules = normalizeRules(this.policy);
    this.policyPath = filePath;
    this.loadedAt = new Date().toISOString();
  }

  /**
   * Load a policy from an already-parsed PolicyDocument (e.g., for testing).
   */
  loadPolicyDocument(doc: PolicyDocument, sourcePath?: string): void {
    this.policy = doc;
    this.genericRules = normalizeRules(doc);
    this.policyPath = sourcePath ?? "(inline)";
    this.loadedAt = new Date().toISOString();
  }

  /**
   * Switch to a different policy file at runtime.
   */
  switchPolicy(filePath: string): void {
    this.loadPolicy(filePath);
  }

  /**
   * Reload the current policy file from disk.
   */
  reloadPolicy(): void {
    if (!this.policyPath) {
      throw new Error("No policy loaded — cannot reload");
    }
    this.loadPolicy(this.policyPath);
  }

  /**
   * Check if a policy is currently loaded.
   */
  hasPolicy(): boolean {
    return this.policy !== null;
  }

  /**
   * Get summary info about the currently loaded policy.
   */
  getPolicyInfo(): PolicyInfo | null {
    if (!this.policy) return null;
    return {
      filePath: this.policyPath ?? "(inline)",
      unknownToolAction: this.policy.unknown_tool_action,
      readRuleCount: this.policy.read_rules?.length ?? 0,
      writeRuleCount: this.policy.write_rules?.length ?? 0,
      editRuleCount: this.policy.edit_rules?.length ?? 0,
      bashRuleCount: this.policy.bash_rules?.length ?? 0,
      grepRuleCount: this.policy.grep_rules?.length ?? 0,
      findRuleCount: this.policy.find_rules?.length ?? 0,
      lsRuleCount: this.policy.ls_rules?.length ?? 0,
      defaultAction: this.policy.default_action ?? "deny",
      loadedAt: this.loadedAt ?? new Date().toISOString(),
    };
  }

  /**
   * Access the normalized rules (for advanced use).
   */
  getGenericRules(): GenericRule[] {
    return this.genericRules;
  }

  // -----------------------------------------------------------------------
  // Audit log access
  // -----------------------------------------------------------------------

  getAuditLog(): AuditLog {
    return this.log;
  }

  // -----------------------------------------------------------------------
  // Main check method
  // -----------------------------------------------------------------------

  /**
   * Check whether a tool call is allowed.
   *
   * Routes by tool name to the appropriate template, builds a
   * StructuredRequest, then checks against the normalized rules.
   *
   * @param toolName - The tool name (read, write, edit, bash, grep, find, ls)
   * @param input - The tool's input parameters
   * @returns AppVerdict with allowed status and reason
   */
  check(toolName: string, input: Record<string, unknown>): AppVerdict {
    let requests: StructuredRequest[];

    switch (toolName) {
      case "read": {
        const path = input["path"] as string | undefined;
        if (!path) {
          return this.deny("read", toolName, input, "read: missing `path` parameter");
        }
        const offset = input["offset"] as number | undefined;
        const limit = input["limit"] as number | undefined;
        requests = [requestFromRead(path, offset, limit)];
        break;
      }
      case "write": {
        const path = input["path"] as string | undefined;
        if (!path) {
          return this.deny("write", toolName, input, "write: missing `path` parameter");
        }
        requests = [requestFromWrite(path)];
        break;
      }
      case "edit": {
        const path = input["path"] as string | undefined;
        if (!path) {
          return this.deny("edit", toolName, input, "edit: missing `path` parameter");
        }
        requests = [requestFromEdit(path)];
        break;
      }
      case "bash": {
        const command = input["command"] as string | undefined;
        if (!command) {
          return this.deny("bash", toolName, input, "bash: missing `command` parameter");
        }

        // Check for dangerous command substitution: $(...) and `...`
        const subcommands = extractSubcommands(command);
        if (subcommands.length > 0) {
          const bashFallback = this.getFallback("bash");
          for (const sub of subcommands) {
            const subRequests = requestFromBash(sub);
            for (const req of subRequests) {
              const result = checkGeneric(this.genericRules, req, bashFallback);
              if (!result.allowed) {
                return this.toVerdict(toolName, input, {
                  ...result,
                  reason: `Command substitution blocked: ${result.reason}`,
                });
              }
            }
          }
        }

        requests = requestFromBash(command);
        break;
      }
      case "grep": {
        const path = input["path"] as string | undefined;
        if (!path) {
          return this.deny("grep", toolName, input, "grep: missing `path` parameter");
        }
        requests = [requestFromPathTool("grep", path)];
        break;
      }
      case "find": {
        const path = input["path"] as string | undefined;
        if (!path) {
          return this.deny("find", toolName, input, "find: missing `path` parameter");
        }
        requests = [requestFromPathTool("find", path)];
        break;
      }
      case "ls": {
        const path = input["path"] as string | undefined;
        if (!path) {
          return this.deny("ls", toolName, input, "ls: missing `path` parameter");
        }
        requests = [requestFromPathTool("ls", path)];
        break;
      }
      default:
        // Unknown tool — respect policy's unknown_tool_action
        if (this.policy?.unknown_tool_action === "deny") {
          return this.deny("unknown_tool", toolName, input,
            `Tool "${toolName}" is not recognized — blocked by policy (unknown_tool_action=deny)`);
        }
        return this.passThrough(toolName, input);
    }

    const fallbackAction = this.getFallback(toolName);

    // Check redirect target paths against write rules (for bash commands)
    if (toolName === "bash") {
      const parsed = parseBashCommand(input["command"] as string);
      const writeFallback = this.getFallback("write");
      for (const segment of parsed.segments) {
        for (const rp of segment.redirectPaths) {
          const writeRequest = requestFromWrite(rp);
          const writeResult = checkGeneric(this.genericRules, writeRequest, writeFallback);
          if (!writeResult.allowed) {
            return this.toVerdict(toolName, input, {
              ...writeResult,
              reason: `Redirect target "${rp}" blocked: ${writeResult.reason}`,
            });
          }
        }
      }

      // Cross-check bash command file paths against read_rules deny patterns.
      // Prevents reading files via bash (e.g., cat /secrets/key) that would be
      // denied by the read tool. Fallback "allow" is intentional: we only block
      // paths EXPLICITLY denied by read_rules, not all unmatched paths.
      for (const segment of parsed.segments) {
        for (const p of segment.paths) {
          const readRequest = requestFromRead(p);
          const readResult = checkGeneric(this.genericRules, readRequest, "allow");
          if (!readResult.allowed) {
            return this.toVerdict(toolName, input, {
              ...readResult,
              reason: `bash file path "${p}" blocked by read rule: ${readResult.reason}`,
            });
          }
        }
      }
    }

    // For single-request tools, simple check
    if (requests.length === 1) {
      const result = checkGeneric(this.genericRules, requests[0]!, fallbackAction);
      return this.toVerdict(toolName, input, result);
    }

    // For multi-segment bash (chains with &&, ||, ;, |):
    // check each segment independently; first denial stops the chain
    for (const req of requests) {
      const result = checkGeneric(this.genericRules, req, fallbackAction);
      if (!result.allowed) {
        return this.toVerdict(toolName, input, result);
      }
    }

    // All segments passed
    return this.toVerdict(toolName, input, {
      allowed: true,
      action: "allow",
      ruleIndex: -1,
      comment: undefined,
      reason: "All command segments passed",
      section: undefined,
    });
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private getFallback(tool: string): "allow" | "deny" {
    const toolDefaults = this.policy?.tool_defaults;
    if (toolDefaults && tool in toolDefaults) {
      return toolDefaults[tool] as "allow" | "deny";
    }
    return this.policy?.default_action ?? "deny";
  }

  private deny(
    reason: string,
    _toolName: string,
    input: Record<string, unknown>,
    message: string,
  ): AppVerdict {
    const verdict: AppVerdict = {
      allowed: false,
      reason: message,
    };
    this.log.record(_toolName, input, verdict);
    return verdict;
  }

  private passThrough(toolName: string, input: Record<string, unknown>): AppVerdict {
    const verdict: AppVerdict = {
      allowed: true,
      reason: `Tool "${toolName}" is not audited — pass through`,
    };
    this.log.record(toolName, input, verdict);
    return verdict;
  }

  private toVerdict(
    toolName: string,
    input: Record<string, unknown>,
    result: GenericMatchResult,
  ): AppVerdict {
    const verdict: AppVerdict = {
      allowed: result.allowed,
      reason: result.reason,
      matchedRule: result.ruleIndex >= 0 && result.section
        ? {
            section: result.section,
            index: result.ruleIndex,
            action: result.action,
            comment: result.comment,
          }
        : undefined,
    };
    this.log.record(toolName, input, verdict);
    return verdict;
  }
}
