# MCP Extension Bug Fixes + Vitest Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 spec-defined bugs (plus 2 additional bugs discovered during planning) that prevent the MCP extension from running, then add Vitest unit and integration tests.

**Architecture:** Fix bugs in dependency order (structural first, then protocol, then call sites), then add test infrastructure and write tests module by module. The `parseMessages` buffer function is extracted as a pure helper during Bug 2's fix to make it independently testable.

**Tech Stack:** TypeScript, Node.js ESM, Vitest 2.x

---

## File Map

**Modified:**
- `src/mcp-extension/core/lifecycle_hooks.ts` — remove duplicate `LifecycleManager` class
- `src/mcp-extension/core/errors.ts` — convert `MCPError` from interface to class
- `src/mcp-extension/transport/stdio_transport.ts` — fix buffer crash, extract `parseMessages`, remove bogus stdin listener
- `src/mcp-extension/core/server_client.ts` — fix MCP handshake order, fix `_discoverTools`, add persistent message router
- `src/mcp-extension/core/mcp_manager.ts` — fix tool registration, remove broken `LifecycleManager` dependency, add cwd param
- `src/mcp-extension/commands/mcp_command.ts` — add missing `await`, fix `.env` override bug

**Created:**
- `package.json` — project manifest with Vitest dev dependency
- `tsconfig.json` — TypeScript compiler config for ESM
- `vitest.config.ts` — Vitest config
- `src/mcp-extension/__fixtures__/mock-mcp-server.mjs` — minimal MCP server for integration tests
- `src/mcp-extension/core/tool_registry.test.ts`
- `src/mcp-extension/core/config_resolver.test.ts`
- `src/mcp-extension/core/errors.test.ts`
- `src/mcp-extension/transport/stdio_transport.test.ts`
- `src/mcp-extension/core/server_client.test.ts`
- `src/mcp-extension/core/mcp_manager.test.ts`
- `src/mcp-extension/commands/mcp_command.test.ts`

---

## Task 1: Fix Bug 6 — Remove duplicate `LifecycleManager`

**Files:**
- Modify: `src/mcp-extension/core/lifecycle_hooks.ts`

Both `lifecycle.ts` and `lifecycle_hooks.ts` define an identical `LifecycleManager` class. `mcp_manager.ts` imports from `lifecycle.ts`. The copy in `lifecycle_hooks.ts` is dead code.

- [ ] **Step 1: Remove the duplicate class from lifecycle_hooks.ts**

Replace the entire content of `src/mcp-extension/core/lifecycle_hooks.ts` with:

```typescript
import { MCPManager } from './mcp_manager.js';

export class MCPExtension {
  private manager: MCPManager;

  constructor() {
    this.manager = new MCPManager();
  }

  async onSessionStart() {
    await this.manager.initialize();
  }

  async onSessionShutdown() {
    await this.manager.shutdown();
  }

  getManager() {
    return this.manager;
  }
}

export default function (pi: any) {
  const extension = new MCPExtension();

  pi.on("session_start", async (_event: any, _ctx: any) => {
    await extension.onSessionStart();
  });

  pi.on("session_shutdown", async (_event: any, _ctx: any) => {
    await extension.onSessionShutdown();
  });

  pi.registerCommand("mcp", {
    description: "Show MCP server status and registered tools",
    handler: async (_args: any, _ctx: any) => {
      const { handleMcpCommand } = await import('../commands/mcp_command.js');
      await handleMcpCommand(extension.getManager());
    },
  });

  return extension;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/mcp-extension/core/lifecycle_hooks.ts
git commit -m "fix: remove duplicate LifecycleManager from lifecycle_hooks"
```

---

## Task 2: Fix Bug 3 — Convert `MCPError` from interface to class

**Files:**
- Modify: `src/mcp-extension/core/errors.ts`

`MCPError` is defined as an `interface` but all call sites use `new MCPError(type, message)`. Interfaces cannot be instantiated.

- [ ] **Step 1: Replace errors.ts content**

