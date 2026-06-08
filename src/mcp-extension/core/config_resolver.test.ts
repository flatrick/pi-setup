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
