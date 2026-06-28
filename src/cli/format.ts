// cli/format.ts
// ===========================================================================
// Output formatters for the CLI — human-readable and JSON.
// ===========================================================================

import type { AppVerdict, PolicyInfo } from "../audit/types.ts";

/**
 * Format a verdict for human-readable display.
 */
export function formatVerdict(verdict: AppVerdict, verbose: boolean): string {
  const status = verdict.allowed ? "ALLOWED" : "BLOCKED";
  const lines: string[] = [`${status}: ${verdict.reason}`];

  if (verbose && verdict.matchedRule) {
    const r = verdict.matchedRule;
    lines.push(
      `  Rule #${r.index + 1}: ${r.action} in [${r.section}]${r.comment ? ` — ${r.comment}` : ""}`,
    );
  }

  return lines.join("\n");
}

/**
 * Format a verdict as JSON.
 */
export function formatVerdictJson(
  tool: string,
  input: Record<string, unknown>,
  verdict: AppVerdict,
): string {
  return JSON.stringify(
    {
      allowed: verdict.allowed,
      tool,
      input,
      matchedRule: verdict.matchedRule ? {
        section: verdict.matchedRule.section,
        index: verdict.matchedRule.index,
        ruleNumber: verdict.matchedRule.index + 1,
        action: verdict.matchedRule.action,
        comment: verdict.matchedRule.comment,
      } : null,
      reason: verdict.reason,
    },
    null,
    2,
  );
}

/**
 * Format policy info for display.
 */
export function formatPolicyInfo(info: PolicyInfo): string {
  return [
    `Policy: ${info.filePath}`,
    `Default action: ${info.defaultAction}`,
    `Unknown tool action: ${info.unknownToolAction ?? "allow (passthrough)"}`,
    `Loaded at: ${info.loadedAt}`,
    ``,
    `Rules:`,
    `  read: ${info.readRuleCount}`,
    `  write: ${info.writeRuleCount}`,
    `  edit: ${info.editRuleCount}`,
    `  bash: ${info.bashRuleCount}`,
    `  grep: ${info.grepRuleCount}`,
    `  find: ${info.findRuleCount}`,
    `  ls: ${info.lsRuleCount}`,
  ].join("\n");
}
