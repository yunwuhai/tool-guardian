// src/index.ts
// ===========================================================================
// tool-guardian — Tool permission manager for AI agents
//
// Dual export:
//   - Default export: PI extension factory (lazily imports PI modules)
//   - Named exports: Core API (zero PI dependency)
//
// The core API is organized in layers:
//   1. Generic orchestration layer (core/*) — any agent can use this
//   2. Templates (templates/*) — convert tool-specific inputs to StructuredRequest
//   3. Policy loading (parser/*) — TOML parsing and rule normalization
//   4. Audit engine (audit/*) — convenience orchestrator on top of the above
//   5. Legacy checkers (engine/*) — backward-compatible direct checkers
// ===========================================================================

// ===========================================================================
// Default export: PI extension factory
// ===========================================================================

export default async function (
  pi: import("@earendil-works/pi-coding-agent").ExtensionAPI,
): Promise<void> {
  const { registerGuardianExtension } = await import(
    "./pi-integration/extension.ts"
  );
  await registerGuardianExtension(pi);
}

// ===========================================================================
// Core generic orchestration layer — zero PI dependency
// ===========================================================================

export { checkGeneric, isFlagPresent, validateRules } from "./core/generic-checker.ts";
export type { GenericRule, GenericMatchResult, StructuredRequest, RuleConflict } from "./core/types.ts";

// ===========================================================================
// Templates — convert tool-specific inputs to StructuredRequest
// ===========================================================================

export { requestFromRead } from "./templates/read.ts";
export { requestFromWrite } from "./templates/write.ts";
export { requestFromEdit } from "./templates/edit.ts";
export { requestFromBash } from "./templates/bash.ts";
export { requestFromPathTool } from "./templates/path-tool.ts";

// ===========================================================================
// Policy loading & normalization
// ===========================================================================

export { loadPolicyFile, loadPolicyFromString, normalizeRules, PolicyParseError } from "./parser/toml-policy.ts";
export { resolvePolicyPath } from "./parser/policy-resolver.ts";

// ===========================================================================
// Bash parser
// ===========================================================================

export { parseBashCommand } from "./parser/bash-parser.ts";

// ===========================================================================
// Audit engine & log
// ===========================================================================

export { AuditEngine } from "./audit/audit-engine.ts";
export { AuditLog } from "./audit/audit-log.ts";
export type { AppVerdict, PolicyInfo, AuditLogEntry } from "./audit/types.ts";

// ===========================================================================
// Legacy backward-compatible checkers
// ===========================================================================

export { checkReadPath, checkWritePath, checkEditPath } from "./engine/path-check.ts";
export { checkBashCommand } from "./engine/bash-check.ts";
export { checkPathTool } from "./engine/generic-check.ts";
export { matchRules } from "./engine/matcher.ts";

// ===========================================================================
// Utilities
// ===========================================================================

export { rangesOverlap, parseLineRange, buildLineRange } from "./engine/line-range.ts";
export { matchGlob, matchesAnyGlob } from "./utils/glob.ts";
export { normalizePath, isPathLike } from "./utils/path-utils.ts";

// ===========================================================================
// Policy types (for TOML parsing)
// ===========================================================================

export type * from "./policy/types.ts";
