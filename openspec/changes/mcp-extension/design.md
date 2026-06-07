# Design: MCP Extension

## Architecture Overview

The extension will follow a manager-based architecture where a central coordinator handles configuration loading, server lifecycle management, and registration with the Pi API.

```
┌────────────────────────────┐
│      MCP Manager           │
│  (Coordinates everything) │
└─────────────┬──────────────┘
              │
    ┌──────────┴───────────┐
    ▼                      ▼
┌───────────────┐   ┌───────────────┐
│ StdioTransport │   │ (Future:     │
│ (Child Process)|   │ HttpTransport│
└───────────────┘   └───────────────┘
              │           │
              └───────────┘
                    │
          ┌─────────┴────────┐
          ▼                  ▼
  ┌───────────────┐   ┌───────────────┐
  │ ServerClient   │   │ EnvResolver    │
  │ (MCP Protocol) │   │ (Resolution)  │
  └───────────────┘   └───────────────┘
```

## Components

### 1. MCPManager
- **Responsibilities**:
    - Read and merge `.mcp.json` configs.
    - Instantiate `ServerClient` for each server in the config.
    - Register tools with `pi.registerTool()`.
    - Handle `session_start` and `session_shutdown` events.
    - Provide a unified status of active servers.

### 2. ServerClient
- **Responsibilities**:
    - Perform the MCP `initialize` handshake.
    - Discover tools, resources, and prompts.
    - Forward requests/responses to the assigned transport.
    - Handle MCP-specific notifications (progress, logs).

### 3. Transports
- **StdioTransport**:
    - Uses `node:child_process.spawn`.
    - Manages pipes for `stdin` and `stdout`.
    - Handles `SIGTERM`/`SIGINT` to ensure clean process exit.

### 4. EnvResolver
- **Logic**:
    1. Check `.mcp.json` `env` block (Highest Priority - Explicit Override).
    2. If missing, check `.env` file (Middle Priority - Workspace Context).
    3. If missing, check `process.env` (Lowest Priority - Global/System Context).
- **Traceability**: The resolver must return both the value and the source of the variable (e.g., "config", ".env", or "process.env") to allow for observability in the UI.

## Tool Registration Strategy
To prevent collisions, all tools will be registered with the following name:
`${serverId}:${original_tool_name}`

Example:
- Server Name: `github`
- Tool Name: `create_issue`
- Registered Name: `github:create_issue`

## Concurrency & Error Handling
- **Initialization**: Servers will be initialized in parallel using `Promise.allSettled`.
- **Failure Handling**: If a single server fails to start or initialize, the extension will notify the user via `ctx.ui.notify`, log the error internally, but continue to register all other successfully connected servers.
- **Timeouts**: All connections will have a default timeout (e.g., 10 seconds) to prevent hanging during startup.

## UI & Observability
- **/mcp Command**: A new command that displays:
    - All active MCP servers.
    - Connection status (Connected, Disconnected, Initializing, Error).
    - List of registered tools for each server.
    - **Source Traceability**: For each configuration variable, indicate which source it was loaded from (e.g., `API_KEY: .mcp.json`, `DB_URL: .env`).
- **Notifications**: Use `ctx.ui.notify` to inform the user of connection failures or initialization issues for specific servers without blocking the entire session startup.
