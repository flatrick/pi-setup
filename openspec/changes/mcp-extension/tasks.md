# Tasks: MCP Extension Support

## 1. Foundations & Configuration
- [ ] **Configuration Schema**: Define internal types for `.mcp.json` configuration (Local vs Global).
- [ ] **Config Discovery**: Implement logic to resolve configuration files (Workspace local -> Global path).
- [ ] **EnvResolver**:
    - [ ] Implement 3-tier resolution: `config env block` > `.env` file > `process.env`.
    - [ ] Implement traceability (tracking which source a variable was loaded from).
- [ ] **Error Handling**: Define standard error types and notification patterns for MCP operations.

## 2. Transport Layer (Stdio)
- [ ] **StdioTransport Class**: Create class using `node:child_process.spawn`.
- [ ] **Stream Management**: Implement stdin/stdout pipe handling and message framing.
- [ ] **Lifecycle Signals**: Handle `SIGTERM` and `SIGINT` to ensure clean process termination.

## 3. MCP Client Logic
- [ ] **ServerClient Core**:
    - [ ] Implement MCP `initialize` handshake flow.
    - [ ] Implement tool discovery and mapping logic.
    - [ ] Implement request/response forwarding between transport and client.
- [ ] **Tool Prefixing**: Implement naming convention `${serverId}:${tool_name}` for registry registration.

## 4. Orchestration & Management (MCPManager)
- [ ] **MCPManager Core**: Create the central coordinator for server lifecycles.
- [ ] **Parallel Initialization**: Implement concurrent startup using `Promise.allSettled` with timeouts.
- [ ] **Event Hooks**: Hook into `session_start` and `session_shutdown` to manage connection states.
- [ ] **Tool Registration**: Automate registration of all discovered tools into `pi`.

## 5. UI & Observability
- [ ] **`/mcp` Command**: Implement command to display active servers, status (Connected/Error/etc.), and registered tools.
- [ ] **Traceability UI**: Display configuration source for each environment variable in `/mcp` output.
- [ ] **Notifications**: Integrate `ctx.ui.notify` for individual server connection failures.
