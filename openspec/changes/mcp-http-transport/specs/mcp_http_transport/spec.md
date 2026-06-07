# Specification: MCP HTTP Transport

## Description
This change extends the `mcp-extension` to support Streamable HTTP as a second transport option, enabling `pi` to connect to MCP servers hosted over the network. All lifecycle management, tool prefixing, and environment resolution behaviour from `mcp-extension` applies unchanged.

## MODIFIED Requirements

### Requirement: Configuration Support
`Configuration` SHALL support an additional `type: "http"` server entry with the following fields:
- `url`: The remote endpoint URL (required for `http` type).
- `headers`: An optional map of static HTTP headers (e.g., `Authorization`) sent with every request.

#### Scenario: Loading an HTTP server from configuration
Given a `.mcp.json` defines a server with `type: "http"` and a valid `url` field
When `pi` starts up
Then it instantiates an `HttpTransport` for that server and proceeds with the standard MCP initialization handshake.

#### Scenario: Rejecting an HTTP entry missing the url field
Given a `.mcp.json` defines a server with `type: "http"` but no `url` field
When `pi` attempts to load the configuration
Then it reports a configuration error for that server and continues loading the remaining servers.

## ADDED Requirements

### Requirement: HttpTransport
`HttpTransport` SHALL manage the full request/response lifecycle for a remote MCP server over Streamable HTTP.
- It SHALL attach all headers defined in the server's `headers` config to every outgoing request.
- It SHALL correctly assemble chunked or SSE responses into complete MCP messages before passing them to `ServerClient`.
- It SHALL surface a distinct set of connection states: `Connecting`, `Handshaking`, `Connected`, `Disconnected`, `Error`.

#### Scenario: Authorization header is sent with every request
Given a server config defines `headers: { "Authorization": "Bearer token" }`
When `pi` calls any tool on that server
Then the `Authorization` header is present on every outgoing HTTP request.

#### Scenario: Streaming response is correctly assembled
Given a remote server returns a tool result as a chunked or SSE stream
When `pi` receives the response
Then all chunks are assembled into a single complete MCP message before it is returned as the tool result.

### Requirement: Connection Resilience
`HttpTransport` SHALL implement retry logic for transient network failures.
- It SHALL retry failed connection attempts using exponential backoff without surfacing an error to the user until the retry window is exhausted.
- It SHALL notify the user via `ctx.ui.notify` and mark the server as `Error` when all retry attempts are exhausted.
- Network-specific timeouts for connection establishment and per-request duration SHALL be configurable separately from the `stdio` initialization timeout.

#### Scenario: Transient failure triggers retry with backoff
Given a remote server is temporarily unreachable
When `pi` attempts to call a tool on that server
Then the transport retries with exponential backoff without surfacing an error to the user until the retry window is exhausted.

#### Scenario: Persistent failure notifies the user
Given a remote server remains unreachable after all retry attempts
When the retry window is exhausted
Then the user is notified via `ctx.ui.notify` and the server is marked as `Error`.
