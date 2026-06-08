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

    await new Promise<void>((resolve, reject) => {
      try {
        this.childProcess = spawn(command, args ?? [], {
          stdio: ['pipe', 'pipe', 'inherit'],
          env: { ...process.env, ...this.serverConfig.env },
        });
      } catch (err: any) {
        reject(new MCPError(MCPErrorType.InitializationError, `Failed to spawn process: ${err.message}`));
        return;
      }

      this.childProcess.stdout!.on('data', (data: Buffer) => {
        const { messages, remainder } = parseMessages(this.receiveBuffer, data.toString());
        this.receiveBuffer = remainder;
        for (const msg of messages) {
          this.emit('message', msg);
        }
      });

      const onSpawnError = (err: Error) => {
        notifyMCPError({}, new MCPError(MCPErrorType.TransportError, err.message));
        reject(new MCPError(MCPErrorType.InitializationError, `Failed to spawn process: ${err.message}`));
      };

      this.childProcess.once('error', onSpawnError);

      // Use 'spawn' event (Node ≥ 15) to confirm successful spawn, then
      // re-attach a non-rejecting error handler for post-spawn errors.
      this.childProcess.once('spawn', () => {
        this.childProcess!.removeListener('error', onSpawnError);
        this.childProcess!.on('error', (err: Error) => {
          notifyMCPError({}, new MCPError(MCPErrorType.TransportError, err.message));
          this.emit('error', err);
        });
        resolve();
      });

      this.childProcess.on('close', (code: number | null) => {
        this.emit('close', code);
      });
    });
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