```typescript
export enum MCPErrorType {
  ConfigurationError = 'ConfigurationError',
  TransportError = 'TransportError',
  InitializationError = 'InitializationError',
  RequestError = 'RequestError',
  AuthError = 'AuthError',
  PolicyBlocked = 'PolicyBlocked',
}

export class MCPError extends Error {
  readonly type: MCPErrorType;
  code?: number;
  serverId?: string;
  details?: unknown;

  constructor(type: MCPErrorType, message: string) {
    super(message);
    this.name = 'MCPError';
    this.type = type;
  }
}

export function notifyMCPError(ctx: any, error: MCPError) {
  if (ctx && ctx.ui && typeof ctx.ui.notify === 'function') {
    ctx.ui.notify(`MCP Error [${error.type}] on ${error.serverId ?? 'unknown'}: ${error.message}`);
  } else {
    console.error(`MCP Error [${error.type}] on ${error.serverId ?? 'unknown'}: ${error.message}`, error.details);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/mcp-extension/core/errors.ts
git commit -m "fix: convert MCPError from interface to class"
```

---

## Task 3: Fix Bug 2 — Fix `_processBuffer` crash and extract `parseMessages`

**Files:**
- Modify: `src/mcp-extension/transport/stdio_transport.ts`

Three issues: (1) `newBuffer` declared `const` but reassigned in loop → runtime crash. (2) A listener on `this.inputStream` (stdin, write-only) makes no sense — removed. (3) The buffer tail was never correctly propagated. Fix by extracting a pure `parseMessages` function and simplifying the transport.

- [ ] **Step 1: Replace stdio_transport.ts content**

```typescript
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { MCPError, MCPErrorType, notifyMCPError } from '../core/errors.js';

export function parseMessages(buffer: string, chunk: string): { messages: unknown[]; remainder: string } {
  const messages: unknown[] = [];
  let remainder = buffer + chunk;
  let boundary = remainder.indexOf('\n');

  while (boundary !== -1) {
    const line = remainder.slice(0, boundary).trim();
    if (line) {
      try {
        messages.push(JSON.parse(line));
      } catch {
        console.error(`Failed to parse MCP message: ${line}`);
      }
    }
    remainder = remainder.slice(boundary + 1);
    boundary = remainder.indexOf('\n');
  }

  return { messages, remainder };
}

type ChildProcess = import('node:child_process').ChildProcess;

export class StdioTransport extends EventEmitter {
  private childProcess: ChildProcess | null = null;
  private receiveBuffer = '';

  constructor(private serverConfig: any) {
    super();
  }

  async connect(): Promise<void> {
    const { command, args } = this.serverConfig;
    if (!command) {
      throw new MCPError(MCPErrorType.ConfigurationError, "No command specified for stdio transport.");
    }

    try {
      this.childProcess = spawn(command, args ?? [], {
        stdio: ['pipe', 'pipe', 'inherit'],
        env: { ...process.env, ...this.serverConfig.env },
      });

      this.childProcess.stdout!.on('data', (data: Buffer) => {
        const { messages, remainder } = parseMessages(this.receiveBuffer, data.toString());
        this.receiveBuffer = remainder;
        for (const msg of messages) {
          this.emit('message', msg);
        }
      });

      this.childProcess.on('error', (err: Error) => {
        notifyMCPError({}, new MCPError(MCPErrorType.TransportError, err.message));
        this.emit('error', err);
      });

      this.childProcess.on('close', (code: number | null) => {
        this.emit('close', code);
      });
    } catch (err: any) {
      throw new MCPError(MCPErrorType.InitializationError, `Failed to spawn process: ${err.message}`);
    }
  }

  async send(message: unknown): Promise<void> {
    if (!this.childProcess?.stdin) {
      throw new MCPError(MCPErrorType.TransportError, "Transport is not connected.");
    }
    this.childProcess.stdin.write(JSON.stringify(message) + '\n');
  }

  async disconnect(): Promise<void> {
    if (this.childProcess) {
      this.childProcess.kill('SIGTERM');
      this.childProcess = null;
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/mcp-extension/transport/stdio_transport.ts
git commit -m "fix: extract parseMessages, fix const reassignment crash in StdioTransport"
```

