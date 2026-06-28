// templates/path-tool.ts
// ===========================================================================
// Generic path-tool template — converts grep/find/ls calls into
// StructuredRequests.
//
// These tools simply take a path and operate on it. Only the path parameter
// is controlled; other parameters are match-anything.
//
// The rule normalizer gives grep/find/ls rules an implicit
// tool_regex="^toolname$" and command_regex="^toolname$", so they only
// match the corresponding tool requests.
// ===========================================================================

import type { StructuredRequest } from "../core/types.ts";

/**
 * Build a StructuredRequest from a path-based tool call (grep, find, ls).
 *
 * @param tool - The tool name ("grep", "find", or "ls")
 * @param path - The file/directory path
 * @returns A structured request suitable for checkGeneric()
 */
export function requestFromPathTool(
  tool: string,
  path: string,
): StructuredRequest {
  return {
    tool,
    command: tool,
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
