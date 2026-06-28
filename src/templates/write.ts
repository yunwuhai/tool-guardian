// templates/write.ts
// ===========================================================================
// Write tool template — converts a PI "write" call into a StructuredRequest.
//
// The write tool writes file content. Full files only (no line-level control
// for write — use edit for targeted changes). Only the path parameter is
// controlled; other parameters are match-anything.
//
// Write implies: the rule normalizer gives write rules an implicit
// tool_regex="^write$" and command_regex="^write$", so they only match
// write requests.
// ===========================================================================

import type { StructuredRequest } from "../core/types.ts";

/**
 * Build a StructuredRequest from a PI write tool call.
 *
 * @param path - The file path to write
 * @returns A structured request suitable for checkGeneric()
 */
export function requestFromWrite(path: string): StructuredRequest {
  return {
    tool: "write",
    command: "write",
    subcommand: null,
    flags: [],
    combinedFlags: [],
    flagsArgValues: {},
    paths: [path],
    positionalArgs: [],
    envVars: {},
    rawArgs: path,
  };
}
