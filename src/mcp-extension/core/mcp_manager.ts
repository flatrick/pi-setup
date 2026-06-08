import { ConfigResolver } from './config_resolver.js';
import { ServerClient } from './server_client.js';
import { MCPError, MCPErrorType } from './errors.js';
import { ToolRegistry } from './tool_registry.js';

/**
 * Central coordinator for all MCP servers.
 */
export class MCPManager {
  private clients: Map<string, ServerClient> = new Map();
  private configResolver: ConfigResolver;
  private toolRegistry: ToolRegistry;

  constructor() {
    this.configResolver = new ConfigResolver();
    this.toolRegistry = new ToolRegistry();
  }

  /**
   * Initializes all servers from the configuration files.
   */
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

  /**
   * Retrieves the list of all registered tools across all servers.
   */
  getTools(): Record<string, any> {
    return this.toolRegistry.getAllTools();
  }

  /**
   * Gets server configuration including resolved environment variables and their sources.
   */
  async getServerConfigs() {
    const results: Record<string, any> = {};
    for (const [serverId] of this.clients) {
      results[serverId] = this.toolRegistry.getAllTools();
    }
    return results;
  }

  /**
   * Calls a tool by its prefixed name.
   */
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

  /**
   * Graceful shutdown of all servers.
   */
  async shutdown(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.clients.values()).map((client) => client.disconnect())
    );
  }
}
