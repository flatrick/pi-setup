import { MCPManager } from '../core/mcp_manager.js';

/**
 * Implementation for the /mcp command.
 * Displays active servers, status, and registered tools.
 */
export async function handleMcpCommand(manager: MCPManager) {
  console.log("--- MCP Extension Status ---");
  
  const configs = manager.getServerConfigs();
  
  for (const [serverId, info] of Object.entries(configs)) {
    console.log(`Server: ${serverId}`);
    console.log(`  Environment Variables:`);
    for (const [key, resolved] of Object.entries(info.envVars)) {
      console.log(`    ${key} = ${resolved.value} (Source: ${resolved.source})`);
    }
    
    // We'll need to get the client to see the status
    // Assuming we can find the client in manager... 
    // For now, let's just show tools from registry
  }

  console.log("\nRegistered Tools:");
  const allTools = manager.getTools();
  if (Object.keys(allTools).length === 0) {
    console.log("  No tools registered.");
  } else {
    for (const [name, tool] of Object.entries(allTools)) {
      console.log(`- ${name}`);
    }
  }
}
