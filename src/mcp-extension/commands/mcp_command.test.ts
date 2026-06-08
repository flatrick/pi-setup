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

  it('displays server names from getServerConfigs result', async () => {
    const manager = {
      getTools: vi.fn().mockReturnValue({}),
      getServerConfigs: vi.fn().mockResolvedValue({ 'my-server': {} }),
    } as unknown as MCPManager;
    await handleMcpCommand(manager);
    const output = consoleLog.mock.calls.flat().join('\n');
    expect(output).toContain('my-server');
  });
});
