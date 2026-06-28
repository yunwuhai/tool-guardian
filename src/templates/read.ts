// templates/read.ts
// ===========================================================================
// Read tool template — converts a PI "read" call into a StructuredRequest.
//
// The read tool reads file content with optional offset/limit.
// Only the path parameter is controlled; other parameters default to
// match-anything (empty fields in the structured request).
//
// Read implies: the rule normalizer gives read rules an implicit
// tool_regex="^read$" and command_regex="^read$", so they only match
// read requests. No other tool type can match these rules.
// ===========================================================================

import type { StructuredRequest } from "../core/types.ts";

/**
 * Build a StructuredRequest from a PI read tool call.
 *
 * @param path - The file path to read
 * @param offset - Optional byte/line offset (0-based)
 * @param limit - Optional byte/line count limit
 * @returns A structured request suitable for checkGeneric()
 */
export function requestFromRead(
  path: string,
  offset?: number,
  limit?: number,
): StructuredRequest {
  let lineRange: { begin: number; end: number } | undefined;

  if (offset !== undefined && offset > 0) {
    const start = offset;
    if (limit !== undefined && limit > 0) {
      lineRange = { begin: start, end: start + limit - 1 };
    } else {
      lineRange = { begin: start, end: 0 }; // unbounded upper
    }
  }

  return {
    tool: "read",
    command: "read",
    subcommand: null,
    flags: [],
    combinedFlags: [],
    flagsArgValues: {},
    paths: [path],
    positionalArgs: [],
    envVars: {},
    rawArgs: path,
    lineRange,
  };
}
