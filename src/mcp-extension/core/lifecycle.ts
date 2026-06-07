import { StdioTransport } from '../transport/stdio_transport.js';
import { MCPError, MCPErrorType } from './errors.js';

/**
 * Manages the lifecycle of all active MCP servers.
 */
export class LifecycleManager {
  private activeTransports: Map<string, StdioTransport> = new Map();

  /**
   * Register an active transport for a server.
   */
  register(serverId: string, transport: StdioTransport) {
    this.activeTransports.set(serverId, transport);
  }

  /**
   * Gracefully shut down all registered MCP servers.
   * This should be called when the pi session is shutting down.
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
