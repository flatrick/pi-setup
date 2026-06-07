# Tasks: MCP HTTP Transport

## 1. Configuration Schema Extension
- [ ] Extend `McpServerConfig` to support `type: "http"` with `url` (required) and `headers` (optional map).
- [ ] Add validation: report a config error for any `http` entry missing `url`; continue loading other servers.
- [ ] Write unit tests for valid and invalid HTTP server config entries.

**Definition of Done**: Validation tests pass; invalid entries are reported without blocking valid ones. *(Scenarios: "Loading an HTTP server from configuration", "Rejecting an HTTP entry missing the url field")*

## 2. HttpTransport — Core Request/Response
- [ ] Implement `HttpTransport` class:
    - [ ] Accept `url` and `headers` from server config.
    - [ ] Attach all configured headers to every outgoing HTTP request.
    - [ ] Send MCP messages as HTTP POST requests to the configured URL.
    - [ ] Handle both single-response and chunked/SSE streamed responses.
    - [ ] Assemble all stream chunks into a single complete MCP message before returning to `ServerClient`.
- [ ] Write unit tests: headers present on every request; streaming response assembled correctly.

**Definition of Done**: Unit tests pass for header attachment and stream assembly. *(Scenarios: "Authorization header is sent with every request", "Streaming response is correctly assembled")*

## 3. Connection Resilience
- [ ] Implement exponential backoff retry logic in `HttpTransport`:
    - [ ] Retry on connection or request failure without surfacing an error until retries are exhausted.
    - [ ] Notify user via `ctx.ui.notify` and mark server as `Error` when the retry window is exhausted.
- [ ] Expose configurable timeouts for connection establishment and per-request duration (separate from the stdio initialization timeout).
- [ ] Write unit tests: retry fires on failure; notification sent after exhaustion; server transitions to `Error`.

**Definition of Done**: Retry tests pass; server is in `Error` state after exhausted retries. *(Scenarios: "Transient failure triggers retry with backoff", "Persistent failure notifies the user")*

## 4. MCPManager Integration
- [ ] Update `MCPManager` to detect `type: "http"` and instantiate `HttpTransport` instead of `StdioTransport`.
- [ ] Verify that `ServerClient` handshake, tool discovery, tool prefixing, and lifecycle hooks work identically for HTTP servers as for stdio servers.
- [ ] Write integration test: an `http`-type server config results in tools registered in `pi` as `<serverId>:<toolName>`.

**Definition of Done**: HTTP-type server tools appear in `pi` with correct prefixes, identical in shape to stdio-registered tools. *(Scenario: "Remote HTTP server tools are registered with prefixes")*

## 5. Observability
- [ ] Extend `/mcp` command output to display granular HTTP connection states: `Connecting`, `Handshaking`, `Connected`, `Disconnected`, `Error`.
- [ ] Write unit test: `/mcp` output reflects the correct state for an HTTP server in each state.

**Definition of Done**: `/mcp` output shows distinct connection states for HTTP servers. *(All Success Criteria scenarios)*
