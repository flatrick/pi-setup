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
