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
