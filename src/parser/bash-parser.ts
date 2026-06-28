// parser/bash-parser.ts
// ===========================================================================
// Bash command parser — decomposes a raw command string into structured form.
//
// Handles:
//   - Simple commands: "ls -la /tmp"
//   - Compound commands: "git push origin main"
//   - Chains: &&, ;, ||
//   - Pipes: |
//   - Quoted strings: 'single' and "double"
//   - Env var prefixes: VAR=val command
//   - Combined flags: -rf → ["-r", "-f"]
//   - --flag=value syntax
//   - Path-like argument detection
// ===========================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedCommand {
  /** Base command name (e.g., "ls", "git", "/usr/bin/node") */
  command: string;
  /** Subcommand for compound commands (e.g., "push" for "git push") */
  subcommand: string | null;
  /** All individual flags, expanded from combined forms */
  flags: string[];
  /** Combined flag strings as they appeared */
  combinedFlags: string[];
  /** Flag values: flag_name → value (e.g., "-C" → "/repo") */
  flagsArgValues: Record<string, string>;
  /** Positional arguments that are not flags or paths */
  positionalArgs: string[];
  /** Arguments detected as file paths */
  paths: string[];
  /** Redirect target paths (e.g., the /etc/passwd in "> /etc/passwd") */
  redirectPaths: string[];
  /** Environment variable assignments (VAR=val) */
  envVars: Record<string, string>;
  /** Raw argument string after the command */
  rawArgs: string;
  /** The full raw segment string */
  raw: string;
}

