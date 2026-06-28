// pi-integration/extension.ts
// ===========================================================================
// PI extension entry point — the ONLY file that imports PI types.
//
// Registers tool_call interception, CLI flags, and runtime commands
// for policy management.
// ===========================================================================

import type { ExtensionAPI, ToolCallEvent, ToolCallEventResult } from "@earendil-works/pi-coding-agent";
import { AuditEngine } from "../audit/audit-engine.ts";
import { resolvePolicyPath } from "../parser/policy-resolver.ts";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function registerGuardianExtension(pi: ExtensionAPI): Promise<void> {
  const engine = new AuditEngine();

  // Register CLI flag for policy selection
  pi.registerFlag("guardian-policy", {
    description: "Path to permission policy file (TOML)",
    type: "string",
  });

  // Resolve and load initial policy
  const flagPolicy = pi.getFlag("guardian-policy") as string | undefined;
  const policyPath = resolvePolicyPath(flagPolicy);

  if (policyPath) {
    try {
      engine.loadPolicy(policyPath);
    } catch (e) {
      console.warn(`[tool-guardian] Could not load policy from ${policyPath}: ${(e as Error).message}`);
    }
  } else {
    // No policy found → open mode (pass through)
    console.warn("=".repeat(60));
    console.warn("[tool-guardian] ⚠️  WARNING: No policy file found");
    console.warn("[tool-guardian] Running in OPEN MODE — all tool calls pass through without restrictions");
    console.warn("[tool-guardian] Create a policy at ~/.pi/tool-guardian/policies/default.toml");
    console.warn("[tool-guardian] Or pass --guardian-policy <path> to specify one");
    console.warn("=".repeat(60));
  }

  // -----------------------------------------------------------------------
  // Tool call interception — the core guard
  // -----------------------------------------------------------------------

  pi.on("tool_call", (event: ToolCallEvent): ToolCallEventResult | void => {
    // Only intercept tools we know about
    const auditableTools = ["read", "write", "edit", "bash", "grep", "find", "ls"];
    if (!auditableTools.includes(event.toolName)) return;

    // If no policy loaded, pass through (open mode)
    if (!engine.hasPolicy()) return;

    const verdict = engine.check(
      event.toolName,
      event.input as Record<string, unknown>,
    );

    if (!verdict.allowed) {
      return {
        block: true,
        reason: verdict.reason,
      };
    }

    // Allowed — let it pass
    return;
  });

  // -----------------------------------------------------------------------
  // Runtime slash commands
  // -----------------------------------------------------------------------

  pi.registerCommand("guardian-reload", {
    description: "Reload the current permission policy file",
    handler: async () => {
      try {
        engine.reloadPolicy();
        const info = engine.getPolicyInfo();
        console.log(`[tool-guardian] Policy reloaded: ${info?.filePath}`);
      } catch (e) {
        console.error(`[tool-guardian] Reload failed: ${(e as Error).message}`);
      }
    },
  });

  pi.registerCommand("guardian-status", {
    description: "Show current permission policy status",
    handler: async () => {
      const info = engine.getPolicyInfo();
      if (!info) {
        console.log("[tool-guardian] No policy loaded — open mode");
        return;
      }
      console.log(`Policy: ${info.filePath}`);
      console.log(`Default: ${info.defaultAction}`);
      console.log(`Rules: read=${info.readRuleCount} write=${info.writeRuleCount} edit=${info.editRuleCount} bash=${info.bashRuleCount}`);
      console.log(`Audit log entries: ${engine.getAuditLog().count}`);
    },
  });

  pi.registerCommand("guardian-switch", {
    description: "Switch to a different permission policy file",
    handler: async (args: string) => {
      const path = args.trim();
      if (!path) {
        console.log("[tool-guardian] Usage: /guardian-switch <path>");
        return;
      }
      try {
        engine.switchPolicy(path);
        console.log(`[tool-guardian] Switched to: ${path}`);
      } catch (e) {
        console.error(`[tool-guardian] Switch failed: ${(e as Error).message}`);
      }
    },
  });
}
