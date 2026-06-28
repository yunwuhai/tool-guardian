#!/usr/bin/env bun
// cli/cli.ts
// ===========================================================================
// tool-guardian CLI — standalone permission checking without a runtime agent.
//
// Usage:
//   bun run src/cli/cli.ts check --policy <path> -t <tool> -i '<json>'
//   bun run src/cli/cli.ts validate --policy <path>
//   bun run src/cli/cli.ts show --policy <path>
// ===========================================================================

import { AuditEngine } from "../audit/audit-engine.ts";
import { loadPolicyFile, normalizeRules } from "../parser/toml-policy.ts";
import { checkGeneric, validateRules } from "../core/generic-checker.ts";
import { formatVerdict, formatVerdictJson, formatPolicyInfo } from "./format.ts";

// ---------------------------------------------------------------------------
// Argument parsing (Bun.argv, no dependencies)
// ---------------------------------------------------------------------------

interface ParsedArgs {
  command: string;
  policy: string | undefined;
  tool: string | undefined;
  input: Record<string, unknown> | undefined;
  json: boolean;
  verbose: boolean;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: "",
    policy: undefined,
    tool: undefined,
    input: undefined,
    json: false,
    verbose: false,
    help: false,
    version: false,
  };

  let i = 2; // skip "bun" and script path

  if (i < argv.length && !argv[i]!.startsWith("-")) {
    result.command = argv[i]!;
    i++;
  }

  while (i < argv.length) {
    const arg = argv[i]!;
    switch (arg) {
      case "--policy":
      case "-p":
        result.policy = argv[++i];
        break;
      case "--tool":
      case "-t":
        result.tool = argv[++i];
        break;
      case "--input":
      case "-i":
        try {
          result.input = JSON.parse(argv[++i] ?? "{}");
        } catch {
          console.error("Error: invalid JSON for --input");
          process.exit(1);
        }
        break;
      case "--json":
        result.json = true;
        break;
      case "--verbose":
      case "-v":
        result.verbose = true;
        break;
      case "--help":
      case "-h":
        result.help = true;
        break;
      case "--version":
      case "-V":
        result.version = true;
        break;
      default:
        // positional: treat as command if not set
        if (!result.command && !arg.startsWith("-")) {
          result.command = arg;
        }
        break;
    }
    i++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdCheck(args: ParsedArgs): void {
  if (!args.policy) {
    console.error("Error: --policy <path> is required");
    process.exit(1);
  }
  if (!args.tool) {
    console.error("Error: --tool <name> is required");
    process.exit(1);
  }

  const engine = new AuditEngine();
  try {
    engine.loadPolicy(args.policy);
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  }

  const verdict = engine.check(args.tool, args.input ?? {});

  if (args.json) {
    console.log(formatVerdictJson(args.tool, args.input ?? {}, verdict));
  } else {
    console.log(formatVerdict(verdict, args.verbose));
  }

  if (!verdict.allowed) process.exit(1);
}

function cmdValidate(args: ParsedArgs): void {
  if (!args.policy) {
    console.error("Error: --policy <path> is required");
    process.exit(1);
  }

  try {
    const policy = loadPolicyFile(args.policy);

    // Also check for rule conflicts
    const genericRules = normalizeRules(policy);
    const conflicts = validateRules(genericRules);

    if (conflicts.length === 0) {
      console.log(`VALID: ${args.policy}`);
      console.log("  No rule conflicts detected.");
    } else {
      console.log(`VALID (with ${conflicts.length} conflict${conflicts.length > 1 ? "s" : ""}): ${args.policy}`);
      for (const c of conflicts) {
        const level = c.type === "deny_overrides_allow" ? "WARNING" : "INFO";
        console.log(`  ${level}: ${c.description}`);
        if (c.recommendation) {
          console.log(`         ${c.recommendation}`);
        }
      }
    }
  } catch (e) {
    console.error(`INVALID: ${(e as Error).message}`);
    process.exit(1);
  }
}

function cmdShow(args: ParsedArgs): void {
  if (!args.policy) {
    console.error("Error: --policy <path> is required");
    process.exit(1);
  }

  const engine = new AuditEngine();
  try {
    engine.loadPolicy(args.policy);
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  }

  const info = engine.getPolicyInfo();
  if (!info) {
    console.error("Error: no policy loaded");
    process.exit(1);
  }

  if (args.json) {
    console.log(JSON.stringify(info, null, 2));
  } else {
    console.log(formatPolicyInfo(info));
  }
}

function printHelp(): void {
  console.log(`tool-guardian — Tool permission manager for AI agents

Usage:
  tool-guardian <command> [options]

Commands:
  check       Check a tool invocation against a policy
  validate    Validate a policy file
  show        Display the resolved policy

Options:
  --policy, -p <path>    Path to TOML policy file
  --tool, -t <name>      Tool name (read|write|edit|bash|grep|find|ls)
  --input, -i <json>     Tool input as JSON string
  --json                 JSON output
  --verbose, -v          Verbose output with matched rule details
  --help, -h             Show this help

Examples:
  tool-guardian check -p policy.toml -t read -i '{"path":"/tmp/file.txt"}'
  tool-guardian check -p policy.toml -t bash -i '{"command":"rm -rf /"}'
  tool-guardian validate -p policy.toml
  tool-guardian show -p policy.toml --json
`);
}

function printCheckHelp(): void {
  console.log(`tool-guardian check — Check a tool invocation against a policy

Usage:
  tool-guardian check --policy <path> --tool <name> --input '<json>' [options]

Required:
  --policy, -p <path>    Path to TOML policy file
  --tool, -t <name>      Tool name (read|write|edit|bash|grep|find|ls)
  --input, -i <json>     Tool input as JSON string

Options:
  --json                 JSON output
  --verbose, -v          Verbose output with matched rule details
  --help, -h             Show this help

Examples:
  tool-guardian check -p policy.toml -t read -i '{"path":"/tmp/file.txt"}'
  tool-guardian check -p policy.toml -t bash -i '{"command":"rm -rf /"}'
  tool-guardian check -p policy.toml -t bash -i '{"command":"cat /etc/passwd"}' --verbose
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// Only run when invoked directly (not imported)
const isMain = process.argv[1]?.includes("cli.ts") || process.argv[1]?.includes("cli.js");
if (isMain) {
  const args = parseArgs(process.argv);

  // --version: print version and exit (before help/command dispatch)
  if (args.version) {
    const { readFileSync } = await import("node:fs");
    const pkgPath = new URL("../../package.json", import.meta.url);
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      console.log(`tool-guardian v${pkg.version}`);
    } catch {
      console.log("tool-guardian (unknown version)");
    }
    process.exit(0);
  }

  // No command → show generic help
  if (!args.command) {
    printHelp();
    process.exit(0);
  }

  // --help with a subcommand → show subcommand-specific help
  if (args.help) {
    switch (args.command) {
      case "check":
        printCheckHelp();
        break;
      default:
        printHelp();
        break;
    }
    process.exit(0);
  }

  switch (args.command) {
    case "check":
      cmdCheck(args);
      break;
    case "validate":
      cmdValidate(args);
      break;
    case "show":
      cmdShow(args);
      break;
    default:
      console.error(`Unknown command: ${args.command}`);
      console.error("Use --help for usage");
      process.exit(1);
  }
}
