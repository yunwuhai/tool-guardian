// templates/edit.ts
// ===========================================================================
// Edit tool template — converts a PI "edit" call into a StructuredRequest.
//
// The edit tool makes targeted edits to files (oldText → newText).
// Only the path parameter is controlled; line ranges can be specified
// for line-level permission checking.
//
// Edit implies: the rule normalizer gives edit rules an implicit
// tool_regex="^edit$" and command_regex="^edit$", so they only match
// edit requests.
// ===========================================================================

import type { StructuredRequest } from "../core/types.ts";

/**
 * Build a StructuredRequest from a PI edit tool call.
 *
 * @param path - The file path to edit
 * @param affectedLineRange - Optional line range affected by the edit
 * @returns A structured request suitable for checkGeneric()
 */
export function requestFromEdit(
  path: string,
  affectedLineRange?: { begin: number; end: number },
): StructuredRequest {
  return {
    tool: "edit",
    command: "edit",
    subcommand: null,
    flags: [],
    combinedFlags: [],
    flagsArgValues: {},
    paths: [path],
    positionalArgs: [],
    envVars: {},
    rawArgs: path,
    lineRange: affectedLineRange,
  };
}
