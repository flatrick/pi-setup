# Proposal: MCP Policy Engine

## Description
This proposal outlines a dedicated Security Policy Engine for the `pi` MCP extension. This engine acts as a pre-flight gatekeeper for all tool calls made to MCP servers, ensuring that actions are authorized and comply with defined safety boundaries.

## Goals
- **Multi-Layered Security**: Provide a hierarchy of checks ranging from simple allow-lists to complex external scripts.
- **Granular Control**: Allow users to define policies at both the global (server-wide) and local (tool-specific) levels.
- **Extensibility**: Support custom validation logic via external scripts for complex requirements.
- **Fail-Safe Design**: Ensure that any failure in the policy engine (e.g., a script crash or timeout) defaults to blocking the action.

## Policy Evaluation Chain
Every tool request will pass through the following evaluation steps in order. The first check to trigger a "Deny" result will block the call immediately.

1.  **Explicit Allow/Deny**: A simple whitelist or blacklist of tool names (e.g., `github:delete_repo` is denied).
2.  **Argument Regex**: Validation of arguments against forbidden patterns (e.g., blocking any input containing "password" or a URL from an untrusted domain).
3.  **Validator Scripts**: Execution of external scripts for complex logic.
    - **Global Validator**: A script that runs on every call to a specific server.
    - **Tool-Specific Validator**: A script that runs only for a specific tool.

## Validator Script Specification
To maintain a clean separation of concerns, validator scripts will operate as black boxes:
- **Input**: A JSON object provided via `stdin` containing the tool name and arguments.
- **Output**: A JSON object via `stdout` with the format: `{"allowed": boolean, "reason": string}`.
- **Execution Environment**: Scripts will have access to the environment variables resolved by the `EnvResolver`.
- **Timeout**: All scripts must execute within 3 seconds; otherwise, they will be treated as a "Deny" and trigger a fail-safe block.

## Configuration Schema
The policy for each MCP server will be defined in `.mcp.json` under a `policy` block:
```json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "...",
      "args": [...],
      "policy": {
        "allow_list": ["create_issue", "get_repo_contents"],
        "deny_patterns": ["delete_*"],
        "global_validator": "/bin/sh ./scripts/gatekeeper.sh",
        "tool_validators": {
          "create_issue": "/bin/sh ./scripts/content_filter.sh"
        }
      }
    }
  }
}
```

## Success Criteria

#### Scenario: Explicitly denied tool is blocked
Given a tool is listed in the `deny_patterns` of the `.mcp.json` policy block
When `pi` attempts to call that tool
Then the call is blocked before reaching the transport and the user is notified with the reason.

#### Scenario: Tool argument matching a forbidden regex is blocked
Given a tool's `policy` block defines a forbidden argument regex pattern
When `pi` attempts to call that tool with an argument matching the pattern
Then the call is blocked and the user is notified.

#### Scenario: Global validator script approves a call
Given a server has a `global_validator` script configured
When `pi` calls any tool on that server and the script returns `{"allowed": true}`
Then the call proceeds to the transport.

#### Scenario: Global validator script denies a call
Given a server has a `global_validator` script configured
When `pi` calls any tool on that server and the script returns `{"allowed": false, "reason": "..."}`
Then the call is blocked and the reason is surfaced to the user.

#### Scenario: Validator script timeout triggers fail-safe block
Given a validator script is configured but takes longer than 3 seconds to respond
When `pi` calls the associated tool
Then the call is blocked by default and the user is notified of the timeout.

## Non-goals

- **Policy audit logging**: Recording the history of allowed/denied decisions is not in scope for this change.
- **Network-based policy servers**: All validators are local executable scripts; remote policy evaluation is out of scope.
- **Policies defined outside `.mcp.json`**: There is no separate policy file format; all policy configuration lives in the server's `.mcp.json` entry.
- **Sequential or inter-tool policies**: Policies apply to individual tool calls in isolation; chained or stateful policy evaluation is out of scope.
- **Policy inheritance**: Tool-specific validators do not inherit or override global validators; both run independently.

## Risks & Unknowns
- **Script Performance**: While 3 seconds is the timeout, we need to ensure that complex scripts don't significantly impact the agent's responsiveness during frequent tool calls.
- **Complex Nesting**: We need to consider how policies behave when multiple tools are called in sequence or if one validator script triggers another (though we intend to keep them as independent checks).
