import { StdioTransport } from '../transport/stdio_transport.js';
import { MCPError, MCPErrorType } from './errors.js';
import { notifyMCPError } from './errors.js';

/**
 * Handles high-level MCP protocol interactions for a specific server.
 */
export class ServerClient {
  private transport: StdioTransport;
  private serverId: string;
  private tools: Record<string, any> = {};
  private isInitialized = false;
  private pendingRequests: Map<number, (response: any) => void> = new Map();
  private requestIdCounter = 0;

  constructor(serverId: string, serverConfig: any) {
    this.serverId = serverId;
    this.transport = new StdioTransport(serverConfig);
  }

  /**
   * Connects to the transport and performs the MCP initialization handshake.
   */
  async connect(): Promise<void> {
    try {
      await this.transport.connect();

      // Wait for first message from server (should be initialize response)
      await new Promise((resolve, reject) => {
        this.transport.once('message', (msg) => {
          if (msg.jsonrpc && msg.method === 'initialize') {
            resolve(msg);
          } else {
            reject(new Error(`Expected initialize message but received: ${JSON.stringify(msg)}`));
          }
        });
        setTimeout(() => reject(new Error("Initialization handshake timeout")), 10000);
      });

      // Send initialization request
      const initId = ++this.requestIdCounter;
      await this.transport.send({
        jsonrpc: "2.0",
        id: initId,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "pi-extension", version: "0.1.0" }
        }
      });

      // Wait for initialize response
      await new Promise((resolve, reject) => {
        this.transport.once('message', (msg) => {
          if (msg.id === initId) {
            resolve(msg);
          } else {
            reject(new Error("Unexpected message during initialization"));
          }
        });
      });

      // Discover tools
      await this._discoverTools();

      this.isInitialized = true;
      console.log(`Server ${this.serverId} initialized successfully.`);
    } catch (err) {
      notifyMCPError({}, new MCPError(MCPErrorType.InitializationError, `Failed to initialize server ${this.serverId}: ${err.message}`));
    }
  }

  /**
   * Discovers tools from the connected MCP server.
   */
  private async _discoverTools(): Promise<void> {
    const discoverId = ++this.requestIdCounter;
    await this.transport.send({
      jsonrpc: "2.0",
      id: discoverId,
      method: "tools/list",
      params: {}
    });

    await new Promise((resolve, reject) => {
      this.transport.once('message', (msg) => {
        if (msg.id === discoverId && msg.result?.tools) {
          const tools = msg.result.tools;
          for (const [key, tool] of Object.entries(tools)) {
            // Implement tool prefixing as per requirements: ${serverId}:${tool.name}
            this.tools[`${this.serverId}:${tool.name}`] = tool;
          }
          resolve(true);
        } else {
          reject(new Error("Failed to discover tools"));
        }
      });
    });
  }

  /**
   * Forwards a tool call request to the MCP server.
   */
  async callTool(toolName: string, args: any): Promise<any> {
    if (!this.isInitialized) {
      throw new Error("Server not initialized.");
    }

    const tool = this.tools[toolName];
    if (!tool) {
      throw new Error(`Tool ${toolName} not found.`);
    }

    // Strip prefix for transport call
    const baseName = toolName.split(':')[1];

    return new Promise((resolve, reject) => {
      const id = ++this.requestIdCounter;
      this.pendingRequests.set(id, (response) => {
        if (response.result) {
          resolve(response.result);
        } else {
          reject(new Error(response.error || "Unknown error"));
        }
      });

      this.transport.send({
        jsonrpc: "2.0",
        id,
        method: `tools/call`,
        params: {
          name: baseName,
          arguments: args
        }
      });
    });
  }

  getTools(): Record<string, any> {
    return this.tools;
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
  }
}
