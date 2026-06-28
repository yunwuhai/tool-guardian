// engine/bash-check.ts
// ===========================================================================
// Bash command permission checker.
//
// Matching strategy: deny-first, then allow.
//   1. If any deny rule matches → DENY (deny always wins)
//   2. If any allow rule matches → ALLOW
//   3. Otherwise → fallback action
//
// For command chains (&&, ;, ||) and pipes, each segment is checked
// independently. If any segment is denied, the entire command is denied.
// ===========================================================================

import { parseBashCommand, isFlagPresent, extractSubcommands, type ParsedCommand } from "../parser/bash-parser.ts";
import { matchesAnyGlob } from "../utils/glob.ts";
import type { BashRule, PathToolRule } from "../policy/types.ts";

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

export function checkBashCommand(
  rules: BashRule[] | undefined,
  command: string,
  fallbackAction: "allow" | "deny" = "deny",
  writeRules?: { allow: string[]; deny: string[] },
): MatchResult {
  if (!rules || rules.length === 0) {
    return {
      allowed: fallbackAction === "allow",
      action: fallbackAction,
      ruleIndex: -1,
      comment: undefined,
      reason: `No bash rules — fallback to "${fallbackAction}"`,
      section: "bash_rules",
    };
  }

  // Check for dangerous command substitution: $(...) and `...`
  const subcommands = extractSubcommands(command);
  for (const sub of subcommands) {
    const subResult = checkBashCommand(rules, sub, fallbackAction, writeRules);
    if (!subResult.allowed) {
      return {
        allowed: false,
        action: "deny",
        ruleIndex: -1,
        comment: undefined,
        reason: `Command substitution blocked: ${subResult.reason}`,
        section: "bash_rules",
      };
    }
  }

  const parsed = parseBashCommand(command);

  // Check each segment in the chain
  let hasChecked = false;
  for (const segment of parsed.segments) {
    if (!segment.command) continue;
    hasChecked = true;

    const result = matchSingleCommand(rules, segment, fallbackAction);
    if (!result.allowed) return result;

    // Check redirect target paths against write rules
    if (writeRules && segment.redirectPaths.length > 0) {
      for (const rp of segment.redirectPaths) {
        // Deny write paths take precedence
        if (matchesAnyGlob(writeRules.deny, rp)) {
          return {
            allowed: false,
            action: "deny",
            ruleIndex: -1,
            comment: undefined,
            reason: `Redirect target "${rp}" is denied for writing`,
            section: "bash_rules",
          };
        }
        // If allow list is non-empty, check it
        if (writeRules.allow.length > 0 && !matchesAnyGlob(writeRules.allow, rp)) {
          return {
            allowed: false,
            action: "deny",
            ruleIndex: -1,
            comment: undefined,
            reason: `Redirect target "${rp}" is not in write allow list`,
            section: "bash_rules",
          };
        }
      }
    }
  }

  // If all segments were empty, return fallback (don't ALLOW empty commands)
  if (!hasChecked) {
    return {
      allowed: fallbackAction === "allow",
      action: fallbackAction,
      ruleIndex: -1,
      comment: undefined,
      reason: `Empty command — fallback to "${fallbackAction}"`,
      section: "bash_rules",
    };
  }

  // All segments allowed
  return {
    allowed: true,
    action: "allow",
    ruleIndex: -1,
    comment: undefined,
    reason: "All command segments passed",
    section: "bash_rules",
  };
}

// ---------------------------------------------------------------------------
// Internal: deny-first matching
// ---------------------------------------------------------------------------

function matchSingleCommand(
  rules: BashRule[],
  cmd: ParsedCommand,
  fallbackAction: "allow" | "deny",
): MatchResult {
  // Pass 1: Check deny rules — any match → deny immediately
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!;
    if (rule.action !== "deny") continue;
    if (bashRuleMatches(rule, cmd)) {
      return {
        allowed: false,
        action: "deny",
        ruleIndex: i,
        comment: rule.comment,
        reason: rule.comment ?? `Command "${cmd.raw}" matches deny rule #${i + 1}`,
        section: "bash_rules",
      };
    }
  }

  // Pass 2: Check allow rules — first match wins
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!;
    if (rule.action !== "allow") continue;
    if (bashRuleMatches(rule, cmd)) {
      return {
        allowed: true,
        action: "allow",
        ruleIndex: i,
        comment: rule.comment,
        reason: rule.comment ?? `Command "${cmd.raw}" matches allow rule #${i + 1}`,
        section: "bash_rules",
      };
    }
  }

  // Fallback
  return {
    allowed: fallbackAction === "allow",
    action: fallbackAction,
    ruleIndex: -1,
    comment: undefined,
    reason: `No rule matched — fallback to "${fallbackAction}"`,
    section: "bash_rules",
  };
}

function bashRuleMatches(rule: BashRule, cmd: ParsedCommand): boolean {
  // All specified conditions must match (AND logic)

  // 1. Command regex
  if (rule.command_regex !== undefined) {
    try {
      const re = new RegExp(rule.command_regex);
      if (!re.test(cmd.command)) return false;
    } catch {
      return false;
    }
  }

  // 2. Subcommand regex
  if (rule.subcommand_regex !== undefined) {
    if (!cmd.subcommand) return false;
    try {
      const re = new RegExp(rule.subcommand_regex);
      if (!re.test(cmd.subcommand)) return false;
    } catch {
      return false;
    }
  }

  // 3. Required flags (AND semantics — all must be present)
  // Same for ALLOW and DENY: all specified flags must be present to match
  if (rule.required_flags !== undefined) {
    if (!rule.required_flags.every(f => isFlagPresent(cmd, f))) return false;
  }

  // 4. Flags forbidden
  // For ALLOW rules: forbidden flags prevent the match
  // For DENY rules: forbidden flags trigger the match
  if (rule.flags_forbidden !== undefined) {
    const hasForbidden = rule.flags_forbidden.some(f => isFlagPresent(cmd, f));
    if (rule.action === "deny") {
      // Deny rule: must HAVE the forbidden flags to match
      if (!hasForbidden) return false;
    } else {
      // Allow rule: must NOT have the forbidden flags to match
      if (hasForbidden) return false;
    }
  }

  // 5. Flag value pattern + path pattern
  if (rule.flag_value_pattern !== undefined) {
    let found = false;
    try {
      const flagRe = new RegExp(rule.flag_value_pattern);
      for (const [flagName, flagVal] of Object.entries(cmd.flagsArgValues)) {
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

  // 6. Path pattern (for path-like arguments, independent of flag_value_pattern)
  if (rule.path_pattern !== undefined && rule.flag_value_pattern === undefined) {
    if (cmd.paths.length === 0) return false;
    const pp = rule.path_pattern;
    if (!cmd.paths.some(p => matchesAnyGlob([pp], p))) return false;
  }

  // 7. Args pattern (regex against full argument string)
  if (rule.args_pattern !== undefined) {
    try {
      const re = new RegExp(rule.args_pattern);
      if (!re.test(cmd.rawArgs)) return false;
    } catch {
      return false;
    }
  }

  return true;
}
