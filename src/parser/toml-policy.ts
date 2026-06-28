// parser/toml-policy.ts
// ===========================================================================
// TOML policy file loader, parser, and validator.
//
// Reads a .toml file, parses it with smol-toml, and validates the structure
// against the PolicyDocument type. Returns a fully typed PolicyDocument.
// ===========================================================================

import { readFileSync, existsSync } from "node:fs";
import * as TOML from "smol-toml";
import type {
  PolicyDocument,
  ReadRule,
  WriteRule,
  EditRule,
  BashRule,
  PathToolRule,
  RuleAction,
} from "../policy/types.ts";
import type { GenericRule } from "../core/types.ts";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class PolicyParseError extends Error {
  constructor(
    message: string,
    public readonly path?: string,
  ) {
    super(message);
    this.name = "PolicyParseError";
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load and parse a policy file from disk.
 * Returns a validated PolicyDocument.
 * Throws PolicyParseError on invalid syntax or structure.
 */
export function loadPolicyFile(filePath: string): PolicyDocument {
  if (!existsSync(filePath)) {
    throw new PolicyParseError(`Policy file not found: ${filePath}`, filePath);
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (e) {
    throw new PolicyParseError(
      `Failed to read policy file: ${filePath} — ${(e as Error).message}`,
      filePath,
    );
  }

  return loadPolicyFromString(raw, filePath);
}

/**
 * Parse a TOML string into a PolicyDocument.
 * Throws PolicyParseError on invalid syntax or structure.
 */
export function loadPolicyFromString(
  raw: string,
  sourcePath?: string,
): PolicyDocument {
  let parsed: unknown;
  try {
    parsed = TOML.parse(raw);
  } catch (e) {
    throw new PolicyParseError(
      `Invalid TOML in policy${sourcePath ? ` file: ${sourcePath}` : ""} — ${(e as Error).message}`,
      sourcePath,
    );
  }

  return validatePolicy(parsed as Record<string, unknown>, sourcePath);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validatePolicy(
  raw: Record<string, unknown>,
  sourcePath?: string,
): PolicyDocument {
  const errors: string[] = [];
  const prefix = sourcePath ? `${sourcePath}: ` : "";

  // default_action
  const default_action = validateAction(
    raw["default_action"],
    `${prefix}default_action`,
    errors,
    "deny",
  );

  // unknown_tool_action (optional — undefined means allow/passthrough)
  let unknown_tool_action: RuleAction | undefined;
  if (raw["unknown_tool_action"] !== undefined) {
    const v = raw["unknown_tool_action"];
    if (v === "allow" || v === "deny") {
      unknown_tool_action = v;
    } else {
      errors.push(
        `${prefix}unknown_tool_action: must be "allow" or "deny", got "${String(v)}"`,
      );
    }
  }

  // tool_defaults
  const tool_defaults = validateToolDefaults(
    raw["tool_defaults"] as Record<string, unknown> | undefined,
    prefix,
    errors,
  );

  // Rule arrays
  const read_rules = validateRuleArray<ReadRule>(
    raw["read_rules"],
    validateReadRule,
    `${prefix}read_rules`,
    errors,
  );

  const write_rules = validateRuleArray<WriteRule>(
    raw["write_rules"],
    validateWriteRule,
    `${prefix}write_rules`,
    errors,
  );

  const edit_rules = validateRuleArray<EditRule>(
    raw["edit_rules"],
    validateEditRule,
    `${prefix}edit_rules`,
    errors,
  );

  const bash_rules = validateRuleArray<BashRule>(
    raw["bash_rules"],
    validateBashRule,
    `${prefix}bash_rules`,
    errors,
  );

  const grep_rules = validateRuleArray<PathToolRule>(
    raw["grep_rules"],
    validatePathToolRule,
    `${prefix}grep_rules`,
    errors,
  );

  const find_rules = validateRuleArray<PathToolRule>(
    raw["find_rules"],
    validatePathToolRule,
    `${prefix}find_rules`,
    errors,
  );

  const ls_rules = validateRuleArray<PathToolRule>(
    raw["ls_rules"],
    validatePathToolRule,
    `${prefix}ls_rules`,
    errors,
  );

  // Warn about unknown top-level keys that are silently ignored
  const KNOWN_KEYS = new Set([
    "default_action", "unknown_tool_action", "tool_defaults",
    "read_rules", "write_rules", "edit_rules", "bash_rules",
    "grep_rules", "find_rules", "ls_rules",
    "tool_rules",   // reserved for future generic tool rules
    "env",           // reserved for future env variable injection
  ]);
  for (const key of Object.keys(raw)) {
    if (!KNOWN_KEYS.has(key)) {
      console.warn(
        `${prefix}WARNING: Unknown section [${key}] — this section is not recognized and will be ignored.`
      );
    }
  }

  if (errors.length > 0) {
    throw new PolicyParseError(
      `Policy validation errors:\n${errors.map(e => `  - ${e}`).join("\n")}`,
      sourcePath,
    );
  }

  return {
    default_action,
    unknown_tool_action,
    tool_defaults,
    read_rules,
    write_rules,
    edit_rules,
    bash_rules,
    grep_rules,
    find_rules,
    ls_rules,
  };
}

// ---------------------------------------------------------------------------
// Rule validators
// ---------------------------------------------------------------------------

function validateReadRule(
  raw: Record<string, unknown>,
  index: number,
  prefix: string,
  errors: string[],
): ReadRule | null {
  const action = validateAction(raw["action"], `${prefix}[${index}].action`, errors);
  if (action === undefined) return null;
  const path = validateString(raw["path"], `${prefix}[${index}].path`, errors);
  if (path === null) return null;

  return {
    action,
    path,
    lines_begin: validateOptionalPositiveInt(raw["lines_begin"]),
    lines_end: validateOptionalPositiveInt(raw["lines_end"]),
    comment: validateOptionalString(raw["comment"]),
  };
}

function validateWriteRule(
  raw: Record<string, unknown>,
  index: number,
  prefix: string,
  errors: string[],
): WriteRule | null {
  const action = validateAction(raw["action"], `${prefix}[${index}].action`, errors);
  if (action === undefined) return null;
  const path = validateString(raw["path"], `${prefix}[${index}].path`, errors);
  if (path === null) return null;

  return {
    action,
    path,
    lines_begin: validateOptionalPositiveInt(raw["lines_begin"]),
    lines_end: validateOptionalPositiveInt(raw["lines_end"]),
    comment: validateOptionalString(raw["comment"]),
  };
}

function validateEditRule(
  raw: Record<string, unknown>,
  index: number,
  prefix: string,
  errors: string[],
): EditRule | null {
  const action = validateAction(raw["action"], `${prefix}[${index}].action`, errors);
  if (action === undefined) return null;
  const path = validateString(raw["path"], `${prefix}[${index}].path`, errors);
  if (path === null) return null;

  return {
    action,
    path,
    lines_begin: validateOptionalPositiveInt(raw["lines_begin"]),
    lines_end: validateOptionalPositiveInt(raw["lines_end"]),
    comment: validateOptionalString(raw["comment"]),
  };
}

function validateBashRule(
  raw: Record<string, unknown>,
  index: number,
  prefix: string,
  errors: string[],
): BashRule | null {
  const action = validateAction(raw["action"], `${prefix}[${index}].action`, errors);
  if (action === undefined) return null;

  const rule: BashRule = { action };

  rule.command_regex = validateOptionalString(raw["command_regex"]);
  rule.subcommand_regex = validateOptionalString(raw["subcommand_regex"]);
  rule.required_flags = validateOptionalStringArray(raw["required_flags"]);
  rule.flags_forbidden = validateOptionalStringArray(raw["flags_forbidden"]);
  rule.flag_value_pattern = validateOptionalString(raw["flag_value_pattern"]);
  rule.path_pattern = validateOptionalString(raw["path_pattern"]);
  rule.args_pattern = validateOptionalString(raw["args_pattern"]);
  rule.comment = validateOptionalString(raw["comment"]);

  // At least one condition should be specified
  const hasCondition =
    rule.command_regex !== undefined ||
    rule.subcommand_regex !== undefined ||
    rule.required_flags !== undefined ||
    rule.flags_forbidden !== undefined ||
    rule.flag_value_pattern !== undefined ||
    rule.path_pattern !== undefined ||
    rule.args_pattern !== undefined;

  if (!hasCondition) {
    errors.push(`${prefix}[${index}]: bash rule must have at least one condition (command_regex, required_flags, etc.)`);
    return null;
  }

  return rule;
}

function validatePathToolRule(
  raw: Record<string, unknown>,
  index: number,
  prefix: string,
  errors: string[],
): PathToolRule | null {
  const action = validateAction(raw["action"], `${prefix}[${index}].action`, errors);
  if (action === undefined) return null;
  const path = validateString(raw["path"], `${prefix}[${index}].path`, errors);
  if (path === null) return null;

  return {
    action,
    path,
    comment: validateOptionalString(raw["comment"]),
  };
}

// ---------------------------------------------------------------------------
// Primitive validators
// ---------------------------------------------------------------------------

function validateAction(
  val: unknown,
  label: string,
  errors: string[],
  fallback?: RuleAction,
): RuleAction | undefined {
  if (val === undefined) {
    if (fallback) return fallback;
    errors.push(`${label}: is required (must be "allow" or "deny")`);
    return undefined;
  }
  if (val === "allow" || val === "deny") return val;
  errors.push(`${label}: must be "allow" or "deny", got "${String(val)}"`);
  return undefined;
}

function validateString(
  val: unknown,
  label: string,
  errors: string[],
): string | null {
  if (typeof val !== "string" || val.trim() === "") {
    errors.push(`${label}: must be a non-empty string`);
    return null;
  }
  return val;
}

function validateOptionalString(val: unknown): string | undefined {
  if (typeof val !== "string") return undefined;
  return val;
}

function validateOptionalPositiveInt(val: unknown): number | undefined {
  if (typeof val !== "number") return undefined;
  if (!Number.isInteger(val) || val < 0) return undefined;
  return val;
}

function validateOptionalStringArray(val: unknown): string[] | undefined {
  if (!Array.isArray(val)) return undefined;
  const strings = val.filter((v): v is string => typeof v === "string");
  return strings.length > 0 ? strings : undefined;
}

function validateToolDefaults(
  val: Record<string, unknown> | undefined,
  prefix: string,
  errors: string[],
): Record<string, "allow" | "deny"> | undefined {
  if (val === undefined) return undefined;
  const result: Record<string, "allow" | "deny"> = {};
  for (const [key, v] of Object.entries(val)) {
    if (v === "allow" || v === "deny") {
      result[key] = v;
    } else {
      errors.push(`${prefix}tool_defaults.${key}: must be "allow" or "deny"`);
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

// ---------------------------------------------------------------------------
// normalizeRules: convert PolicyDocument → GenericRule[]
// ---------------------------------------------------------------------------

/**
 * Normalize a PolicyDocument's per-tool rules into a flat array of GenericRule.
 *
 * Each rule type gets implicit constraints:
 *   - read/write/edit rules → tool_regex + command_regex = "^toolname$"
 *   - bash rules → tool_regex = "^bash$" (command_regex stays user-defined)
 *   - grep/find/ls rules → tool_regex + command_regex = "^toolname$"
 *
 * This ensures cross-tool rule isolation while keeping the generic checker
 * unaware of PI-specific rule types.
 */
export function normalizeRules(policy: PolicyDocument): GenericRule[] {
  const rules: GenericRule[] = [];

  // Read rules → GenericRule with command="read", path controlled
  for (const r of policy.read_rules ?? []) {
    rules.push({
      action: r.action,
      tool_regex: "^read$",
      command_regex: "^read$",
      path_pattern: r.path,
      lines_begin: r.lines_begin,
      lines_end: r.lines_end,
      comment: r.comment,
      sourceSection: "read_rules",
    });
  }

  // Write rules → GenericRule with command="write"
  for (const r of policy.write_rules ?? []) {
    rules.push({
      action: r.action,
      tool_regex: "^write$",
      command_regex: "^write$",
      path_pattern: r.path,
      lines_begin: r.lines_begin,
      lines_end: r.lines_end,
      comment: r.comment,
      sourceSection: "write_rules",
    });
  }

  // Edit rules → GenericRule with command="edit"
  for (const r of policy.edit_rules ?? []) {
    rules.push({
      action: r.action,
      tool_regex: "^edit$",
      command_regex: "^edit$",
      path_pattern: r.path,
      lines_begin: r.lines_begin,
      lines_end: r.lines_end,
      comment: r.comment,
      sourceSection: "edit_rules",
    });
  }

  // Bash rules → GenericRule, command_regex stays user-specified
  for (const r of policy.bash_rules ?? []) {
    rules.push({
      action: r.action,
      tool_regex: "^bash$",
      command_regex: r.command_regex,
      subcommand_regex: r.subcommand_regex,
      required_flags: r.required_flags,
      flags_forbidden: r.flags_forbidden,
      flag_value_pattern: r.flag_value_pattern,
      path_pattern: r.path_pattern,
      args_pattern: r.args_pattern,
      comment: r.comment,
      sourceSection: "bash_rules",
    });
  }

  // Grep rules → GenericRule with command="grep"
  for (const r of policy.grep_rules ?? []) {
    rules.push({
      action: r.action,
      tool_regex: "^grep$",
      command_regex: "^grep$",
      path_pattern: r.path,
      comment: r.comment,
      sourceSection: "grep_rules",
    });
  }

  // Find rules → GenericRule with command="find"
  for (const r of policy.find_rules ?? []) {
    rules.push({
      action: r.action,
      tool_regex: "^find$",
      command_regex: "^find$",
      path_pattern: r.path,
      comment: r.comment,
      sourceSection: "find_rules",
    });
  }

  // Ls rules → GenericRule with command="ls"
  for (const r of policy.ls_rules ?? []) {
    rules.push({
      action: r.action,
      tool_regex: "^ls$",
      command_regex: "^ls$",
      path_pattern: r.path,
      comment: r.comment,
      sourceSection: "ls_rules",
    });
  }

  return rules;
}

function validateRuleArray<T>(
  val: unknown,
  validator: (raw: Record<string, unknown>, index: number, prefix: string, errors: string[]) => T | null,
  prefix: string,
  errors: string[],
): T[] | undefined {
  if (val === undefined) return undefined;
  if (!Array.isArray(val)) {
    errors.push(`${prefix}: must be an array of tables`);
    return undefined;
  }
  const results: T[] = [];
  for (let i = 0; i < val.length; i++) {
    const item = val[i];
    if (typeof item !== "object" || item === null) {
      errors.push(`${prefix}[${i}]: must be a table`);
      continue;
    }
    const validated = validator(item as Record<string, unknown>, i, prefix, errors);
    if (validated) results.push(validated);
  }
  return results.length > 0 ? results : undefined;
}
