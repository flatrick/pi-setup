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

1.  **Process Environment**: Variables currently exported in the shell/process.
2.  **Config `env` Block**: Values explicitly provided in the `.mcp.json` file.
3.  **.env File**: Values loaded from a `.env` file in the workspace root (ignored if checked into git).

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

## Risks & Unknowns
- **Concurrency**: Ensuring that multiple server initializations do not block each other or the overall startup time.
- **Streaming Complexity**: Correctly handling complex streamed responses from the Streamable HTTP transport to ensure `pi` receives the data correctly for tool execution.
