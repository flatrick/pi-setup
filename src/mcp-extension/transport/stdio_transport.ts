import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { MCPError, MCPErrorType, notifyMCPError } from '../core/errors.js';

export function parseMessages(buffer: string, chunk: string): { messages: unknown[]; remainder: string } {
  const messages: unknown[] = [];
  let remainder = buffer + chunk;
  let boundary = remainder.indexOf('\n');

  while (boundary !== -1) {
    const line = remainder.slice(0, boundary).trim();
    if (line) {
      try {
        messages.push(JSON.parse(line));
      } catch {
        console.error(`Failed to parse MCP message: ${line}`);
      }
    }
    remainder = remainder.slice(boundary + 1);
    boundary = remainder.indexOf('\n');
  }

  return { messages, remainder };
}

type ChildProcess = import('node:child_process').ChildProcess;

export class StdioTransport extends EventEmitter {
  private childProcess: ChildProcess | null = null;
  private receiveBuffer = '';

  constructor(private serverConfig: any) {
    super();
  }

  async connect(): Promise<void> {
    const { command, args } = this.serverConfig;
    if (!command) {
      throw new MCPError(MCPErrorType.ConfigurationError, "No command specified for stdio transport.");
    }

    try {
      this.childProcess = spawn(command, args ?? [], {
        stdio: ['pipe', 'pipe', 'inherit'],
        env: { ...process.env, ...this.serverConfig.env },
      });

      this.childProcess.stdout!.on('data', (data: Buffer) => {
        const { messages, remainder } = parseMessages(this.receiveBuffer, data.toString());
        this.receiveBuffer = remainder;
        for (const msg of messages) {
          this.emit('message', msg);
        }
      });

      this.childProcess.on('error', (err: Error) => {
        notifyMCPError({}, new MCPError(MCPErrorType.TransportError, err.message));
        this.emit('error', err);
      });

      this.childProcess.on('close', (code: number | null) => {
        this.emit('close', code);
      });
    } catch (err: any) {
      throw new MCPError(MCPErrorType.InitializationError, `Failed to spawn process: ${err.message}`);
    }
  }

  async send(message: unknown): Promise<void> {
    if (!this.childProcess?.stdin) {
      throw new MCPError(MCPErrorType.TransportError, "Transport is not connected.");
    }
    this.childProcess.stdin.write(JSON.stringify(message) + '\n');
  }

  async disconnect(): Promise<void> {
    if (this.childProcess) {
      this.childProcess.kill('SIGTERM');
      this.childProcess = null;
    }
  }
}
