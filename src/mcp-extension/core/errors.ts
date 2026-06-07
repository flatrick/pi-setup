export enum MCPErrorType {
  ConfigurationError = 'ConfigurationError',
  TransportError = 'TransportError',
  InitializationError = 'InitializationError',
  RequestError = 'RequestError',
  AuthError = 'AuthError',
  PolicyBlocked = 'PolicyBlocked',
}

export interface MCPError {
  type: MCPErrorType;
  message: string;
  code?: number;
  serverId?: string;
  details?: any;
}

/**
 * Helper to notify the user via ctx.ui.notify when an error occurs.
 * This follows the requirement: "Connection failures or initialization errors 
 * SHALL be surfaced via ctx.ui.notify".
 */
export function notifyMCPError(ctx: any, error: MCPError) {
  if (ctx && ctx.ui && typeof ctx.ui.notify === 'function') {
    ctx.ui.notify(`MCP Error [${error.type}] on ${error.serverId || 'unknown'}: ${error.message}`);
  } else {
    console.error(`MCP Error [${error.type}] on ${error.serverId || 'unknown'}: ${error.message}`, error.details);
  }
}
