# Specification: MCP Policy Engine

## Description
The MCP Policy Engine provides a pre-flight security gate for all tool calls made by `pi` to MCP servers. It ensures that actions are authorized and comply with user-defined safety boundaries.

## ADDED Requirements

### Requirement: Multi-Layered Evaluation
Every tool request SHALL pass through the following evaluation steps in order. The first check to trigger a "Deny" result SHALL block the call immediately.
1.  **Explicit Allow/Deny**: Check if the tool name is explicitly permitted or blocked in the `.mcp.json` configuration.
2.  **Argument Regex**: Validate tool arguments against forbidden patterns (e.g., secrets, specific URLs).
3.  **Validator Scripts**: Execute external scripts for complex logic.
    - **Global Validator**: A "Gatekeeper" script that runs on every call to a specific server.
    - **Tool-Specific Validator**: A "Permission" script that runs only for a specific tool.

#### Scenario: First deny in the chain blocks the call without running later checks
Given a tool is matched by a `deny_patterns` entry and also has a passing global validator configured
When `pi` attempts to call that tool
Then the call is blocked at the allow/deny check and the validator script is never invoked.

### Requirement: Validator Script Specification
Validator scripts SHALL behave as black boxes:
- **Input**: A JSON object provided via `stdin` containing the tool name and arguments.
- **Output**: A JSON object via `stdout` with the format: `{"allowed": boolean, "reason": string}`.
- **Execution Environment**: Scripts SHALL have access to the environment variables resolved by the `EnvResolver`.
- **Fail-Safe**: If a script crashes, times out (> 3s), or returns an error, the action SHALL be blocked by default.

#### Scenario: Blocked call due to policy violation
Given a tool is explicitly denied in the `.mcp.json` policy block
When `pi` attempts to execute that tool
Then the call SHALL be blocked and the user notified.
