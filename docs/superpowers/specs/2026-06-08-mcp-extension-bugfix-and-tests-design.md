# Design: MCP Extension Bug Fixes + Vitest Test Coverage

**Date:** 2026-06-08  
**Branch:** mcp-extension  
**Scope:** Fix 6 pre-existing bugs that prevent the extension from running, then add Vitest unit and integration tests.

---

## 1. Bug Catalog

### Bug 1 — MCP handshake is inverted (`server_client.ts:29-62`)

**Current behaviour:** `ServerClient.connect()` first waits for the *server* to emit an `initialize` message before the client sends one. MCP servers never send this unprompted — they wait for the client.

**Correct MCP handshake sequence:**
1. Client sends `initialize` request (protocolVersion, capabilities, clientInfo)
2. Server responds with its capabilities
3. Client sends `initialized` notification (no response expected — fire-and-forget)
4. Connection is now live; `tools/list` may be sent

**Fix:** Invert the handshake — client sends `initialize` first, awaits the response, then sends `initialized`.

---

### Bug 2 — `_processBuffer` crashes on `const` reassignment (`stdio_transport.ts:72-95`)

**Current behaviour:** `newBuffer` is declared `const` on line 73 but reassigned inside the while loop on line 82. Node.js throws `TypeError: Assignment to constant variable` the first time any newline-containing chunk arrives, killing the transport.

**Secondary issue:** The method signature takes `buffer: string` as a parameter (the current tail) but the tail is never correctly threaded back to the caller — the method updates `this.outputBuffer` / `this.inputBuffer` directly but only after the crash.

**Fix:** Rewrite `_processBuffer` using a `let` variable for the accumulator and return the unconsumed tail so callers update the buffer themselves. Extract into a pure helper function `parseMessages(buffer: string, chunk: string): { messages: unknown[]; remainder: string }` — this also makes the buffer logic unit-testable.

---

### Bug 3 — `MCPError` is an interface, used as a class (`errors.ts:10`, `server_client.ts:70`)

**Current behaviour:** `MCPError` is defined as a TypeScript `interface`. Call sites do `new MCPError(MCPErrorType.X, "message")`, which TypeScript will reject at compile time (interfaces have no constructor).

**Fix:** Convert `MCPError` to a `class` that `extends Error`, taking `(type: MCPErrorType, message: string)` as constructor arguments and setting `this.name` to `'MCPError'`.

---

### Bug 4 — No tools ever register (`mcp_manager.ts:43`, `tool_registry.ts:16`)

**Current behaviour:** `toolRegistry.register(serverId, client.getTools())` passes a `Record<string, any>` object. `ToolRegistry.register()` immediately checks `Array.isArray(rawTools)` and returns early when false. The registry remains permanently empty; tool calling always fails.

**Fix:** Change the call site to `toolRegistry.register(serverId, Object.values(client.getTools()))`. `client.getTools()` already keys tools by prefixed name, so `Object.values()` gives the array `register()` expects.

---

### Bug 5 — Missing `await` on async method (`mcp_command.ts:11`)

**Current behaviour:** `const configs = manager.getServerConfigs()` binds the *Promise*, not the resolved config object. `Object.entries(configs)` iterates a Promise (zero entries), so the `/mcp` command silently outputs nothing.

**Fix:** `const configs = await manager.getServerConfigs()`.

---

### Bug 6 — Duplicate `LifecycleManager` class (`lifecycle.ts` vs `lifecycle_hooks.ts`)

**Current behaviour:** An identical `LifecycleManager` class is defined in both files. `mcp_manager.ts` imports from `lifecycle.ts`; the copy in `lifecycle_hooks.ts` is dead code.

**Fix:** Remove the `LifecycleManager` class from `lifecycle_hooks.ts`. Keep only the `MCPExtension` class and the default export factory there.

---

## 2. Test Architecture

### Framework

Vitest with TypeScript. No separate `__tests__` directory — each module gets a `*.test.ts` sibling in the same folder.

```
src/mcp-extension/
  core/
    config_resolver.test.ts
    errors.test.ts
    mcp_manager.test.ts
    server_client.test.ts
    tool_registry.test.ts
  transport/
    stdio_transport.test.ts
  commands/
    mcp_command.test.ts
```

### Per-module test plan

| Module | Type | Key scenarios |
|---|---|---|
| `ToolRegistry` | Unit | register prefixes correctly, two servers with same base name don't collide, `hasTool` returns true/false, empty registry returns `{}` |
| `ConfigResolver` | Unit | local `.mcp.json` wins over global, falls back to global when local absent, env precedence (config > .env > process.env), missing both files returns `{ mcpServers: {} }` |
| `errors.ts` | Unit | `MCPError` is instanceof Error, sets type and message, `notifyMCPError` calls `ctx.ui.notify` when available, falls back to `console.error` |
| `stdio_transport.ts` | Unit | `parseMessages` handles partial chunk, two messages in one chunk, message split across two chunks, malformed JSON logged not thrown |
| `ServerClient` | Unit (mocked transport) | correct handshake order (initialize → initialized → tools/list), tools keyed by prefixed name, `callTool` strips prefix before sending, rejects when not initialized |
| `MCPManager` | Integration | one failing server does not prevent others from initializing, tools from all servers appear in `getTools()`, `shutdown()` calls disconnect on all clients |
| `mcp_command` | Unit (mocked manager) | awaits async config, lists tools, handles empty tool set |

### Mocking strategy

- **`StdioTransport`** is replaced with a Vitest mock (`vi.mock`) in `ServerClient` tests — no real child processes.
- **`MCPManager` integration test** uses a tiny inline Node.js script as a real MCP server fixture. This validates actual stdio framing and the handshake without relying on external packages.
- **`ConfigResolver`** tests write temp files to `os.tmpdir()` and clean up in `afterEach`.

### Coverage

Coverage is a guide, not a hard target. Logic-dense modules (ToolRegistry, ConfigResolver, parseMessages, ServerClient) should reach high coverage naturally. Thin wrappers (LifecycleManager, MCPExtension entry point) are not worth forcing.

---

## 3. Execution Order

1. Fix Bug 6 (remove duplicate class) — structural cleanup first
2. Fix Bug 3 (MCPError class) — referenced by all other fixes
3. Fix Bug 2 (buffer crash + extract `parseMessages`)
4. Fix Bug 1 (handshake order)
5. Fix Bug 4 (tool registration)
6. Fix Bug 5 (missing await)
7. Install Vitest, configure `vitest.config.ts`
8. Write tests module by module (ToolRegistry → ConfigResolver → errors → StdioTransport → ServerClient → MCPManager → mcp_command)
9. Run full suite, verify it passes