---

## Task 4: Fix Bug 1 — Correct MCP handshake order and fix ServerClient

**Files:**
- Modify: `src/mcp-extension/core/server_client.ts`

Four issues in this file: (1) Handshake waits for server to send `initialize` first — servers never do this. (2) `pendingRequests` map is populated but nothing ever resolves entries — tool calls hang forever. (3) `_discoverTools` calls `Object.entries()` on `msg.result.tools` which is an array per MCP spec. (4) `transport` is `private` but `mcp_manager.ts` tries to access it directly — fixed in Task 5 by removing that access.

Correct MCP sequence: client sends `initialize` → server responds → client sends `notifications/initialized` (no response) → client sends `tools/list` → server responds.

- [ ] **Step 1: Replace server_client.ts content**

```typescript
import { StdioTransport } from '../transport/stdio_transport.js';
import { MCPError, MCPErrorType, notifyMCPError } from './errors.js';

export class ServerClient {
  readonly transport: StdioTransport;
  private serverId: string;
  private tools: Record<string, any> = {};
  private isInitialized = false;
  private pendingRequests: Map<number, (response: any) => void> = new Map();
  private requestIdCounter = 0;

  constructor(serverId: string, serverConfig: any) {
    this.serverId = serverId;
    this.transport = new StdioTransport(serverConfig);
  }

  private sendRequest(method: string, params: unknown): Promise<any> {
    const id = ++this.requestIdCounter;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new MCPError(MCPErrorType.RequestError, `Request timed out: ${method}`));
      }, 10000);

      this.pendingRequests.set(id, (response) => {
        clearTimeout(timeout);
        if (response.result !== undefined) {
          resolve(response.result);
        } else {
          reject(new MCPError(MCPErrorType.RequestError, response.error?.message ?? 'Unknown error'));
        }
      });

      this.transport.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  async connect(): Promise<void> {
    try {
      await this.transport.connect();

      this.transport.on('message', (msg: any) => {
        if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
          const handler = this.pendingRequests.get(msg.id)!;
          this.pendingRequests.delete(msg.id);
          handler(msg);
        }
      });

      await this.sendRequest("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "pi-extension", version: "0.1.0" },
      });

      await this.transport.send({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      });

      await this.discoverTools();
      this.isInitialized = true;
    } catch (err: any) {
      notifyMCPError({}, new MCPError(MCPErrorType.InitializationError, `Failed to initialize server ${this.serverId}: ${err.message}`));
    }
  }

  private async discoverTools(): Promise<void> {
    const result = await this.sendRequest("tools/list", {});
    if (Array.isArray(result?.tools)) {
      for (const tool of result.tools) {
        this.tools[`${this.serverId}:${tool.name}`] = tool;
      }
    }
  }

  async callTool(toolName: string, args: unknown): Promise<any> {
    if (!this.isInitialized) {
      throw new MCPError(MCPErrorType.RequestError, `Server ${this.serverId} is not initialized.`);
    }
    if (!this.tools[toolName]) {
      throw new MCPError(MCPErrorType.RequestError, `Tool ${toolName} not found on server ${this.serverId}.`);
    }
    const baseName = toolName.split(':')[1];
    return this.sendRequest("tools/call", { name: baseName, arguments: args });
  }

  getTools(): Record<string, any> {
    return { ...this.tools };
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/mcp-extension/core/server_client.ts
git commit -m "fix: correct MCP handshake order, fix pending request routing, fix tools/list parsing"
```

---

## Task 5: Fix Bug 4 + Bug 8 — Fix tool registration and remove broken LifecycleManager usage

**Files:**
- Modify: `src/mcp-extension/core/mcp_manager.ts`

Two issues: (1) `toolRegistry.register(serverId, client.getTools())` passes a `Record<string, any>` object, but `register()` expects `any[]` and immediately returns when `Array.isArray()` is false — no tools ever register. Fix: pass `Object.values(client.getTools())`. (2) `client.transport` was `private` (now `readonly` after Task 4), but the `LifecycleManager` pattern is unnecessary — `MCPManager` already holds all clients and can call `disconnect()` directly. Also add optional `cwd` parameter to `initialize()` for testability.

