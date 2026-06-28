// policy/types.ts
// ===========================================================================
// Type definitions for the policy document schema.
// These types mirror the TOML policy file structure.
//
// Optional properties use `?: T | undefined` for exactOptionalPropertyTypes
// compatibility. This allows both omission AND explicit `undefined` assignment.
// ===========================================================================

export type RuleAction = "allow" | "deny";

// ---------------------------------------------------------------------------
// Read/Write/Edit rules (path-based, with optional line ranges)
// ---------------------------------------------------------------------------

export interface ReadRule {
  action: RuleAction;
  path: string;          // glob pattern
  lines_begin?: number | undefined;  // 1-based inclusive, undefined = unbounded
  lines_end?: number | undefined;    // 1-based inclusive, undefined = unbounded
  comment?: string | undefined;
}

export interface WriteRule {
  action: RuleAction;
  path: string;          // glob pattern
  lines_begin?: number | undefined;
  lines_end?: number | undefined;
  comment?: string | undefined;
}

export interface EditRule {
  action: RuleAction;
  path: string;          // glob pattern
  lines_begin?: number | undefined;
  lines_end?: number | undefined;
  comment?: string | undefined;
}

// ---------------------------------------------------------------------------
// Bash rules (command-based, multi-condition AND matching)
// ---------------------------------------------------------------------------

export interface BashRule {
  action: RuleAction;
  /** Regex matching the base command (e.g., "^ls$", "^(cat|head)$") */
  command_regex?: string | undefined;
  /** Regex matching the subcommand for compound commands (git, npm, etc.) */
  subcommand_regex?: string | undefined;
  /** Flags that MUST all be present (AND semantics). Each entry is an exact flag string like "-r" or "-la" */
  required_flags?: string[] | undefined;
  /** Flags that must NOT be present. Each entry is an exact flag string. */
  flags_forbidden?: string[] | undefined;
  /** Regex matching a flag name whose value is subject to path_pattern check */
  flag_value_pattern?: string | undefined;
  /** Glob pattern for path-like arguments */
  path_pattern?: string | undefined;
  /** Regex against the full arguments string (fallback for complex cases) */
  args_pattern?: string | undefined;
  comment?: string | undefined;
}

// ---------------------------------------------------------------------------
// Path-tool rules (grep, find, ls — path-only checking)
// ---------------------------------------------------------------------------

export interface PathToolRule {
  action: RuleAction;
  path: string;          // glob pattern
  comment?: string | undefined;
}

// ---------------------------------------------------------------------------
// Policy document (top-level TOML structure)
// ---------------------------------------------------------------------------

export interface PolicyDocument {
  /** Default action when no rule matches (fail-closed = "deny") */
  default_action?: "allow" | "deny" | undefined;
  /** Action for unrecognized tool names (undefined = allow/passthrough) */
  unknown_tool_action?: "allow" | "deny" | undefined;
  /** Per-tool overrides for default_action */
  tool_defaults?: Record<string, "allow" | "deny"> | undefined;
  /** Read tool rules */
  read_rules?: ReadRule[] | undefined;
  /** Write tool rules */
  write_rules?: WriteRule[] | undefined;
  /** Edit tool rules */
  edit_rules?: EditRule[] | undefined;
  /** Bash tool rules */
  bash_rules?: BashRule[] | undefined;
  /** Grep tool rules */
  grep_rules?: PathToolRule[] | undefined;
  /** Find tool rules */
  find_rules?: PathToolRule[] | undefined;
  /** Ls tool rules */
  ls_rules?: PathToolRule[] | undefined;
}
