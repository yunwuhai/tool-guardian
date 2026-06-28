// templates/bash.ts
// ===========================================================================
// Bash tool template — converts a PI "bash" call into StructuredRequests.
//
// The bash template uses the existing bash parser to decompose a raw command
// string into structured segments. For command chains (&&, ;, ||) and pipes,
// each segment becomes its own StructuredRequest so the checker can evaluate
// them independently — if any segment is denied, the entire command is denied.
//
// Bash implies: the rule normalizer gives bash rules an implicit
// tool_regex="^bash$", so they only match bash requests. However,
// the parsed `command` field (e.g., "ls", "git") is what gets matched
// against command_regex in the rules.
// ===========================================================================

import { parseBashCommand } from "../parser/bash-parser.ts";
import type { StructuredRequest } from "../core/types.ts";

/**
 * Build one or more StructuredRequests from a raw bash command string.
 *
 * For simple commands, returns a single request. For chains (&&, ||, ;)
 * and pipes, returns one request per segment.
 *
 * @param command - The raw bash command string
 * @returns Array of structured requests (one per segment)
 */
export function requestFromBash(command: string): StructuredRequest[] {
  const parsed = parseBashCommand(command);

  return parsed.segments.map(seg => ({
    tool: "bash",
    command: seg.command,
    subcommand: seg.subcommand,
    flags: seg.flags,
    combinedFlags: seg.combinedFlags,
    flagsArgValues: seg.flagsArgValues,
    paths: seg.paths,
    positionalArgs: seg.positionalArgs,
    envVars: seg.envVars,
    rawArgs: seg.rawArgs,
  }));
}