- [ ] **Step 1: Replace mcp_manager.ts content**

```typescript
import { ConfigResolver } from './config_resolver.js';
import { ServerClient } from './server_client.js';
import { MCPError, MCPErrorType } from './errors.js';
import { ToolRegistry } from './tool_registry.js';

export class MCPManager {
  private clients: Map<string, ServerClient> = new Map();
  private configResolver: ConfigResolver;
  private toolRegistry: ToolRegistry;

  constructor() {
    this.configResolver = new ConfigResolver();
    this.toolRegistry = new ToolRegistry();
  }

  async initialize(cwd = process.cwd()): Promise<void> {
    const { config } = await this.configResolver.resolveConfig(cwd);

    const initializations = Array.from(Object.entries(config.mcpServers)).map(
      async ([serverId, serverConfig]) => {
        const client = new ServerClient(serverId, serverConfig);
        this.clients.set(serverId, client);

        await Promise.race([
          client.connect(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Initialization timeout")), 10000)
          ),
        ]);

        this.toolRegistry.register(serverId, Object.values(client.getTools()));
      }
    );

    await Promise.allSettled(initializations);
  }

  getTools(): Record<string, any> {
    return this.toolRegistry.getAllTools();
  }

  async getServerConfigs() {
    const results: Record<string, any> = {};
    for (const [serverId] of this.clients) {
      results[serverId] = this.toolRegistry.getAllTools();
    }
    return results;
  }

  async callTool(toolName: string, args: unknown): Promise<any> {
    if (!this.toolRegistry.hasTool(toolName)) {
      throw new MCPError(MCPErrorType.ConfigurationError, `Tool ${toolName} not found.`);
    }
    const [serverId] = toolName.split(':');
    const client = this.clients.get(serverId);
    if (!client) {
      throw new MCPError(MCPErrorType.ConfigurationError, `No client for tool ${toolName}.`);
    }
    return client.callTool(toolName, args);
  }

  async shutdown(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.clients.values()).map((client) => client.disconnect())
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/mcp-extension/core/mcp_manager.ts
git commit -m "fix: pass Object.values to ToolRegistry.register, remove LifecycleManager dependency"
```

---

## Task 6: Fix Bug 5 + Bug 7 — Add missing `await` and fix `.env` precedence

**Files:**
- Modify: `src/mcp-extension/commands/mcp_command.ts`
- Modify: `src/mcp-extension/core/config_resolver.ts`

Bug 5: `manager.getServerConfigs()` is `async` but called without `await` — configs is a Promise, not data.

Bug 7: In `resolveEnv`, `.env` file entries skip with `if (!resolvedEnv[cleanKey])` — so they can never override `process.env`. The comment says `.env` has middle precedence, but the guard inverts that. Fix: remove the guard.

- [ ] **Step 1: Fix mcp_command.ts**

```typescript
import { MCPManager } from '../core/mcp_manager.js';

export async function handleMcpCommand(manager: MCPManager) {
  console.log("--- MCP Extension Status ---");

  const configs = await manager.getServerConfigs();

  for (const [serverId, info] of Object.entries(configs)) {
    console.log(`Server: ${serverId}`);
  }

  const allTools = manager.getTools();
  console.log("\nRegistered Tools:");
  if (Object.keys(allTools).length === 0) {
    console.log("  No tools registered.");
  } else {
    for (const name of Object.keys(allTools)) {
      console.log(`- ${name}`);
    }
  }
}
```

- [ ] **Step 2: Fix the .env precedence guard in config_resolver.ts**

In `resolveEnv`, the `.env` file parsing block currently reads:

```typescript
if (!resolvedEnv[cleanKey]) {
  resolvedEnv[cleanKey] = { value: val, source: '.env' };
}
```

Replace those three lines with:

```typescript
resolvedEnv[cleanKey] = { value: val, source: '.env' };
```

- [ ] **Step 3: Commit**

