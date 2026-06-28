// core/generic-checker.ts
// ===========================================================================
// Generic deny-first checker — the heart of tool-guardian.
//
// Any agent can use this to check a structured tool request against a list
// of generic rules. The checker implements deny-over-allow semantics:
//   1. Pass 1: Check all deny rules — first match → DENY
//   2. Pass 2: Check all allow rules — first match → ALLOW
//   3. No match → fallback action
//
// All conditions within a rule are AND-ed. If any condition fails, the rule
// doesn't match and evaluation continues to the next rule.
// ===========================================================================

import { matchesAnyGlob } from "../utils/glob.ts";
import { normalizePath } from "../utils/path-utils.ts";
import { rangesOverlap } from "../engine/line-range.ts";
import type { GenericRule, GenericMatchResult, StructuredRequest, RuleConflict } from "./types.ts";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check a structured request against a list of generic rules.
 *
 * @param rules - The ordered list of rules (deny-first matching)
 * @param request - The structured tool request
 * @param fallbackAction - Action when no rule matches (default: "deny")
 * @returns The match result with allowed status and reason
 */
export function checkGeneric(
  rules: GenericRule[],
  request: StructuredRequest,
  fallbackAction: "allow" | "deny" = "deny",
): GenericMatchResult {
  if (!rules || rules.length === 0) {
    return {
      allowed: fallbackAction === "allow",
      action: fallbackAction,
      ruleIndex: -1,
      comment: undefined,
      reason: `No rules — fallback to "${fallbackAction}"`,
      section: undefined,
    };
  }

  // Pass 1: Deny rules — any match triggers immediate denial
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!;
    if (rule.action !== "deny") continue;
    if (genericRuleMatches(rule, request)) {
      return {
        allowed: false,
        action: "deny",
        ruleIndex: i,
        comment: rule.comment,
        reason: rule.comment ?? `Request "${request.tool}/${request.command}" matches deny rule #${i + 1} in [${rule.sourceSection}]`,
        section: rule.sourceSection,
      };
    }
  }

  // Pass 2: Allow rules — first match wins
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!;
    if (rule.action !== "allow") continue;
    if (genericRuleMatches(rule, request)) {
      return {
        allowed: true,
        action: "allow",
        ruleIndex: i,
        comment: rule.comment,
        reason: rule.comment ?? `Request "${request.tool}/${request.command}" matches allow rule #${i + 1} in [${rule.sourceSection}]`,
        section: rule.sourceSection,
      };
    }
  }

  // Fallback
  return {
    allowed: fallbackAction === "allow",
    action: fallbackAction,
    ruleIndex: -1,
    comment: undefined,
    reason: `No rule matched for "${request.tool}/${request.command}" — fallback to "${fallbackAction}"`,
    section: undefined,
  };
}

// ---------------------------------------------------------------------------
// Internal: single-rule matching
// ---------------------------------------------------------------------------

