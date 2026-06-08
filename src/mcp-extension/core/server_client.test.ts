import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServerClient } from './server_client.js';
import { MCPErrorType } from './errors.js';

vi.mock('../transport/stdio_transport.js', async () => {
  const { EventEmitter } = await import('node:events');
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

/**
 * Drive the MCP handshake without real I/O.
 *
 * Request IDs are deterministic: requestIdCounter starts at 0 and increments
 * before use, so the first request (initialize) gets id=1 and the second
 * (tools/list) gets id=2.
 */
async function connectWithMockServer(client: ServerClient, tools: any[] = []) {
  const connectPromise = client.connect();

  // Yield to the event loop so connect() can await transport.connect() and
  // register the message listener before we emit anything.
  await Promise.resolve();

  // Respond to initialize (id=1)
  client.transport.emit('message', {
    jsonrpc: '2.0',
    id: 1,
    result: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      serverInfo: { name: 'mock' },
    },
  });

  // Yield again so connect() can send notifications/initialized and call
  // discoverTools(), which issues the tools/list request.
  await Promise.resolve();
  await Promise.resolve();

  // Respond to tools/list (id=2)
  client.transport.emit('message', {
    jsonrpc: '2.0',
    id: 2,
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
    (tools as any)['injected'] = true;
    expect(client.getTools()).not.toHaveProperty('injected');
  });
});
