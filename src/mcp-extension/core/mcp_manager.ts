import { ConfigResolver } from './config_resolver.js';
import { LifecycleManager } from './lifecycle.js';
import { ServerClient } from './server_client.js';
import { notifyMCPError, MCPError, MCPErrorType } from './errors.js';
import { ToolRegistry } from './tool_registry.js';

/**
 * Central coordinator for all MCP servers.
 */
export class MCPManager {
  private clients: Map<string, ServerClient> = new Map();
  private lifecycleManager: LifecycleManager;
  private configResolver: ConfigResolver;
  private toolRegistry: ToolRegistry;

  constructor() {
    this.lifecycleManager = new LifecycleManager();
    this.configResolver = new ConfigResolver();
    this.toolRegistry = new ToolRegistry();
  }

  /**
   * Initializes all servers from the configuration files.
   */
  async initialize(): Promise<void> {
    const { config } = await this.configResolver.resolveConfig(process.cwd());
    
    const initializations: Promise<void>[] = [];

    for (const [serverId, serverConfig] of Object.entries(config.mcpServers)) {
      const client = new ServerClient(serverId, serverConfig);
      this.clients.set(serverId, client);
      this.lifecycleManager.register(serverId, client.transport);
      
      initializations.push((async () => {
        try {
          // Timeout for initialization: 10 seconds as per spec
          await Promise.race([
            client.connect(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Initialization timeout")), 10000))
          ]);

          // Automate registration of all discovered tools into the registry
          this.toolRegistry.register(serverId, client.getTools());
        } catch (err) {
          console.error(`Failed to initialize server ${serverId}:`, err);
          // We don't throw here so other servers can continue initializing
        }
      }));
    }

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
    const { config, resolvedEnvVars } = await this.configResolver.resolveConfig(process.cwd());
    const results: Record<string, any> = {};
    for (const [serverId, serverConfig] of Object.entries(config.mcpServers)) {
      results[serverId] = {
        config: serverConfig,
        envVars: resolvedEnvVars[serverId] || {}
      };
    }
    return results;
  }

  /**
   * Calls a tool by its prefixed name.
   */
  async callTool(toolName: string, args: any): Promise<any> {
    if (!this.toolRegistry.hasTool(toolName)) {
      throw new MCPError(MCPErrorType.ConfigurationError, `Tool ${toolName} not found.`);
    }

    const client = Array.from(this.clients.values()).find(c => c.getTools()[toolName]);
    if (!client) {
      throw new MCPError(MCPErrorType.ConfigurationError, `Client for tool ${toolName} not found.`);
    }

    return client.callTool(toolName, args);
  }

  /**
   * Graceful shutdown of all servers.
   */
  async shutdown(): Promise<void> {
    await this.lifecycleManager.shutdownAll();
  }
}
