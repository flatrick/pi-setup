import { MCPError, MCPErrorType } from './errors.js';

/**
 * A simple registry to store and manage all discovered tools across different MCP servers.
 * Each tool is registered with a prefix derived from the server name to avoid collisions.
 */
export class ToolRegistry {
  private tools: Record<string, any> = {};

  /**
   * Registers a list of tools for a specific server.
   * 
   * @param serverId The unique identifier for the server (e.g., 'github')
   * @param rawTools The array of tool objects returned by the MCP server's `tools/list` method.
   */
  register(serverId: string, rawTools: any[]): void {
    if (!rawTools || !Array.isArray(rawTools)) {
      return;
    }

    for (const tool of rawTools) {
      // Implement naming convention `${serverId}:${tool_name}` for registry registration.
      const prefixedName = `${serverId}:${tool.name}`;
      this.tools[prefixedName] = {
        ...tool,
        name: prefixedName // Ensure the registry key and internal name are consistent
      };
    }
  }

  /**
   * Retrieves all registered tools.
   */
  getAllTools(): Record<string, any> {
    return this.tools;
  }

  /**
   * Checks if a tool exists by its prefixed name.
   */
  hasTool(toolName: string): boolean {
    return !!this.tools[toolName];
  }

  /**
   * Clears all registered tools.
   */
  clear(): void {
    this.tools = {};
  }
}
