// engine/matcher.ts
// ===========================================================================
// Generic first-match-wins rule evaluator.
//
// Rules are evaluated in order. The first rule whose conditions all match
// determines the action (allow/deny). If no rule matches, the fallback
// action is used.
// ===========================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatchResult {
  /** Whether the action is "allow" */
  allowed: boolean;
  /** The rule action that matched, or the fallback */
  action: "allow" | "deny";
  /** Index of the matched rule (0-based), or -1 for fallback */
  ruleIndex: number;
  /** The matched rule's comment, if any */
  comment: string | undefined;
  /** Human-readable reason */
  reason: string;
  /** The section/table name (e.g., "read_rules") */
  section: string | undefined;
}

export interface RuleWithAction {
  action: "allow" | "deny";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a list of rules against a condition checker.
 *
 * @param rules - The ordered list of rules
 * @param checkFn - Function that returns true if a rule's conditions are met
 * @param fallbackAction - Action to use if no rule matches (default: "deny")
 * @param section - Optional section name for the result
 */
export function matchRules<T extends RuleWithAction>(
  rules: T[],
  checkFn: (rule: T) => boolean,
  fallbackAction: "allow" | "deny" = "deny",
  section?: string,
): MatchResult {
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!;
    if (checkFn(rule)) {
      const comment = (rule as Record<string, unknown>).comment as string | undefined;
      return {
        allowed: rule.action === "allow",
        action: rule.action,
        ruleIndex: i,
        comment,
        reason: comment ?? `Matched rule #${i + 1} (${rule.action})`,
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
    reason: `No rule matched — fallback to "${fallbackAction}"`,
    section,
  };
}
