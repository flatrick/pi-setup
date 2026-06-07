# Design: MCP Policy Engine

## Architecture Overview

The Policy Engine intercepts every tool call between the `MCPManager` and the transport layer. It applies a sequential evaluation chain; the first "Deny" verdict short-circuits the chain and blocks the call immediately.

```
┌────────────────────────────┐
│        MCPManager           │
│   (issues tool call)        │
└─────────────┬──────────────┘
              │ tool call request
              ▼
┌────────────────────────────┐
│       PolicyEngine          │  <-- Pre-flight gate
│  ┌──────────────────────┐  │
│  │ 1. AllowDenyCheck    │  │  Explicit allow/deny list
│  └────────┬─────────────┘  │
│           │ Pass            │
│  ┌────────▼─────────────┐  │
│  │ 2. RegexCheck        │  │  Argument pattern matching
│  └────────┬─────────────┘  │
│           │ Pass            │
│  ┌────────▼─────────────┐  │
│  │ 3. ScriptRunner      │  │  Global then tool-specific scripts
│  │   a. GlobalValidator │  │
│  │   b. ToolValidator   │  │
│  └────────┬─────────────┘  │
└─────────────┬──────────────┘
              │ PolicyVerdict
              ▼
    Allow → ServerClient / Transport
    Deny  → ctx.ui.notify, call aborted
```

## Components

### 1. PolicyEngine
- **Responsibilities**:
    - Loads the `policy` block from the server's `.mcp.json` entry.
    - Orchestrates the sequential evaluation chain.
    - Returns a `PolicyVerdict { allowed: boolean; reason: string }`.
    - Short-circuits on the first deny verdict without running subsequent evaluators.
- **Maps to**: Requirement: Multi-Layered Evaluation.

### 2. AllowDenyCheck
- **Responsibilities**:
    - If `allow_list` is defined, denies any tool not present in it.
    - Denies any tool whose name matches an entry in `deny_patterns` (glob or exact match).
- **Maps to**: Requirement: Multi-Layered Evaluation (step 1).

### 3. RegexCheck
- **Responsibilities**:
    - Serializes tool arguments to a JSON string.
    - Tests the string against each forbidden regex pattern in the policy.
    - Returns deny on the first match.
- **Maps to**: Requirement: Multi-Layered Evaluation (step 2).

### 4. ScriptRunner
- **Responsibilities**:
    - Spawns the configured validator script as a child process.
    - Sends `{ "tool": string, "arguments": object }` via `stdin`.
    - Reads `stdout` and parses the `{ "allowed": boolean, "reason": string }` response.
    - Enforces a hard 3-second timeout; kills the process and returns a fail-safe deny on expiry or crash.
    - Runs `global_validator` first (if configured), then `tool_validators[toolName]` (if configured).
- **Maps to**: Requirement: Multi-Layered Evaluation (step 3); Requirement: Validator Script Specification.

## Evaluation Chain Rules

| Condition | Outcome |
|-----------|---------|
| Tool not in `allow_list` (when list is defined) | Deny immediately |
| Tool matched by `deny_patterns` | Deny immediately |
| Argument matches a forbidden regex | Deny immediately |
| `global_validator` returns `allowed: false` | Deny immediately |
| `tool_validator` returns `allowed: false` | Deny immediately |
| Script crashes or times out (> 3s) | Deny immediately (fail-safe) |
| All checks pass | Allow |

## Behavioral Descriptions

### "Explicitly denied tool is blocked"
*Corresponds to Success Criteria scenario 1 in proposal.md.*
- `AllowDenyCheck` MUST return deny for any tool matched by `deny_patterns` before `RegexCheck` or `ScriptRunner` is invoked.

### "Forbidden argument regex blocks a call"
*Corresponds to Success Criteria scenario 2 in proposal.md.*
- `RegexCheck` MUST serialize all arguments and test them as a single string against each pattern.
- A match on any pattern MUST return deny without invoking `ScriptRunner`.

### "Global validator approval allows the call"
*Corresponds to Success Criteria scenario 3 in proposal.md.*
- `ScriptRunner` MUST pass the call through when `stdout` parses to `{"allowed": true}`.

### "Global validator denial blocks the call"
*Corresponds to Success Criteria scenario 4 in proposal.md.*
- `ScriptRunner` MUST propagate the `reason` string to the caller so it can be surfaced to the user.

### "Script timeout triggers fail-safe block"
*Corresponds to Success Criteria scenario 5 in proposal.md.*
- `ScriptRunner` MUST kill the child process after 3 seconds and return a deny verdict.
- The `reason` field MUST indicate a timeout so the user is not left without context.
