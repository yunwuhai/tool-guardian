// audit/types.ts
// ===========================================================================
// Types for the audit engine — verdicts and policy metadata.
// ===========================================================================

/**
 * The result of auditing a tool call.
 */
export interface AppVerdict {
  /** Whether the tool call is allowed */
  allowed: boolean;
  /** Human-readable reason for the decision */
  reason: string;
  /** The matched rule's section and index, if any */
  matchedRule?: {
    section: string;
    index: number;
    action: "allow" | "deny";
    comment: string | undefined;
  } | undefined;
}

/**
 * Summary information about the currently loaded policy.
 */
export interface PolicyInfo {
  /** Path to the policy file on disk */
  filePath: string;
  /** Action for unrecognized tool names (undefined = allow) */
  unknownToolAction?: "allow" | "deny" | undefined;
  /** Number of read rules */
  readRuleCount: number;
  /** Number of write rules */
  writeRuleCount: number;
  /** Number of edit rules */
  editRuleCount: number;
  /** Number of bash rules */
  bashRuleCount: number;
  /** Number of grep rules */
  grepRuleCount: number;
  /** Number of find rules */
  findRuleCount: number;
  /** Number of ls rules */
  lsRuleCount: number;
  /** Default action */
  defaultAction: "allow" | "deny";
  /** When the policy was loaded (ISO string) */
  loadedAt: string;
}

/**
 * A single audit log entry.
 */
export interface AuditLogEntry {
  /** ISO timestamp */
  timestamp: string;
  /** Tool name (read, write, edit, bash, grep, find, ls) */
  tool: string;
  /** Tool input parameters */
  input: Record<string, unknown>;
  /** The verdict */
  verdict: AppVerdict;
}
