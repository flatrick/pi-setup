# Proposal: MCP Extension Support

## Description
This proposal outlines a new extension for `pi` to support the Model Context Protocol (MCP). This will allow `pi` to dynamically connect to a wide variety of tools, data sources, and prompts by interacting with MCP servers.

## Goals
- **Standardized Integration**: Support the standard `.mcp.json` configuration format used by other agentic tools.
- **Multi-Server Support**: Allow users to define and manage multiple MCP servers concurrently.
- **Robust Transports**: Support `stdio` (for local processes) as the primary transport. Streamable HTTP (for remote services) will be added in a future iteration.
- **Seamless Tooling**: Automatically register tools from all active servers into the `pi` tool registry with unique prefixes to avoid collisions.
- **Flexible Environment Configuration**: Provide a layered environment variable resolution system for security and ease of use.

## Configuration

### Files
1.  **Workspace Local**: `.mcp.json` in the current working directory (`ctx.cwd`).
2.  **Global Config**: `~/.pi/agent/.mcp.json`.

The extension will prioritize the workspace local file. If it exists, it is used exclusively; otherwise, it falls back to the global config.

### Format
```json
{
  "mcpServers": {
    "my-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-everything"],
      "env": {
        "SOME_KEY": "some_value"
      }
    },
    "remote-service": {
      "type": "http",
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ..."
      }
    }
  }
}
```

## Environment Variable Resolution
To ensure security and flexibility, environment variables will be resolved in the following order of precedence (highest to lowest):

1.  **Config `env` Block**: Values explicitly provided in the `.mcp.json` file.
2.  **.env File**: Values loaded from a `.env` file in the workspace root (ignored if checked into git).
3.  **Process Environment**: Variables currently exported in the shell/process.

## Implementation Details

### Transport Layer
- **StdioTransport**: Manages child process lifecycles using `node:child_process`, handling stdin/stdout streams and shutdown signals. Support for this will be the initial implementation focus.

### Tool Registry & Prefixing
To prevent name collisions between different servers, every tool will be registered in `pi` with a prefix derived from the server's configuration key.
- Example: A tool `get_status` on server `dotnet-mcp` will be registered as `dotnet-mcp:get_status`.

### Lifecycle Management
The extension will hook into the following `pi` events:
- `session_start`: Discover servers from config, initiate connections, perform MCP initialization (handshake), and register tools.
- `session_shutdown`: Gracefully terminate all active child processes and close network connections.

## Success Criteria

#### Scenario: Tools from a connected server are registered with prefixes
Given a `.mcp.json` exists in the workspace with a `github` server providing a `create_issue` tool
When `pi` starts up
Then `github:create_issue` is available in the `pi` tool registry.

#### Scenario: Two servers providing identically-named tools do not collide
Given a `github` server and a `gitlab` server both provide a tool named `create_issue`
When both servers are connected
Then the tools are registered as `github:create_issue` and `gitlab:create_issue` respectively, with neither overwriting the other.

#### Scenario: One server failing does not block others
Given three MCP servers are defined, and one of them has an invalid command
When `pi` starts up
Then the failing server is marked as "Error" and the user is notified, while the other two initialize successfully.

#### Scenario: /mcp command shows live status
Given two MCP servers are connected and one is in an error state
When the user runs the `/mcp` command
Then it displays the connection status and registered tools for all three servers.

#### Scenario: Graceful shutdown on session end
Given two MCP servers are actively connected
When `pi` shuts down
Then all child processes and connections are closed without leaving orphaned processes.

## Non-goals

- **HTTP transport**: Remote server support via Streamable HTTP is deferred to `mcp-http-transport`.
- **Security policy enforcement**: Policy evaluation (allow/deny lists, validator scripts) is deferred to `mcp-extension-policy-engine`. This change includes only a pass-through stub.
- **Overflow management**: Context window size checking and file offloading is deferred to `mcp-extension-overflow-management`. This change includes only a pass-through stub.
- **MCP server discovery**: Servers must be explicitly declared in `.mcp.json`; no automatic discovery or registry lookup.
- **WebSocket or SSE transports**: Only `stdio` is in scope for this change.

## Risks & Unknowns
- **Concurrency**: Ensuring that multiple server initializations do not block each other or the overall startup time.
- **Streaming Complexity**: Correctly handling complex streamed responses from the Streamable HTTP transport to ensure `pi` receives the data correctly for tool execution.
