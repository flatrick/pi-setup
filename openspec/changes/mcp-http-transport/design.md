# Design: MCP HTTP Transport

## Architecture Overview

The extension will extend the manager-based architecture to include a dedicated HTTP transport layer.

```
┌────────────────────────────┐
│      MCP Manager           │
│  (Coordinates everything) │
└─────────────┬──────────────┘
              │
    ┌──────────┴───────────┐
    ▼                      ▼
┌───────────────┐   ┌───────────────┐
│ StdioTransport │   │ HttpTransport │
│ (Child Process)|   │ (Remote HTTP) │
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
- Remains the central coordinator for configuration loading, server lifecycle, and tool registration.
- Identifies transport type from `.mcp.json` to instantiate the correct provider.
- **Maps to**: Requirement: Configuration Support (MODIFIED).

### 2. ServerClient
- Handles common MCP handshake logic (`initialize`, discover tools).
- Bridges the communication between the `MCPManager` and the specific transport (Stdio or Http).
- **Maps to**: Requirement: HttpTransport (handshake and tool discovery apply equally to HTTP servers).

### 3. HttpTransport
- **Responsibilities**:
    - Manages remote connections to the configured URL.
    - Handles HTTP headers (e.g., Authorization).
    - Implements the Streamable HTTP protocol (handling SSE/chunked responses).
    - Provides a message stream to the `ServerClient`.
- **Maps to**: Requirement: HttpTransport; Requirement: Connection Resilience.

### 4. EnvResolver
- Shared with the main MCP extension. Ensures consistent environment variable resolution across both local and remote servers.
- **Maps to**: Requirement: Environment Variable Resolution (unchanged from `mcp-extension`).

## Behavioral Descriptions

### "Remote HTTP server tools are registered with prefixes"
*Corresponds to Success Criteria scenario 1 in proposal.md.*
- `MCPManager` MUST instantiate `HttpTransport` when `type: "http"` is set, then proceed through the identical `ServerClient` handshake and tool registration path used by `StdioTransport`.
- Registered tools MUST follow the same `${serverId}:${toolName}` convention.

### "Authorization header is sent with every request"
*Corresponds to Success Criteria scenario 2 in proposal.md.*
- `HttpTransport` MUST apply configured headers to every outgoing request at the transport level, not per-call.
- Headers MUST NOT be omitted on retried requests.

### "Streaming response is correctly assembled"
*Corresponds to Success Criteria scenario 3 in proposal.md.*
- `HttpTransport` MUST buffer all chunks of an SSE or chunked-transfer response and emit a single complete message to `ServerClient` only after the stream closes.
- Partial messages MUST NOT be forwarded.

### "Transient failure triggers retry with backoff"
*Corresponds to Success Criteria scenario 4 in proposal.md.*
- `HttpTransport` MUST catch connection and request errors and retry without propagating to the user during the backoff window.
- Each retry delay MUST be longer than the previous (exponential backoff).

### "Persistent failure notifies the user"
*Corresponds to Success Criteria scenario 4 in proposal.md.*
- After the retry window is exhausted, `HttpTransport` MUST call `ctx.ui.notify` with an informative message and set the server status to `Error`.

## Concurrency & Error Handling
- **Network Timeouts**: Specific timeouts for HTTP requests/connections (distinct from stdio initialization).
- **Retry Logic**: Implementation of exponential backoff for transient network failures.
- **Status Reporting**: More granular status reporting for remote connections (e.g., "Connecting", "Handshaking", "Disconnected").

## Integration Strategy
This change is a progression of the core `mcp-extension`. The architecture remains consistent to ensure that tools registered via HTTP behave identically to those registered via Stdio, with the exception of the underlying transport and network-related failure modes.
