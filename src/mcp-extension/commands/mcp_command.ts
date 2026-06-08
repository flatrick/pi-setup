import { MCPManager } from '../core/mcp_manager.js';

/**
 * Implementation for the /mcp command.
 * Displays active servers, status, and registered tools.
 */
export async function handleMcpCommand(manager: MCPManager) {
  console.log("--- MCP Extension Status ---");

  const configs = await manager.getServerConfigs();

  for (const [serverId, info] of Object.entries(configs)) {
    console.log(`Server: ${serverId}`);
  }

  const allTools = manager.getTools();
  console.log("\nRegistered Tools:");
  if (Object.keys(allTools).length === 0) {
    console.log("  No tools registered.");
  } else {
    for (const name of Object.keys(allTools)) {
      console.log(`- ${name}`);
    }
  }
}