export interface ParsedCommandChain {
  segments: ParsedCommand[];
  /** Raw full input */
  raw: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Commands known to have subcommands.
 * If the base command is in this set, the next non-flag token is the subcommand.
 */
const COMPOUND_COMMANDS = new Set([
  "git", "npm", "npx", "yarn", "pnpm", "bun",
  "docker", "docker-compose", "cargo", "go", "make",
  "apt", "apt-get", "brew", "pip", "pip3",
  "kubectl", "helm", "terraform", "aws", "gcloud",
  "systemctl", "journalctl",
]);

/**
 * Characters that split segments in a command chain.
 */
const CHAIN_SEPARATORS = ["&&", "||", ";"] as const;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a raw bash command string into a structured chain of parsed commands.
 * Returns a chain with at least one segment, even for empty input.
 */
export function parseBashCommand(raw: string): ParsedCommandChain {
  const trimmed = raw.trim();

  if (trimmed === "") {
    return {
      segments: [emptyCommand("")],
      raw: "",
    };
  }

  const segmentRaws = splitChain(trimmed);
  const segments = segmentRaws.map(s => parseSegment(s.trim()));

  return {
    segments,
    raw: trimmed,
  };
}

// ---------------------------------------------------------------------------
// Chain splitting
// ---------------------------------------------------------------------------

function splitChain(raw: string): string[] {
  const segments: string[] = [];
  let current = "";
  let i = 0;

  while (i < raw.length) {
    // Handle quoted strings (skip through them)
    if (raw[i] === "'" || raw[i] === '"') {
      const quote = raw[i]!;
      current += quote;
      i++;
      while (i < raw.length && raw[i] !== quote) {
        if (raw[i] === "\\" && i + 1 < raw.length) {
          current += raw[i++];
        }
        current += raw[i++];
      }
      if (i < raw.length) current += raw[i++]; // closing quote
      continue;
    }

    // Check for chain separators
    let matched = false;
    for (const sep of CHAIN_SEPARATORS) {
      if (raw.startsWith(sep, i)) {
        const trimmed = current.trim();
        if (trimmed) segments.push(trimmed);
        current = "";
        i += sep.length;
        // Skip whitespace after separator
        while (i < raw.length && raw[i] === " ") i++;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Check for pipe (not ||)
    if (raw[i] === "|" && raw[i + 1] !== "|") {
      const trimmed = current.trim();
      if (trimmed) segments.push(trimmed);
      current = "";
      i++;
      while (i < raw.length && raw[i] === " ") i++;
      continue;
    }

    current += raw[i];
    i++;
  }

  const trimmed = current.trim();
  if (trimmed) segments.push(trimmed);

  return segments.length > 0 ? segments : [raw.trim()];
}

// ---------------------------------------------------------------------------
// Segment parsing
// ---------------------------------------------------------------------------

function parseSegment(raw: string): ParsedCommand {
  if (raw === "") return emptyCommand("");

  const tokens = tokenize(raw);
  if (tokens.length === 0) return emptyCommand(raw);

  let idx = 0;
  const envVars: Record<string, string> = {};

  // Extract environment variable assignments (VAR=val)
  while (idx < tokens.length) {
    const eqIdx = tokens[idx]!.indexOf("=");
    if (eqIdx > 0 && !tokens[idx]!.startsWith("-")) {
      const key = tokens[idx]!.slice(0, eqIdx);
      const val = tokens[idx]!.slice(eqIdx + 1);
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        envVars[key] = val;
        idx++;
        continue;
      }
    }
    break;
  }

  if (idx >= tokens.length) {
    return emptyCommand(raw);
  }

  // First non-env token is the command
  let command = tokens[idx]!;
  idx++;

  // Strip leading path from command (e.g., /usr/bin/git → git)
  const cmdName = command.split("/").pop() ?? command;

  // Detect subcommand for compound commands
  // Scan forward over flags (and their values) to find the subcommand
  let subcommand: string | null = null;
  let subcommandIdx = -1;
  if (COMPOUND_COMMANDS.has(cmdName)) {
    let scanIdx = idx;
    while (scanIdx < tokens.length) {
      const tok = tokens[scanIdx]!;
      // Skip --flag=value
      if (tok.startsWith("--") && tok.includes("=")) {
        scanIdx++;
        continue;
      }
      // Skip --flag (may consume next token as value)
      if (tok.startsWith("--")) {
        scanIdx++;
        // If next token is not a flag, it's the value for this flag
        if (scanIdx < tokens.length && !tokens[scanIdx]!.startsWith("-")) {
          scanIdx++;
        }
        continue;
      }
      // Skip short flag (may consume next token as value)
      if (tok.startsWith("-") && tok.length > 1 && !tok.startsWith("--")) {
        if (tok.length === 2 && scanIdx + 1 < tokens.length && !tokens[scanIdx + 1]!.startsWith("-")) {
          // Flag takes a value: skip both
          scanIdx += 2;
        } else {
          scanIdx++;
        }
        continue;
      }
      // Skip flag=value without dashes (unlikely but safe)
      if (tok.includes("=")) {
        scanIdx++;
        continue;
      }
      // Found the subcommand
      subcommand = tok;
      subcommandIdx = scanIdx;
      break;
    }
  }

  // Parse remaining tokens: flags, flag values, paths, positional args
  const flags: string[] = [];
  const combinedFlags: string[] = [];
  const flagsArgValues: Record<string, string> = {};
  const positionalArgs: string[] = [];
  const paths: string[] = [];

  while (idx < tokens.length) {
    // Skip the subcommand token if we already identified it
    if (idx === subcommandIdx) {
      idx++;
      continue;
    }

    const token = tokens[idx]!;
    const nextToken = tokens[idx + 1];

    // Long flag with = (--flag=value)
    if (token.startsWith("--") && token.includes("=")) {
      const eqIdx2 = token.indexOf("=");
      const flagName = token.slice(0, eqIdx2);
      const flagVal = token.slice(eqIdx2 + 1);
      flags.push(flagName);
      combinedFlags.push(token);
      flagsArgValues[flagName] = flagVal;
      if (isPathLike(flagVal)) paths.push(flagVal);
      idx++;
      continue;
    }

    // Long flag without value (--flag)
    if (token.startsWith("--")) {
      flags.push(token);
      combinedFlags.push(token);
      // Check if next token is a value for this flag
      if (nextToken && !nextToken.startsWith("-")) {
        flagsArgValues[token] = nextToken;
        if (isPathLike(nextToken)) paths.push(nextToken);
        idx += 2;
      } else {
        idx++;
      }
      continue;
    }

    // Short flag(s) (-rf, -la, -a, etc.)
    if (token.startsWith("-") && token.length > 1 && !token.startsWith("--")) {
      // Check if it's a flag that takes a value
      if (nextToken && !nextToken.startsWith("-") && token.length === 2) {
        // Single short flag with value: -C /repo
        flags.push(token);
        combinedFlags.push(token);
        flagsArgValues[token] = nextToken;
        if (isPathLike(nextToken)) paths.push(nextToken);
        idx += 2;
      } else {
        // Combined flags: expand -rf → -r, -f
        combinedFlags.push(token);
        for (let j = 1; j < token.length; j++) {
          flags.push(`-${token[j]}`);
        }
        idx++;
      }
      continue;
    }

    // Regular argument
    positionalArgs.push(token);
    if (isPathLike(token)) paths.push(token);
    idx++;
  }

  // Build rawArgs from tokens after command (excluding subcommand)
  const argsStart = subcommandIdx >= 0 ? subcommandIdx + 1 : 1;
  const rawArgs = tokens.slice(argsStart).join(" ");

  // Detect redirect target paths
  const redirectPaths: string[] = [];
  const redirectRe = /[12]?>{1,2}|&>/;
  for (let ti = 0; ti < tokens.length; ti++) {
    const tok = tokens[ti]!;
    if (redirectRe.test(tok)) {
      // Redirect operator found — check if next token is a path
      if (ti + 1 < tokens.length && isPathLike(tokens[ti + 1]!)) {
        redirectPaths.push(tokens[ti + 1]!);
        ti++; // skip the path token
      } else {
        // Redirect embedded in token like ">file" — extract path part
        const pathPart = tok.replace(redirectRe, "");
        if (pathPart && isPathLike(pathPart)) {
          redirectPaths.push(pathPart);
        }
      }
    }
  }

  return {
    command: cmdName,
    subcommand,
    flags,
    combinedFlags,
    flagsArgValues,
    positionalArgs,
    paths,
    redirectPaths,
    envVars,
    rawArgs,
    raw,
  };
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

function tokenize(raw: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  let current = "";

  while (i < raw.length) {
    const ch = raw[i]!;

    // Whitespace → token boundary
    if (ch === " " || ch === "\t") {
      if (current) {
        tokens.push(current);
        current = "";
      }
      i++;
      continue;
    }

    // Single-quoted string
    if (ch === "'") {
      i++; // skip opening quote
      while (i < raw.length && raw[i] !== "'") {
        current += raw[i++];
      }
      if (i < raw.length) i++; // skip closing quote
      tokens.push(current);
      current = "";
      continue;
    }

    // Double-quoted string
    if (ch === '"') {
      i++; // skip opening quote
      while (i < raw.length && raw[i] !== '"') {
        if (raw[i] === "\\" && i + 1 < raw.length) {
          i++;
          current += raw[i++];
        } else {
          current += raw[i++];
        }
      }
      if (i < raw.length) i++; // skip closing quote
      tokens.push(current);
      current = "";
      continue;
    }

    current += ch;
    i++;
  }

  if (current) tokens.push(current);

  return tokens;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyCommand(raw: string): ParsedCommand {
  return {
    command: "",
    subcommand: null,
    flags: [],
    combinedFlags: [],
    flagsArgValues: {},
    positionalArgs: [],
    paths: [],
    redirectPaths: [],
    envVars: {},
    rawArgs: "",
    raw,
  };
}

/**
 * Check if a token is likely a file path.
 */
function isPathLike(token: string): boolean {
  if (token.startsWith("/")) return true;
  if (token.startsWith("./")) return true;
  if (token.startsWith("../")) return true;
  if (token.startsWith("~/")) return true;
  if (token === "." || token === ".." || token === "~") return true;
  if (token.includes("/") && !token.startsWith("-")) return true;
  return false;
}

/**
 * Check if a flag is present in the parsed command.
 * Handles both combined and individual flag forms.
 * E.g., isFlagPresent(cmd, "-r") matches -r, -rf, -ra, etc.
 * E.g., isFlagPresent(cmd, "-rf") matches exactly -rf or both -r and -f present.
 */
export function isFlagPresent(cmd: ParsedCommand, flagSpec: string): boolean {
  // Split on whitespace: "-r -f" → check both
  const parts = flagSpec.split(/\s+/);
  return parts.every(part => {
    if (part.length === 2 && part.startsWith("-")) {
      // Single flag like "-r": check if it exists individually or in a combined SHORT form.
      // Only check short combined flags (starting with single -) — skip long flags like --recursive
      // to avoid false positives from substring matching.
      return cmd.flags.includes(part) ||
             cmd.combinedFlags.some(cf => !cf.startsWith("--") && cf.includes(part[1]!));
    }
    if (part.startsWith("-") && part.length > 2 && !part.startsWith("--")) {
      // Combined short flags like "-rf": check if ALL individual flags are present
      // Only match against short combined flags, not long flags
      const individualFlags = part.slice(1).split("").map(ch => `-${ch}`);
      return individualFlags.every(f =>
        cmd.flags.includes(f) ||
        cmd.combinedFlags.some(cf => !cf.startsWith("--") && cf.includes(f[1]!))
      );
    }
    // Multi-char flag like "--force"
    return cmd.flags.includes(part) || cmd.combinedFlags.includes(part);
  });
}

/**
 * Extract sub-commands from process substitutions and backtick command substitutions.
 * These are shell features that hide commands inside other commands.
 * Returns the inner raw command strings for independent security checking.
 *
 * Handles: $(...), `...`, and nested substitutions.
 */
export function extractSubcommands(raw: string): string[] {
  const subs: string[] = [];

  // Recursive extraction: each found subcommand's content may itself contain
  // further $(...) or `...` substitutions that need independent checking.
  // Without this, `cat $(echo $(rm -rf /tmp))` would only extract the outer
  // `echo $(rm -rf /tmp)` and miss the nested `rm -rf /tmp`.
  function extractFrom(input: string): void {
    // Extract $(...) — handles nested parentheses
    let i = 0;
    while (i < input.length) {
      if (input[i] === "$" && input[i + 1] === "(") {
        let depth = 1;
        let j = i + 2;
        while (j < input.length && depth > 0) {
          if (input[j] === "(") depth++;
          else if (input[j] === ")") depth--;
          j++;
        }
        if (depth === 0) {
          const inner = input.slice(i + 2, j - 1).trim();
          if (inner) {
            subs.push(inner);
            extractFrom(inner); // Recursively check for nested substitutions
          }
          i = j;
          continue;
        }
      }
      i++;
    }

    // Extract backtick `...` — does not handle nested backticks (bash limitation)
    const backtickRegex = /`([^`]*)`/g;
    let match;
    while ((match = backtickRegex.exec(input)) !== null) {
      const inner = match[1]!.trim();
      if (inner) {
        subs.push(inner);
        extractFrom(inner); // Recursively check for nested substitutions
      }
    }
  }

  extractFrom(raw);
  return subs;
}
