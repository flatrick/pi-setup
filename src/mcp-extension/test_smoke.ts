import { MCPManager } from './core/mcp_manager.js';
import { notifyMCPError, MCPError, MCPErrorType } from './core/errors.js';

/**
 * Simple smoke test for the MCP Extension logic.
 */
async function runSmokeTest() {
  const manager = new MCPManager();
  
  console.log("--- Starting MCP Extension Smoke Test ---");
  
  try {
    // 1. Initialize Manager (Simulates onSessionStart)
    console.log("Initializing...");
    await manager.initialize();
    
    // 2. Check Tools
    const tools = manager.getTools();
    console.log(`Registered Tools Count: ${Object.keys(tools).length}`);
    for (const [name, tool] of Object.entries(tools)) {
      console.log(`- ${name}`);
    }

    // 3. Shutdown (Simulates onSessionShutdown)
    console.log("\nShutting down...");
    await manager.shutdown();
    console.log("Shutdown complete.");
    
  } catch (err) {
    console.error("Smoke Test Failed:", err);
  }
}

runSmokeTest();
