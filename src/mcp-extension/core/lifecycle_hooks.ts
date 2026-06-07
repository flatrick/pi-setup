import { MCPManager } from './mcp_manager.js';
import { notifyMCPError, MCPError, MCPErrorType } from './errors.js';

/**
 * Manages the lifecycle of all active MCP servers.
 */
export class LifecycleManager {
  private activeTransports: Map<string, any> = new Map();

  /**
   * Register an active transport for a server.
   */
  register(serverId: string, transport: any) {
    this.activeTransports.set(serverId, transport);
  }

  /**
   * Gracefully shut down all registered MCP servers.
   */
  async shutdownAll(): Promise<void> {
    const shutdownPromises = Array.from(this.activeTransports.entries()).map(async ([serverId, transport]) => {
      try {
        await transport.disconnect();
        this.activeTransports.delete(serverId);
      } catch (err) {
        console.error(`Failed to disconnect server ${serverId}:`, err);
      }
    });

    await Promise.allSettled(shutdownPromises);
  }

  /**
   * Handle system signals for graceful shutdown.
   */
  setupSignalHandlers() {
    const handleShutdown = async () => {
      console.log('Received shutdown signal. Shutting down MCP servers...');
      await this.shutdownAll();
      process.exit(0);
    };

    process.on('SIGTERM', handleShutdown);
    process.on('SIGINT', handleShutdown);
  }
}

/**
 * This file serves as the entry point for the MCP extension into the pi lifecycle.
 */
export class MCPExtension {
  private manager: MCPManager;

  constructor() {
    this.manager = new MCPManager();
  }

  /**
   * Hook for session start.
   */
  async onSessionStart() {
    console.log("MCP Extension: Session starting...");
    await this.manager.initialize();
  }

  /**
   * Hook for session shutdown.
   */
  async onSessionShutdown() {
    console.log("MCP Extension: Session shutting down...");
    await this.manager.shutdown();
  }

  /**
   * Accessor for the manager instance (e.g., for the /mcp command).
   */
  getManager() {
    return this.manager;
  }
}

/**
 * The required factory function export for pi extensions.
 * Receives the ExtensionAPI and returns an object with all hooks, commands, etc.
 */
export default function (pi: any) {
  const extension = new MCPExtension();

  // Subscribe to lifecycle events
  pi.on("session_start", async (_event, ctx) => {
    await extension.onSessionStart();
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    await extension.onSessionShutdown();
  });

  // Register the /mcp command for status display
  pi.registerCommand("mcp", {
    description: "Show MCP server status and registered tools",
    handler: async (_args, ctx) => {
      const manager = extension.getManager();
      console.log("--- MCP Extension Status ---");
      
      const configs = await manager.getServerConfigs();
      for (const [serverId, info] of Object.entries(configs)) {
        console.log(`Server: ${serverId}`);
        console.log(`  Environment Variables:`);
        for (const [key, resolved] of Object.entries(info.envVars)) {
          console.log(`    ${key} = ${resolved.value} (Source: ${resolved.source})`);
        }
      }

      const tools = manager.getTools();
      console.log("\nRegistered Tools:");
      if (Object.keys(tools).length === 0) {
        console.log("  No tools registered.");
      } else {
        for (const [name, tool] of Object.entries(tools)) {
          console.log(`- ${name}`);
        }
      }
    },
  });

  return extension;
}
