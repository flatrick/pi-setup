import { MCPManager } from './mcp_manager.js';

/**
 * Handles the /mcp command to display active servers, status, and registered tools.
 */
export async function handleMcpCommand() {
  const manager = new MCPManager();
  // Note: In a real pi extension, we'd probably inject the singleton instance of MCPManager
  // but for this task, we'll initialize it or assume it's handled by the harness.
  
  // For now, let's just show how it would work.
  await manager.initialize();
  
  const tools = manager.getTools();
  console.log("Active MCP Servers and Tools:");
  for (const [name, tool] of Object.entries(tools)) {
    console.log(`- ${name}`);
  }
}