```bash
git add src/mcp-extension/commands/mcp_command.ts src/mcp-extension/core/config_resolver.ts
git commit -m "fix: await getServerConfigs in mcp_command, fix .env precedence over process.env"
```

---

## Task 7: Set up Vitest

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "pi-mcp-extension",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, `package-lock.json` written.

- [ ] **Step 5: Verify Vitest runs (no tests yet)**

```bash
npx vitest run
```

Expected output contains: `No test files found`

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts package-lock.json
git commit -m "chore: add Vitest test infrastructure"
```

---

## Task 8: Tests — `ToolRegistry`

**Files:**
- Create: `src/mcp-extension/core/tool_registry.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from './tool_registry.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('registers tools with server prefix', () => {
    registry.register('github', [{ name: 'create_issue', description: 'Creates an issue' }]);
    expect(registry.hasTool('github:create_issue')).toBe(true);
  });

  it('stored tool retains original fields plus prefixed name', () => {
    registry.register('github', [{ name: 'create_issue', description: 'Creates an issue' }]);
    const tools = registry.getAllTools();
    expect(tools['github:create_issue'].name).toBe('github:create_issue');
    expect(tools['github:create_issue'].description).toBe('Creates an issue');
  });

  it('two servers with the same base tool name do not collide', () => {
    registry.register('github', [{ name: 'create_issue' }]);
    registry.register('gitlab', [{ name: 'create_issue' }]);
    const tools = registry.getAllTools();
    expect(tools['github:create_issue']).toBeDefined();
    expect(tools['gitlab:create_issue']).toBeDefined();
    expect(Object.keys(tools)).toHaveLength(2);
  });

  it('returns empty object when nothing is registered', () => {
    expect(registry.getAllTools()).toEqual({});
  });

  it('hasTool returns false for an unknown tool', () => {
    expect(registry.hasTool('unknown:tool')).toBe(false);
  });

  it('ignores non-array input gracefully', () => {
    registry.register('bad', null as any);
    expect(registry.getAllTools()).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/mcp-extension/core/tool_registry.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/mcp-extension/core/tool_registry.test.ts
git commit -m "test: add ToolRegistry unit tests"
```

---

## Task 9: Tests — `ConfigResolver`

**Files:**
- Create: `src/mcp-extension/core/config_resolver.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigResolver } from './config_resolver.js';

function writeMcpJson(dir: string, content: object) {
  writeFileSync(join(dir, '.mcp.json'), JSON.stringify(content));
}

describe('ConfigResolver', () => {
  let tmpDir: string;
  let resolver: ConfigResolver;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `mcp-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    resolver = new ConfigResolver();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty config when no files exist', async () => {
    const { config } = await resolver.resolveConfig(tmpDir);
    expect(config.mcpServers).toEqual({});
  });

  it('loads local .mcp.json', async () => {
    writeMcpJson(tmpDir, {
      mcpServers: { local: { type: 'stdio', command: 'echo', args: [] } },
    });
    const { config } = await resolver.resolveConfig(tmpDir);
    expect(config.mcpServers).toHaveProperty('local');
  });

  it('config env block overrides .env file', async () => {
    writeMcpJson(tmpDir, {
      mcpServers: { s: { type: 'stdio', command: 'echo', env: { MY_KEY: 'from-config' } } },
    });
    writeFileSync(join(tmpDir, '.env'), 'MY_KEY=from-dotenv\n');
    const { resolvedEnvVars } = await resolver.resolveConfig(tmpDir);
    expect(resolvedEnvVars['s']['MY_KEY'].value).toBe('from-config');
    expect(resolvedEnvVars['s']['MY_KEY'].source).toBe('config');
  });

  it('.env file overrides process.env', async () => {
    process.env.__MCP_TEST_KEY = 'from-process';
    writeMcpJson(tmpDir, {
      mcpServers: { s: { type: 'stdio', command: 'echo', env: {} } },
    });
    writeFileSync(join(tmpDir, '.env'), '__MCP_TEST_KEY=from-dotenv\n');
    const { resolvedEnvVars } = await resolver.resolveConfig(tmpDir);
    expect(resolvedEnvVars['s']['__MCP_TEST_KEY'].value).toBe('from-dotenv');
    expect(resolvedEnvVars['s']['__MCP_TEST_KEY'].source).toBe('.env');
    delete process.env.__MCP_TEST_KEY;
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/mcp-extension/core/config_resolver.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/mcp-extension/core/config_resolver.test.ts
git commit -m "test: add ConfigResolver unit tests"
```

---

## Task 10: Tests — `errors.ts`

**Files:**
- Create: `src/mcp-extension/core/errors.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPError, MCPErrorType, notifyMCPError } from './errors.js';

describe('MCPError', () => {
  it('is an instance of Error', () => {
    const err = new MCPError(MCPErrorType.ConfigurationError, 'bad config');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(MCPError);
  });

  it('sets name, type, and message', () => {
    const err = new MCPError(MCPErrorType.TransportError, 'connection refused');
    expect(err.name).toBe('MCPError');
    expect(err.type).toBe(MCPErrorType.TransportError);
    expect(err.message).toBe('connection refused');
  });
});

describe('notifyMCPError', () => {
  it('calls ctx.ui.notify when available', () => {
    const notify = vi.fn();
    const ctx = { ui: { notify } };
    const err = new MCPError(MCPErrorType.RequestError, 'tool failed');
    notifyMCPError(ctx, err);
    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0][0]).toContain('tool failed');
  });

  it('falls back to console.error when ctx has no ui', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new MCPError(MCPErrorType.RequestError, 'tool failed');
    notifyMCPError({}, err);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/mcp-extension/core/errors.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/mcp-extension/core/errors.test.ts
git commit -m "test: add MCPError and notifyMCPError unit tests"
```

---

## Task 11: Tests — `parseMessages` (StdioTransport buffer logic)

**Files:**
- Create: `src/mcp-extension/transport/stdio_transport.test.ts`

The `parseMessages` function is the only logic worth testing in isolation here — the class itself is a thin wrapper over `child_process.spawn`.

- [ ] **Step 1: Create the test file**

```typescript
import { describe, it, expect } from 'vitest';
import { parseMessages } from './stdio_transport.js';

describe('parseMessages', () => {
  it('parses a single complete message', () => {
    const { messages, remainder } = parseMessages('', '{"id":1}\n');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ id: 1 });
    expect(remainder).toBe('');
  });

  it('accumulates a partial message as remainder', () => {
    const { messages, remainder } = parseMessages('', '{"id":1');
    expect(messages).toHaveLength(0);
    expect(remainder).toBe('{"id":1');
  });

  it('completes a message split across two chunks', () => {
    const first = parseMessages('', '{"id":1');
    const second = parseMessages(first.remainder, '}\n');
    expect(second.messages).toHaveLength(1);
    expect(second.messages[0]).toEqual({ id: 1 });
  });

  it('parses two messages in one chunk', () => {
    const { messages } = parseMessages('', '{"a":1}\n{"b":2}\n');
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ a: 1 });
    expect(messages[1]).toEqual({ b: 2 });
  });

  it('skips malformed JSON without throwing', () => {
    const { messages, remainder } = parseMessages('', 'not-json\n{"id":2}\n');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ id: 2 });
    expect(remainder).toBe('');
  });

  it('handles empty chunk with no prior buffer', () => {
    const { messages, remainder } = parseMessages('', '');
    expect(messages).toHaveLength(0);
    expect(remainder).toBe('');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/mcp-extension/transport/stdio_transport.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/mcp-extension/transport/stdio_transport.test.ts
git commit -m "test: add parseMessages unit tests"
```

---

## Task 12: Tests — `ServerClient` (mocked transport)

**Files:**
- Create: `src/mcp-extension/core/server_client.test.ts`

Mock `StdioTransport` entirely — no child processes. The mock implements `connect()`, `send()`, `disconnect()`, and is an `EventEmitter` so the client's `on('message', ...)` listener works.

- [ ] **Step 1: Create the test file**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { ServerClient } from './server_client.js';
import { MCPErrorType } from './errors.js';

vi.mock('../transport/stdio_transport.js', () => {
  class StdioTransport extends EventEmitter {
    connect = vi.fn().mockResolvedValue(undefined);
    send = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
  }
  return { StdioTransport };
});

function makeClient(serverId = 'test-server') {
  return new ServerClient(serverId, { type: 'stdio', command: 'echo' });
}

async function connectWithMockServer(client: ServerClient, tools: any[] = []) {
  const connectPromise = client.connect();

  // Simulate server responses in the correct MCP sequence
  await vi.waitFor(() => {
    expect(client.transport.send).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'initialize' })
    );
  });

  // Respond to initialize
  const initCall = (client.transport.send as ReturnType<typeof vi.fn>).mock.calls.find(
    (c: any[]) => c[0].method === 'initialize'
  );
  client.transport.emit('message', {
    jsonrpc: '2.0',
    id: initCall[0].id,
    result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'mock' } },
  });

  // Wait for initialized notification, then tools/list
  await vi.waitFor(() => {
    expect(client.transport.send).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'tools/list' })
    );
  });

  const toolsCall = (client.transport.send as ReturnType<typeof vi.fn>).mock.calls.find(
    (c: any[]) => c[0].method === 'tools/list'
  );
  client.transport.emit('message', {
    jsonrpc: '2.0',
    id: toolsCall[0].id,
    result: { tools },
  });

  await connectPromise;
}

