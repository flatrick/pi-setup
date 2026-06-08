export type MCPConfig = {
  mcpServers: Record<string, MCPServerConfig>;
};

export interface MCPServerConfig {
  type: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  policy?: SecurityPolicy;
}

export interface SecurityPolicy {
  global_validator?: string; // Path to a script for every call to this server
  tool_validators?: Record<string, string>; // Map of tool names to specific script paths
}

export type EnvVarSource = 'config' | '.env' | 'process.env';

export interface ResolvedEnvVar {
  value: string;
  source: EnvVarSource;
}

export interface MCPConfigResolved {
  servers: Record<string, {
    config: MCPServerConfig;
    resolvedEnv: Record<string, ResolvedEnvVar>;
    status: ServerStatus;
    tools?: ToolDefinition[];
  }>;
}

export enum ServerStatus {
  Initializing = 'Initializing',
  Connected = 'Connected',
  Disconnected = 'Disconnected',
  Error = 'Error',
}

export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>; // Simplified for now
}
