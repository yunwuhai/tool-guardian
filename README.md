# tool-guardian

Fine-grained tool permission manager for AI agents.

tool-guardian acts as an audit middleware that intercepts all agent tool calls and enforces permissions via human-readable TOML policy files. It works both as a **PI extension** (automatic interception) and a **standalone CLI** (manual checking).

## Features

- **File-level & line-level permissions** for read, write, and edit tools
- **Structured bash command matching** — control commands, subcommands, flags (individual and combined), and path arguments
- **Deny-over-allow semantics** — deny rules always take precedence
- **TOML policy format** — human-readable with comments
- **Runtime policy switching** — hot-reload policies without restarting PI
- **Audit logging** — every decision is recorded
- **Zero PI dependency in core** — standalone CLI works without PI

## Quick Start

### As a PI Extension

```bash
# Symlink as a PI extension
ln -s $(pwd) ~/.pi/agent/extensions/tool-guardian

# Create a policy
mkdir -p ~/.pi/tool-guardian/policies
cp examples/strict-policy.toml ~/.pi/tool-guardian/policies/default.toml

# Edit the policy for your project
# Then run PI — the extension auto-loads
pi
```

Use slash commands to manage policies at runtime:
- `/guardian-status` — show current policy
- `/guardian-reload` — reload policy from disk
- `/guardian-switch <path>` — switch to a different policy

### As a Standalone CLI

```bash
# Check if a read operation is allowed
tool-guardian check --policy examples/strict-policy.toml -t read \
  -i '{"path":"/home/user/project/src/main.ts"}'

# Check a bash command
tool-guardian check --policy examples/strict-policy.toml -t bash \
  -i '{"command":"rm -rf /tmp"}'

# Validate a policy file
tool-guardian validate --policy examples/strict-policy.toml

# Show policy summary
tool-guardian show --policy examples/strict-policy.toml

# JSON output
tool-guardian check --policy examples/strict-policy.toml -t bash \
  -i '{"command":"ls -la"}' --json
```

## Policy File Format

Policy files are written in TOML. Rules are organized by tool type.

### Read/Write/Edit Rules

```toml
[[read_rules]]
action = "allow"
path = "/home/project/**"           # glob pattern
# lines_begin = 1                   # optional: 1-based inclusive line range
# lines_end = 100
comment = "Allow reading project files"

[[read_rules]]
action = "deny"
path = "/home/project/secrets/**"   # deny takes precedence over allows
```

### Bash Rules

```toml
# Allow safe commands
[[bash_rules]]
action = "allow"
command_regex = "^(cat|head|tail|echo)$"

# Allow ls within project (all flag combinations allowed in project dir)
[[bash_rules]]
action = "allow"
command_regex = "^ls$"
path_pattern = "/home/project/**"

# Deny rm with recursive force
[[bash_rules]]
action = "deny"
command_regex = "^rm$"
flags_forbidden = ["-rf"]           # triggers deny when -rf is present

# Allow safe git subcommands
[[bash_rules]]
action = "allow"
command_regex = "^git$"
subcommand_regex = "^(status|diff|log|add|commit)$"

# Deny privilege escalation
[[bash_rules]]
action = "deny"
command_regex = "^(sudo|chmod|chown)$"
```

**Bash rule conditions (all specified conditions are AND-ed):**

| Condition | Description |
|-----------|-------------|
| `command_regex` | Regex on the base command name |
| `subcommand_regex` | Regex on the subcommand (for git, npm, docker, etc.) |
| `required_flags` | Flags that must all be present (AND semantics) for the rule to match. Useful for tools like `git` where specific flag combinations are required, but avoid for tools with independently-used flags like `ls`. |
| `flags_forbidden` | For allow rules: prevents match. For deny rules: triggers match |
| `flag_value_pattern` | Flag name regex whose value is checked against `path_pattern` |
| `path_pattern` | Glob pattern for path-like arguments |
| `args_pattern` | Regex against the full arguments string |

### Tool Defaults

```toml
default_action = "deny"

[tool_defaults]
read = "allow"
grep = "allow"
find = "allow"
ls = "allow"
write = "deny"
edit = "deny"
bash = "deny"
```

## Understanding Deny-First Evaluation

tool-guardian uses a **deny-over-allow** strategy for evaluating rules:

1. **Pass 1 (deny check):** All deny rules are evaluated. If ANY deny rule matches, the request is BLOCKED immediately — regardless of any allow rules that might also match.
2. **Pass 2 (allow check):** If no deny rule matched, allow rules are evaluated. The first matching allow rule grants permission.
3. **Fallback:** If no rule (deny or allow) matches, the `default_action` is used.

This means:
- **Deny always wins.** A deny rule can block a request even if an allow rule matches the same conditions. This is intentional: it ensures security overrides access.
- **"Not denied" ≠ "allowed".** If no deny rule matches but also no allow rule matches, the request falls back to `default_action` (typically `"deny"` in a fail-closed policy).
- **The pattern "deny all + allow specific exceptions" does NOT work** for the same command. For example:
  ```toml
  [[bash_rules]]
  action = "deny"
  command_regex = "^git$"

  [[bash_rules]]
  action = "allow"
  command_regex = "^git$"
  subcommand_regex = "^status$"
  ```
  The deny rule matches all git commands in Pass 1, so the allow rule for `git status` is never reached.
- **Correct pattern:** Don't write a broad deny rule. Let `default_action = "deny"` serve as your default, and write precise allow rules for permitted operations:
  ```toml
  [[bash_rules]]
  action = "allow"
  command_regex = "^git$"
  subcommand_regex = "^(status|diff|log|add|commit)$"
  ```

For rule authors: use the `validate` CLI command to detect potential rule conflicts.

## API Usage

```typescript
import { AuditEngine, loadPolicyFile, checkBashCommand } from "tool-guardian";

// Full audit engine
const engine = new AuditEngine();
engine.loadPolicy("policy.toml");
const verdict = engine.check("bash", { command: "ls -la" });

// Direct checkers (no policy file needed)
const result = checkBashCommand(
  [{ action: "deny", command_regex: "^rm$", flags_forbidden: ["-rf"] }],
  "rm -rf /tmp"
);
```

## Project Structure

```
src/
├── index.ts              # Dual export: PI extension + core API
├── policy/types.ts       # Type definitions
├── parser/
│   ├── toml-policy.ts    # TOML policy loader
│   ├── bash-parser.ts    # Bash command parser
│   └── policy-resolver.ts # Policy file resolution
├── engine/
│   ├── matcher.ts        # Rule evaluator
│   ├── path-check.ts     # Read/write/edit checker
│   ├── bash-check.ts     # Bash command checker
│   ├── generic-check.ts  # Grep/find/ls checker
│   └── line-range.ts     # Line range utilities
├── audit/
│   ├── audit-engine.ts   # Central orchestrator
│   ├── audit-log.ts      # Audit trail
│   └── types.ts          # Verdict types
├── cli/                   # Standalone CLI
└── pi-integration/        # PI extension bridge
```

## Development

```bash
bun install
bun test          # Run all tests
npx tsc --noEmit  # Type check
```