function genericRuleMatches(rule: GenericRule, request: StructuredRequest): boolean {
  // 1. Tool regex — prevents cross-tool rule matching
  if (rule.tool_regex !== undefined) {
    try {
      if (!new RegExp(rule.tool_regex).test(request.tool)) return false;
    } catch {
      return false;
    }
  }

  // 2. Command regex
  if (rule.command_regex !== undefined) {
    try {
      if (!new RegExp(rule.command_regex).test(request.command)) return false;
    } catch {
      return false;
    }
  }

  // 3. Subcommand regex
  if (rule.subcommand_regex !== undefined) {
    if (!request.subcommand) return false;
    try {
      if (!new RegExp(rule.subcommand_regex).test(request.subcommand)) return false;
    } catch {
      return false;
    }
  }

  // 4. Required flags — all must be present (AND semantics)
  if (rule.required_flags !== undefined) {
    if (!rule.required_flags.every(f => isFlagPresent(request, f))) return false;
  }

  // 5. Flags forbidden — context-dependent semantics
  if (rule.flags_forbidden !== undefined) {
    const hasForbidden = rule.flags_forbidden.some(f => isFlagPresent(request, f));
    if (rule.action === "deny") {
      // Deny rule: forbidden flags must be present to trigger match
      if (!hasForbidden) return false;
    } else {
      // Allow rule: forbidden flags must NOT be present
      if (hasForbidden) return false;
    }
  }

  // 6. Flag value pattern + path pattern (paired check)
  if (rule.flag_value_pattern !== undefined) {
    let found = false;
    try {
      const flagRe = new RegExp(rule.flag_value_pattern);
      for (const [flagName, flagVal] of Object.entries(request.flagsArgValues)) {
        if (flagRe.test(flagName)) {
          found = true;
          if (rule.path_pattern !== undefined) {
            if (!matchesAnyGlob([rule.path_pattern], flagVal)) return false;
          }
        }
      }
    } catch {
      return false;
    }
    if (!found) return false;
  }

  // 7. Path pattern (independent, when flag_value_pattern is not set)
  const pathPattern = rule.path_pattern;
  if (pathPattern !== undefined && rule.flag_value_pattern === undefined) {
    if (request.paths.length === 0) return false;
    if (!request.paths.some(p => matchesAnyGlob([pathPattern], normalizePath(p)))) return false;
  }

  // 8. Args pattern — regex against the full raw argument string
  if (rule.args_pattern !== undefined) {
    try {
      if (!new RegExp(rule.args_pattern).test(request.rawArgs)) return false;
    } catch {
      return false;
    }
  }

  // 9. Line range overlap — for read/write/edit with line constraints
  if (rule.lines_begin !== undefined || rule.lines_end !== undefined) {
    if (!request.lineRange) return false; // Can't verify → fail-safe (no match)
    const ruleRange = { begin: rule.lines_begin ?? 0, end: rule.lines_end ?? 0 };
    if (!rangesOverlap(ruleRange, request.lineRange)) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Rule validation
// ---------------------------------------------------------------------------

/**
 * Validate a list of GenericRules for potential conflicts.
 * Detects rules that overlap in scope — where one rule may shadow another.
 */
export function validateRules(rules: GenericRule[]): RuleConflict[] {
  const conflicts: RuleConflict[] = [];

  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i]!;
      const b = rules[j]!;

      // Check tool + command overlap
      const toolsOverlap = a.tool_regex === undefined || b.tool_regex === undefined || a.tool_regex === b.tool_regex;
      const cmdsOverlap = a.command_regex === undefined || b.command_regex === undefined || a.command_regex === b.command_regex;

      if (!toolsOverlap || !cmdsOverlap) continue;

      // Check if path_patterns overlap (when both specified)
      if (a.path_pattern !== undefined && b.path_pattern !== undefined) {
        if (!pathsMightOverlap(a.path_pattern, b.path_pattern)) continue;
      }

      // Check if subcommand_regexes overlap (when both specified and different)
      if (a.subcommand_regex !== undefined && b.subcommand_regex !== undefined) {
        if (!regexesMightOverlap(a.subcommand_regex, b.subcommand_regex)) continue;
      }

      if (a.action !== b.action) {
        // deny vs allow — deny-first applies
        const denyRule = a.action === "deny" ? a : b;
        const allowRule = a.action === "allow" ? a : b;
        const denyIdx = a.action === "deny" ? i : j;
        const allowIdx = a.action === "allow" ? i : j;
        conflicts.push({
          type: "deny_overrides_allow",
          ruleA: { index: denyIdx, section: denyRule.sourceSection, action: "deny" },
          ruleB: { index: allowIdx, section: allowRule.sourceSection, action: "allow" },
          description: "Deny rule #" + (denyIdx + 1) + " [" + denyRule.sourceSection + "] and allow rule #" + (allowIdx + 1) + " [" + allowRule.sourceSection + "] overlap — deny always wins.",
          recommendation: "If the deny rule is intended to block what the allow rule permits, this is correct. Otherwise, narrow one rule's conditions.",
        });
      } else if (a.action === "allow") {
        // Both allow — first-allow-wins
        conflicts.push({
          type: "same_action_shadow",
          ruleA: { index: i, section: a.sourceSection, action: "allow" },
          ruleB: { index: j, section: b.sourceSection, action: "allow" },
          description: "Allow rule #" + (i + 1) + " [" + a.sourceSection + "] shadows allow rule #" + (j + 1) + " [" + b.sourceSection + "]: first match wins.",
          recommendation: "Rule #" + (j + 1) + " may never be reached. Consider merging or reordering rules.",
        });
      } else {
        // Both deny
        conflicts.push({
          type: "same_action_shadow",
          ruleA: { index: i, section: a.sourceSection, action: "deny" },
          ruleB: { index: j, section: b.sourceSection, action: "deny" },
          description: "Deny rule #" + (i + 1) + " [" + a.sourceSection + "] shadows deny rule #" + (j + 1) + " [" + b.sourceSection + "]: first match wins.",
          recommendation: "Rule #" + (j + 1) + " may be unreachable. Check if both rules are needed.",
        });
      }
    }
  }

  return conflicts;
}

