// engine/generic-check.ts
// ===========================================================================
// Generic path-based permission checker for grep, find, and ls tools.
//
// Matching strategy: deny-first, then allow.
//   1. If any deny rule matches → DENY
//   2. If any allow rule matches → ALLOW
//   3. Otherwise → fallback action
// ===========================================================================

import { matchesAnyGlob } from "../utils/glob.ts";
import type { PathToolRule } from "../policy/types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatchResult {
  allowed: boolean;
  action: "allow" | "deny";
  ruleIndex: number;
  comment: string | undefined;
  reason: string;
  section: string | undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function checkPathTool(
  rules: PathToolRule[] | undefined,
  path: string,
  fallbackAction: "allow" | "deny" = "deny",
  section: string = "path_rules",
): MatchResult {
  if (!rules || rules.length === 0) {
    return {
      allowed: fallbackAction === "allow",
      action: fallbackAction,
      ruleIndex: -1,
      comment: undefined,
      reason: `No ${section} — fallback to "${fallbackAction}"`,
      section,
    };
  }

  // Pass 1: Check deny rules — any match → deny
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!;
    if (rule.action !== "deny") continue;
    if (matchesAnyGlob([rule.path], path)) {
      return {
        allowed: false,
        action: "deny",
        ruleIndex: i,
        comment: rule.comment,
        reason: rule.comment ?? `Path "${path}" matches deny rule #${i + 1}`,
        section,
      };
    }
  }

  // Pass 2: Check allow rules — first match wins
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!;
    if (rule.action !== "allow") continue;
    if (matchesAnyGlob([rule.path], path)) {
      return {
        allowed: true,
        action: "allow",
        ruleIndex: i,
        comment: rule.comment,
        reason: rule.comment ?? `Path "${path}" matches allow rule #${i + 1}`,
        section,
      };
    }
  }

  // Fallback
  return {
    allowed: fallbackAction === "allow",
    action: fallbackAction,
    ruleIndex: -1,
    comment: undefined,
    reason: `No rule matched for "${path}" — fallback to "${fallbackAction}"`,
    section,
  };
}
