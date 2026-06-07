export enum MCPErrorType {
  ConfigurationError = 'ConfigurationError',
  TransportError = 'TransportError',
  InitializationError = 'InitializationError',
  RequestError = 'RequestError',
  AuthError = 'AuthError',
  PolicyBlocked = 'PolicyBlocked',
}

export class MCPError extends Error {
  readonly type: MCPErrorType;
  code?: number;
  serverId?: string;
  details?: unknown;

  constructor(type: MCPErrorType, message: string) {
    super(message);
    this.name = 'MCPError';
    this.type = type;
  }
}

export function notifyMCPError(ctx: any, error: MCPError) {
  if (ctx && ctx.ui && typeof ctx.ui.notify === 'function') {
    ctx.ui.notify(`MCP Error [${error.type}] on ${error.serverId ?? 'unknown'}: ${error.message}`);
  } else {
    console.error(`MCP Error [${error.type}] on ${error.serverId ?? 'unknown'}: ${error.message}`, error.details);
  }
}