describe('ServerClient', () => {
  it('sends initialize before tools/list', async () => {
    const client = makeClient();
    await connectWithMockServer(client);

    const calls = (client.transport.send as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: any[]) => c[0].method
    );
    const initIdx = calls.indexOf('initialize');
    const toolsIdx = calls.indexOf('tools/list');
    expect(initIdx).toBeGreaterThanOrEqual(0);
    expect(toolsIdx).toBeGreaterThan(initIdx);
  });

  it('sends initialized notification after initialize response', async () => {
    const client = makeClient();
    await connectWithMockServer(client);

    const calls = (client.transport.send as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: any[]) => c[0].method
    );
    expect(calls).toContain('notifications/initialized');
    const initIdx = calls.indexOf('initialize');
    const notifIdx = calls.indexOf('notifications/initialized');
    expect(notifIdx).toBeGreaterThan(initIdx);
  });

  it('registers tools with server prefix', async () => {
    const client = makeClient('my-server');
    await connectWithMockServer(client, [{ name: 'do_thing', description: 'does a thing' }]);
    expect(client.getTools()).toHaveProperty('my-server:do_thing');
  });

  it('getTools returns a copy, not the internal map', async () => {
    const client = makeClient();
    await connectWithMockServer(client, [{ name: 'tool_a' }]);
    const tools = client.getTools();
    tools['injected'] = true;
    expect(client.getTools()).not.toHaveProperty('injected');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/mcp-extension/core/server_client.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/mcp-extension/core/server_client.test.ts
git commit -m "test: add ServerClient unit tests with mocked transport"
```

---

## Task 13: Tests — `MCPManager` integration

**Files:**
- Create: `src/mcp-extension/__fixtures__/mock-mcp-server.mjs`
- Create: `src/mcp-extension/core/mcp_manager.test.ts`

The mock server is a real Node.js script spawned by `StdioTransport`. It responds to the MCP handshake over stdio, making this a true integration test of the full initialization path.

- [ ] **Step 1: Create the mock MCP server fixture**

Create `src/mcp-extension/__fixtures__/mock-mcp-server.mjs`:

```javascript
import * as readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }

  if (msg.method === 'initialize') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0', id: msg.id,
      result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'mock', version: '0.1.0' } },
    }) + '\n');
  } else if (msg.method === 'notifications/initialized') {
    // no response
  } else if (msg.method === 'tools/list') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0', id: msg.id,
      result: { tools: [{ name: 'echo', description: 'Echoes input', inputSchema: { type: 'object' } }] },
    }) + '\n');
  } else if (msg.method === 'tools/call') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0', id: msg.id,
      result: { content: [{ type: 'text', text: JSON.stringify(msg.params.arguments) }] },
    }) + '\n');
  }
});
```

- [ ] **Step 2: Create the integration test**

Create `src/mcp-extension/core/mcp_manager.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { MCPManager } from './mcp_manager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_SERVER = join(__dirname, '../__fixtures__/mock-mcp-server.mjs');

