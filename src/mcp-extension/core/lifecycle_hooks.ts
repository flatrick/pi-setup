import { MCPManager } from './mcp_manager.js';

export class MCPExtension {
  private manager: MCPManager;

  constructor() {
    this.manager = new MCPManager();
  }

  async onSessionStart() {
    await this.manager.initialize();
  }

  async onSessionShutdown() {
    await this.manager.shutdown();
  }

  getManager() {
    return this.manager;
  }
}

export default function (pi: any) {
  const extension = new MCPExtension();

  pi.on("session_start", async (_event: any, _ctx: any) => {
    await extension.onSessionStart();
  });

  pi.on("session_shutdown", async (_event: any, _ctx: any) => {
    await extension.onSessionShutdown();
  });

  pi.registerCommand("mcp", {
    description: "Show MCP server status and registered tools",
    handler: async (_args: any, _ctx: any) => {
      const { handleMcpCommand } = await import('../commands/mcp_command.js');
      await handleMcpCommand(extension.getManager());
    },
  });

  return extension;
}
