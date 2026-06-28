// policy/defaults.ts
// ===========================================================================
// Built-in default policy — used as a fallback when no policy file is loaded.
// This is fail-closed: deny everything by default.
// ===========================================================================

import type { PolicyDocument } from "./types.ts";

/**
 * Default deny-everything policy.
 * No rules = no matches = fallback to default_action "deny".
 */
export const DEFAULT_DENY_POLICY: PolicyDocument = {
  default_action: "deny",
};

/**
 * Permissive-but-safe default: allow reads anywhere, deny writes and bash.
 */
export const DEFAULT_SAFE_POLICY: PolicyDocument = {
  default_action: "deny",
  tool_defaults: {
    read: "allow",
    grep: "allow",
    find: "allow",
    ls: "allow",
    write: "deny",
    edit: "deny",
    bash: "deny",
  },
};
