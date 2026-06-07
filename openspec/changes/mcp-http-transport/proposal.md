# Proposal: MCP HTTP Transport Support

## Description
This proposal outlines support for the Streamable HTTP transport in the `pi` MCP extension. While the initial release will focus on `stdio` for local processes, this change introduces the ability to connect to remote MCP servers via Streamable HTTP (utilizing Server-Sent Events or other streaming protocols as defined by the MCP specification).

## Goals
- **Remote Server Support**: Enable users to connect to MCP servers hosted over the network.
- **Streamable HTTP Implementation**: Implement a robust transport layer that handles streaming request/response cycles correctly.
- **Configuration Parity**: Extend the `.mcp.json` configuration format to support `type: "http"`.
- **Seamless Integration**: Ensure remote servers are registered and managed with the same lifecycle, tool prefixing, and environment resolution logic as `stdio` servers.

## Configuration Update

The configuration will be extended to support an `http` type:

```json
{
  "mcpServers": {
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

## Implementation Details

### HttpTransport
- Manages persistent connections (or connection pooling) to the remote endpoint.
- Handles headers and request/response cycle as per MCP spec.
- Implements streaming logic to ensure that long-running responses from the server are correctly parsed into MCP messages for `pi`.

### ServerClient (Extensions)
- Update the client to handle differences between `stdio` and `http` message framing/delivery.

### Integration
- The `MCPManager` will determine which transport to instantiate based on the `type` field in `.mcp.json`.
- Environment variable resolution via `EnvResolver` remains unchanged, providing consistent configuration across both transports.

## Success Criteria

#### Scenario: Remote HTTP server tools are registered with prefixes
Given a `.mcp.json` defines a server with `type: "http"` pointing to a valid remote endpoint
When `pi` starts up
Then the server initializes, its tools are discovered, and they are registered in `pi` as `<serverId>:<toolName>`.

#### Scenario: Authorization headers are sent with every request
Given a remote server requires an `Authorization` header defined in `.mcp.json`
When `pi` calls any tool on that server
Then the header is included in every outgoing HTTP request.

#### Scenario: Streaming response is correctly assembled
Given a remote server returns a streamed (chunked/SSE) response to a tool call
When `pi` processes the response
Then all chunks are correctly assembled into a single complete MCP message before being returned as the tool result.

#### Scenario: Transient network failure triggers retry
Given a remote server is temporarily unreachable
When `pi` attempts to call a tool on that server
Then it retries with exponential backoff and notifies the user if the connection cannot be re-established after the retry window.

## Non-goals

- **WebSocket transport**: Only Streamable HTTP (SSE/chunked) is in scope; WebSocket is not.
- **OAuth or token refresh flows**: Authentication is limited to static headers defined in `.mcp.json`; dynamic token renewal is out of scope.
- **Outbound proxy support**: HTTP requests are made directly; proxy configuration is not handled in this change.
- **MCP server discovery**: Remote servers must be explicitly configured by URL; there is no discovery or registry mechanism.
- **Per-request header overrides**: Headers are set at the server level in `.mcp.json` and apply uniformly to all requests.

## Risks & Unknowns
- **Streaming Complexity**: Correctly handling multipart or chunked streams from various HTTP providers can be non-trivial.
- **Connection Resilience**: Network connections are less stable than local pipes; we need a strategy for reconnections and heartbeat monitoring.
- **Latency**: Remote calls will introduce network latency that must be accounted for in tool execution timeouts.
