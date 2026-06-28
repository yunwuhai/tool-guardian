// parser/policy-resolver.ts
// ===========================================================================
// Policy file path resolution.
//
// Searches for policy files in a priority order:
//   1. Explicit path (from CLI flag or env var)
//   2. User global policy: ~/.pi/tool-guardian/policies/default.toml
//   3. Project-local policy: .pi/tool-guardian.toml
//
// Returns the first existing file path, or null if none found.
// ===========================================================================

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Resolve the policy file path to use.
 *
 * @param explicitPath - Path from --guardian-policy flag or PI_GUARDIAN_POLICY env var
 * @param cwd - Current working directory (for project-local search)
 * @returns The resolved policy file path, or null if no policy file exists
 */
export function resolvePolicyPath(
  explicitPath?: string,
  cwd?: string,
): string | null {
  // 1. Explicit path takes priority
  if (explicitPath) {
    if (existsSync(explicitPath)) return explicitPath;
    // Explicit path specified but doesn't exist — return it anyway
    // (the caller will get a load error with a clear message)
    return explicitPath;
  }

  // 2. User global policy
  const globalPath = join(
    homedir(),
    ".pi",
    "tool-guardian",
    "policies",
    "default.toml",
  );
  if (existsSync(globalPath)) return globalPath;

  // 3. Project-local policy
  if (cwd) {
    const projectPath = join(cwd, ".pi", "tool-guardian.toml");
    if (existsSync(projectPath)) return projectPath;
  }

  // No policy found
  return null;
}
