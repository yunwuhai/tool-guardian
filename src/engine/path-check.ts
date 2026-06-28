// engine/path-check.ts
// ===========================================================================
// Path-based permission checker for read, write, and edit tools.
//
// Checks file paths against policy rules with glob pattern matching
// and optional line-range overlap checking.
//
// Matching strategy: deny-first, then allow.
//   1. If any deny rule matches → DENY (deny always wins)
//   2. If any allow rule matches → ALLOW
//   3. Otherwise → fallback action
// ===========================================================================

import { matchesAnyGlob } from "../utils/glob.ts";
import { normalizePath } from "../utils/path-utils.ts";
import { rangesOverlap, type LineRange } from "./line-range.ts";
import type { ReadRule, WriteRule, EditRule } from "../policy/types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PathCheckInput {
  path: string;
  /** For read: the line range being read */
  lineRange?: LineRange | undefined;
  /** For edit: the line range being edited (affected by oldText match) */
  affectedLineRange?: LineRange | undefined;
}

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

export function checkReadPath(
  rules: ReadRule[] | undefined,
  input: PathCheckInput,
  fallbackAction: "allow" | "deny" = "deny",
): MatchResult {
  return checkPathRules(rules, input, fallbackAction, "read_rules");
}

export function checkWritePath(
  rules: WriteRule[] | undefined,
  input: PathCheckInput,
  fallbackAction: "allow" | "deny" = "deny",
): MatchResult {
  return checkPathRules(rules, input, fallbackAction, "write_rules");
}

export function checkEditPath(
  rules: EditRule[] | undefined,
  input: PathCheckInput,
  fallbackAction: "allow" | "deny" = "deny",
): MatchResult {
  return checkPathRules(rules, input, fallbackAction, "edit_rules");
}

// ---------------------------------------------------------------------------
// Internal: deny-first matching
// ---------------------------------------------------------------------------

interface PathRuleLike {
  action: "allow" | "deny";
  path: string;
  lines_begin?: number | undefined;
  lines_end?: number | undefined;
  comment?: string | undefined;
}

function checkPathRules<T extends PathRuleLike>(
  rules: T[] | undefined,
  input: PathCheckInput,
  fallbackAction: "allow" | "deny",
  section: string,
): MatchResult {
  // Normalize path to handle relative paths, double slashes, .. segments
  const normalizedPath = normalizePath(input.path);

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

  const requestRange = input.lineRange ?? input.affectedLineRange;

  // Pass 1: Check deny rules — any match → deny immediately
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!;
    if (rule.action !== "deny") continue;
    if (ruleMatchesPath(rule, normalizedPath, requestRange)) {
      return {
        allowed: false,
        action: "deny",
        ruleIndex: i,
        comment: rule.comment,
        reason: rule.comment ?? `Path "${normalizedPath}" matches deny rule #${i + 1}`,
        section,
      };
    }
  }

  // Pass 2: Check allow rules — first match wins
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!;
    if (rule.action !== "allow") continue;
    if (ruleMatchesPath(rule, normalizedPath, requestRange)) {
      return {
        allowed: true,
        action: "allow",
        ruleIndex: i,
        comment: rule.comment,
        reason: rule.comment ?? `Path "${input.path}" matches allow rule #${i + 1}`,
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
    reason: `No rule matched for "${input.path}" — fallback to "${fallbackAction}"`,
    section,
  };
}

function ruleMatchesPath(
  rule: { path: string; lines_begin?: number | undefined; lines_end?: number | undefined },
  filePath: string,
  requestRange?: LineRange,
): boolean {
  // Path must match glob
  if (!matchesAnyGlob([rule.path], filePath)) return false;

  // If rule has no line constraints, path match is sufficient
  if (rule.lines_begin === undefined && rule.lines_end === undefined) return true;

  // Rule has line constraints — need to check overlap with requested range
  if (!requestRange) return false; // Can't verify → fail-safe

  const ruleRange: LineRange = {
    begin: rule.lines_begin ?? 0,
    end: rule.lines_end ?? 0,
  };

  return rangesOverlap(ruleRange, requestRange);
}