function writeMcpJson(dir: string, content: object) {
  writeFileSync(join(dir, '.mcp.json'), JSON.stringify(content));
}

describe('MCPManager integration', () => {
  let tmpDir: string;
  let manager: MCPManager;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `mcp-mgr-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    manager = new MCPManager();
  });

  afterEach(async () => {
    await manager.shutdown();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('registers tools from a connected server', async () => {
    writeMcpJson(tmpDir, {
      mcpServers: { mock: { type: 'stdio', command: 'node', args: [MOCK_SERVER] } },
    });
    await manager.initialize(tmpDir);
    const tools = manager.getTools();
    expect(tools).toHaveProperty('mock:echo');
  }, 15000);

  it('one failing server does not block others', async () => {
    writeMcpJson(tmpDir, {
      mcpServers: {
        bad: { type: 'stdio', command: 'this-command-does-not-exist-xyz' },
        good: { type: 'stdio', command: 'node', args: [MOCK_SERVER] },
      },
    });
    await manager.initialize(tmpDir);
    const tools = manager.getTools();
    expect(tools).toHaveProperty('good:echo');
    expect(Object.keys(tools).some((k) => k.startsWith('bad:'))).toBe(false);
  }, 15000);

  it('shutdown disconnects all clients without throwing', async () => {
    writeMcpJson(tmpDir, {
      mcpServers: { mock: { type: 'stdio', command: 'node', args: [MOCK_SERVER] } },
    });
    await manager.initialize(tmpDir);
    await expect(manager.shutdown()).resolves.not.toThrow();
  }, 15000);
});
```

- [ ] **Step 3: Run integration tests**

```bash
npx vitest run src/mcp-extension/core/mcp_manager.test.ts
```

Expected: 3 tests pass. (These spawn real processes and have a 15-second timeout.)

- [ ] **Step 4: Commit**

```bash
git add src/mcp-extension/__fixtures__/mock-mcp-server.mjs src/mcp-extension/core/mcp_manager.test.ts
git commit -m "test: add MCPManager integration tests with real mock MCP server"
```

---

## Task 14: Tests — `mcp_command`

**Files:**
- Create: `src/mcp-extension/commands/mcp_command.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleMcpCommand } from './mcp_command.js';
import type { MCPManager } from '../core/mcp_manager.js';

function makeMockManager(tools: Record<string, any> = {}): MCPManager {
  return {
    getTools: vi.fn().mockReturnValue(tools),
    getServerConfigs: vi.fn().mockResolvedValue({}),
  } as unknown as MCPManager;
}

describe('handleMcpCommand', () => {
  let consoleLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLog.mockRestore();
  });

  it('shows "No tools registered" when tool list is empty', async () => {
    await handleMcpCommand(makeMockManager());
    const output = consoleLog.mock.calls.flat().join('\n');
    expect(output).toContain('No tools registered');
  });

  it('lists registered tools by name', async () => {
    const manager = makeMockManager({ 'github:create_issue': { name: 'github:create_issue' } });
    await handleMcpCommand(manager);
    const output = consoleLog.mock.calls.flat().join('\n');
    expect(output).toContain('github:create_issue');
  });

  it('awaits getServerConfigs (does not treat Promise as configs)', async () => {
    const manager = makeMockManager();
    await handleMcpCommand(manager);
    expect(manager.getServerConfigs).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/mcp-extension/commands/mcp_command.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 3: Run the full test suite**

```bash
npx vitest run
```

Expected: All tests pass across all 7 test files.

- [ ] **Step 4: Commit**

```bash
git add src/mcp-extension/commands/mcp_command.test.ts
git commit -m "test: add mcp_command unit tests"
```