// ---------------------------------------------------------------------------
// Conflict detection helpers
// ---------------------------------------------------------------------------

/**
 * Heuristic check if two glob path patterns might overlap.
 *
 * Extracts the base path (before the first wildcard char) from each pattern.
 * If one base is a prefix of the other, they could match the same paths.
 *
 * Examples:
 *   "src/**" vs "tests/**"   → bases "src/" vs "tests/" → no overlap
 *   "src/**" vs "**"         → bases "src/" vs ""       → overlap
 *   "/a/b/**" vs "/a/b/c/**" → bases "/a/b/" vs "/a/b/c/" → overlap
 */
function pathsMightOverlap(patA: string, patB: string): boolean {
  const baseA = patA.split(/[*?[{]/)[0]!;
  const baseB = patB.split(/[*?[{]/)[0]!;
  return baseA.startsWith(baseB) || baseB.startsWith(baseA);
}

/**
 * Heuristic check if two regex patterns might match overlapping inputs.
 *
 * For simple alternation patterns (common for subcommand_regex like
 * "^(status|diff)$"), checks if the sets of alternatives overlap.
 * Falls back to true for complex patterns (conservative).
 */
function regexesMightOverlap(reA: string, reB: string): boolean {
  // Exact same pattern → definitely overlap
  if (reA === reB) return true;

  // Parse alternation groups: ^(a|b|c)$
  const altA = parseSimpleAlternation(reA);
  const altB = parseSimpleAlternation(reB);

  // If both are simple alternations, check for intersection
  if (altA !== null && altB !== null) {
    return altA.some(a => altB.includes(a));
  }

  // Fallback: assume overlap (conservative)
  return true;
}

/**
 * Try to parse a regex as a simple alternation like ^(a|b|c)$ or (?:a|b|c).
 * Returns the list of alternatives, or null if the pattern is more complex.
 */
function parseSimpleAlternation(pattern: string): string[] | null {
  // Strip common anchors and group wrappers
  let inner = pattern;
  inner = inner.replace(/^\^/, "");
  inner = inner.replace(/\$$/, "");
  inner = inner.replace(/^\(\?:/, "");
  inner = inner.replace(/^\(/, "");
  inner = inner.replace(/\)$/, "");

  const parts = inner.split("|");
  if (parts.length <= 1) return null; // Not a real alternation
  // Verify no nested groups or complex constructs in any alternative
  const complexRe = /[()\[\]{}.*+?^$\\]/;
  for (const p of parts) {
    if (complexRe.test(p)) return null;
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Flag presence check (works with StructuredRequest)
// ---------------------------------------------------------------------------

/**
 * Check if a flag specification is present in a structured request.
 *
 * Handles both individual and combined flag forms:
 *   - "-r" matches -r in any combined form (-rf, -ra, etc.)
 *   - "-rf" matches only if both -r and -f are present individually
 *   - "--force" matches --force exactly or in combinedFlags
 *   - "-r -f" (split) matches only if both are present
 */
export function isFlagPresent(request: StructuredRequest, flagSpec: string): boolean {
  const parts = flagSpec.split(/\s+/);
  return parts.every(part => {
    if (part.length === 2 && part.startsWith("-")) {
      // Single short flag like "-r": check individually or in combined form
      return (
        request.flags.includes(part) ||
        request.combinedFlags.some(cf => cf.includes(part[1]!))
      );
    }
    if (part.startsWith("-") && part.length > 2 && !part.startsWith("--")) {
      // Combined short flags like "-rf": check all individual chars are present
      const individualFlags = part.slice(1).split("").map(ch => `-${ch}`);
      return individualFlags.every(f =>
        request.flags.includes(f) ||
        request.combinedFlags.some(cf => cf.includes(f[1]!)),
      );
    }
    // Long flag or multi-char flag
    return request.flags.includes(part) || request.combinedFlags.includes(part);
  });
}
