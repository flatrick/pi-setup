import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MCPConfig, ResolvedEnvVar, EnvVarSource } from '../types/config.js';

const GLOBAL_CONFIG_PATH = join(process.env.HOME || '', '.pi', 'agent', '.mcp.json');

export class ConfigResolver {
  /**
   * Resolves the MCP configuration by checking the workspace local file first,
   * then falling back to the global configuration file.
   * 
   * @param cwd The current working directory of the process.
   * @returns A promise resolving to an object containing the merged configuration and resolved env vars.
   */
  async resolveConfig(cwd: string): Promise<{ config: MCPConfig; resolvedEnvVars: Record<string, any> }> {
    const localConfigPath = join(cwd, '.mcp.json');
    
    let localConfig: MCPConfig | null = null;
    let globalConfig: MCPConfig | null = null;

    try {
      if (readFileSync(localConfigPath).toString()) {
        localConfig = JSON.parse(readFileSync(localConfigPath, 'utf8'));
      }
    } catch (e) {
      // File doesn't exist or is invalid, ignore
    }

    try {
      if (readFileSync(GLOBAL_CONFIG_PATH).toString()) {
        globalConfig = JSON.parse(readFileSync(GLOBAL_CONFIG_PATH, 'utf8'));
      }
    } catch (e) {
      // File doesn't exist or is invalid, ignore
    }

    const config = localConfig || globalConfig || { mcpServers: {} };
    const resolvedEnvVars: Record<string, any> = {};

    for (const [serverId, serverConfig] of Object.entries(config.mcpServers)) {
      // This is a simplified way to aggregate all env vars for the UI
      // In a real implementation we'd want a per-server map
      if (!resolvedEnvVars[serverId]) {
        resolvedEnvVars[serverId] = {};
      }
      
      // We can combine the logic from resolveEnv here or call it separately
      // Let's call it for now to keep things DRY
      const serverEnv = await this.resolveEnv(serverConfig, cwd);
      resolvedEnvVars[serverId] = serverEnv;
    }

    return { config, resolvedEnvVars };
  }

  /**
   * Resolves environment variables for a specific server configuration.
   * 3-tier precedence: config env block > .env file > process.env
   */
  async resolveEnv(serverConfig: any, cwd: string): Promise<Record<string, ResolvedEnvVar>> {
    const resolvedEnv: Record<string, ResolvedEnvVar> = {};

    // 1. Process environment (lowest precedence)
    for (const [key, value] of Object.entries(process.env)) {
      resolvedEnv[key] = { value: String(value), source: 'process.env' };
    }

    // 2. .env file (middle precedence)
    try {
      const envPath = join(cwd, '.env');
      if (readFileSync(envPath).toString()) {
        const envContent = readFileSync(envPath, 'utf8');
        envContent.split(/\r?\n/).forEach(line => {
          if (line.includes('=') && !line.startsWith('#')) {
            const [key, ...valParts] = line.split('=');
            const val = valParts.join('=').trim();
            const cleanKey = key.trim();
            resolvedEnv[cleanKey] = { value: val, source: '.env' };
          }
        });
      }
    } catch (e) {
      // .env file doesn't exist or is invalid, ignore
    }

    // 3. Config env block (highest precedence)
    const serverEnv = serverConfig.env || {};
    for (const [key, value] of Object.entries(serverEnv)) {
      resolvedEnv[key] = { value: String(value), source: 'config' };
    }

    return resolvedEnv;
  }
}
