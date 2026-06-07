# Design: MCP Extension

## Architecture Overview

The extension follows a layered pipeline architecture. A central coordinator handles configuration and lifecycle, while every request passes through a security policy engine before reaching the transport layer. Responses are then processed by an overflow manager to protect the agent's context window.

```
┌────────────────────────────┐
│      MCP Manager           │
│ (Config, Lifecycle, Tools)│
└─────────────┬──────────────┘
              │
              ▼
┌────────────────────────────┐
│     Policy Engine          │  <-- Pre-flight Security Gate
│ (Allow/Deny, Regex, Scripts)│
└─────────────┬──────────────┘
              │
              ▼
┌──────────────┴─────────────┐
│       ServerClient          │  <-- Protocol Handshake & Dispatch
├──────────────────────────────┤
│ ┌───────────┐      ┌─────────┐ │
│ │ Transports │      │ Overflow │ │  <-- Communication & Data Handling
│ │ (Stdio/HTTP)│      │ Manager  │ │
│ └───────────┘      └─────────┘ │
└──────────────────────────────┘
```

## Components

### 1. MCPManager
- **Responsibilities**:
    - Read and merge `.mcp.json` configs (Workspace -> Global).
    - Instantiate `ServerClient` for each server.
    - Register tools with unique prefixes (`${serverId}:${tool_name}`).
    - Handle `session_start` (parallel initialization) and `session_shutdown` events.
- **Maps to**: Requirement: Configuration Support; Requirement: Server Management & Lifecycle; Requirement: Tool Integration & Collision Prevention; Requirement: Observability & UI.

### 2. Policy Engine (Pre-flight Security)
Every tool request is intercepted by this engine before being sent to the transport.
- **Evaluation Chain**:
    1.  **Explicit Allow/Deny**: Check if the tool name is explicitly permitted or blocked.
    2.  **Argument Regex**: Validate tool arguments against forbidden patterns (e.g., secrets, specific URLs).
    3.  **Validator Scripts**: Execute external scripts for complex logic.
        - **Global Validator**: A "Gatekeeper" script that runs on every call to a specific server.
        - **Tool-Specific Validator**: A "Permission" script that runs only for a specific tool.
- **Execution Rules**:
    - Scripts receive input via `stdin` and must return a JSON verdict (`{"allowed": bool, "reason": string}`).
    - **Fail-Safe**: If a script crashes, times out (> 3s), or returns an error, the action is blocked by default.
- **Maps to**: Requirement: Security Policy Engine (Stub). Full implementation is specified in `mcp-extension-policy-engine`.

### 3. ServerClient & Transports
- **ServerClient**: Performs MCP `initialize` handshakes and manages the high-level request/response flow.
- **StdioTransport**: Manages `node:child_process` for local servers (handles stdin/stdout pipes, signal handling).
- **HttpTransport**: (Roadmap) Handles remote streamable HTTP connections with headers and retries.
- **Maps to**: Requirement: Server Management & Lifecycle. `HttpTransport` is fully specified in `mcp-http-transport`.

### 4. Overflow Manager (Context Protection)
Processes responses received from the transport before they are returned to `pi`.
- **Size Check**: Monitors the token/character length of tool results.
- **Offloading Strategy**: 
    - If a result exceeds the context window limit, it is saved to `.pi/mcp/<server_name>/<timestamp>.txt`.
    - The agent receives a reference message: *"The result was too large and has been saved to [file path]. You can ask me to read specific parts of this file."*
- **Maps to**: Requirement: Context Window Protection (Stub). Full implementation is specified in `mcp-extension-overflow-management`.

### 5. EnvResolver
- **Logic**: 3-tier precedence (`config env block` > `.env` file > `process.env`).
- **Traceability**: Returns both the value and the source (e.g., "config", ".env") for UI observability.
- **Maps to**: Requirement: Environment Variable Resolution; Requirement: Observability & UI.

## Behavioral Descriptions

### "Tools from a connected server are registered with prefixes"
*Corresponds to Success Criteria scenario 1 in proposal.md.*
- `MCPManager` MUST prefix every tool name with `${serverId}:` before registering it in the `pi` tool registry.
- Prefixing MUST occur after a successful `initialize` handshake, not before.

### "Two servers providing identically-named tools do not collide"
*Corresponds to Success Criteria scenario 2 in proposal.md.*
- Each tool is keyed by its full prefixed name; two servers sharing a base tool name MUST produce two distinct registry entries.

### "One server failing does not block others"
*Corresponds to Success Criteria scenario 3 in proposal.md.*
- `MCPManager` MUST use `Promise.allSettled` (not `Promise.all`) so a rejected initialization does not cancel in-flight initializations for other servers.
- The failed server MUST be set to `Error` status and the user notified via `ctx.ui.notify`.

### "/mcp command shows live status"
*Corresponds to Success Criteria scenario 4 in proposal.md.*
- The `/mcp` command MUST read current connection state at call time; it MUST NOT display stale cached state.
- Output MUST include: server name, status, list of registered tools, and env var source per variable.

### "Graceful shutdown on session end"
*Corresponds to Success Criteria scenario 5 in proposal.md.*
- On `session_shutdown`, `MCPManager` MUST send `SIGTERM` to all stdio child processes and await their exit before the session terminates.
- If a process does not exit within a reasonable window, it MUST be forcefully killed (`SIGKILL`).

## Tool Registration Strategy
To prevent collisions, all tools are registered as:
`${serverId}:${original_tool_name}`

## Concurrency & Error Handling
- **Parallel Initialization**: Servers initialize concurrently via `Promise.allSettled`.
- **Timeouts**: Default 10s timeout for connections; 3s timeout for validator scripts.
- **Failure Handling**: Connection errors notify users via `ctx.ui.notify` without blocking other servers.

## UI & Observability
- **/mcp Command**: Displays active servers, connection statuses, registered tools, and configuration source traceability.
- **Notifications**: Real-time updates on server status changes or policy blocks.
