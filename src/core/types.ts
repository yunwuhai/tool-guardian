// core/types.ts
// ===========================================================================
// Core types for the generic orchestration layer.
//
// These types are the foundation of tool-guardian's architecture:
//   - StructuredRequest: A normalized request format that any agent can use
//     to describe a tool call. Modeled after the bash parser's ParsedCommand.
//   - GenericRule: A unified rule format that can express conditions for any
//     tool type. Converted from policy-specific types via normalizeRules().
//   - GenericMatchResult: The outcome of checking a request against rules.
//
// Any agent can build a StructuredRequest and pass it with GenericRules to
// the generic checker (checkGeneric). The PI extension and built-in templates
// are just convenience layers on top of this.
// ===========================================================================

/**
 * A normalized, structured tool call request.
 *
 * Modeled after the bash parser's ParsedCommand, this is the universal format
 * that the generic checker works with. Any agent can build one.
 *
 * For read/write templates, most fields are empty (match-anything) and only
 * `tool`/`command`/`paths` are filled. For bash templates, all fields are
 * populated by the bash parser.
 */
export interface StructuredRequest {
  /** The logical tool name (e.g., "read", "write", "bash") */
  tool: string;
  /** The primary command (e.g., "read", "ls", "git") */
  command: string;
  /** Subcommand for compound commands (git push → "push") */
  subcommand: string | null;
  /** All individual flags, expanded from combined forms */
  flags: string[];
  /** Combined flag strings as they originally appeared */
  combinedFlags: string[];
  /** Flag values: flag_name → value (e.g., "-C" → "/repo") */
  flagsArgValues: Record<string, string>;
  /** Arguments detected as file paths */
  paths: string[];
  /** Positional arguments that are not flags or paths */
  positionalArgs: string[];
  /** Environment variable assignments (VAR=val) */
  envVars: Record<string, string>;
  /** Raw argument string after the command */
  rawArgs: string;
  /** Optional line range (for read/write/edit with offset/limit) */
  lineRange?: { begin: number; end: number } | undefined;
}

/**
 * A unified rule that the generic checker understands.
 *
 * Normalized from tool-specific policy types (ReadRule, BashRule, etc.)
 * by normalizeRules(). Each rule carries its source TOML section so the
 * verdict can reference where the matched rule came from.
 *
 * All conditions are AND-ed within a rule.
 */
export interface GenericRule {
  action: "allow" | "deny";
  /** Regex matching the request.tool field — set implicitly from TOML section */
  tool_regex?: string | undefined;
  /** Regex matching the request.command field */
  command_regex?: string | undefined;
  /** Regex matching the request.subcommand field */
  subcommand_regex?: string | undefined;
  /** Flags that MUST all be present for the rule to match (AND semantics) */
  required_flags?: string[] | undefined;
  /** For allow: prevents match. For deny: triggers match. */
  flags_forbidden?: string[] | undefined;
  /** Regex matching a flag name whose value is checked against path_pattern */
  flag_value_pattern?: string | undefined;
  /** Glob pattern for path-like arguments (request.paths) */
  path_pattern?: string | undefined;
  /** Regex against the full rawArgs string */
  args_pattern?: string | undefined;
  /** Line range start (1-based inclusive) — for read/write/edit */
  lines_begin?: number | undefined;
  /** Line range end (1-based inclusive) — for read/write/edit */
  lines_end?: number | undefined;
  /** Human-readable comment about the rule's intent */
  comment?: string | undefined;
  /** Source TOML section name (e.g., "read_rules", "bash_rules") */
  sourceSection: string;
}

/**
 * The result of checking a StructuredRequest against a list of GenericRules.
 */
export interface GenericMatchResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** The action that was taken */
  action: "allow" | "deny";
  /** Index of the matched rule, or -1 for fallback */
  ruleIndex: number;
  /** The matched rule's comment, or undefined */
  comment: string | undefined;
  /** Human-readable reason for the decision */
  reason: string;
  /** The source section of the matched rule, or undefined */
  section: string | undefined;
}

/**
 * Describes a conflict detected between two rules during validation.
 */
export interface RuleConflict {
  type: "deny_overrides_allow" | "same_action_shadow";
  ruleA: { index: number; section: string; action: "allow" | "deny" };
  ruleB: { index: number; section: string; action: "allow" | "deny" };
  description: string;
  recommendation?: string | undefined;
}
