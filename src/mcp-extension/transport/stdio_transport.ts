import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { MCPError, MCPErrorType } from '../core/errors.js';
import { notifyMCPError } from '../core/errors.js';

/**
 * Manages a child process for an MCP server using the stdio transport.
 * Handles communication via stdin and stdout streams.
 */
export class StdioTransport extends EventEmitter {
  private childProcess: ChildProcess | null = null;
  private inputStream?: BufferWriteStream;
  private outputStream!: BufferReadStream;
  private inputBuffer: string = '';
  private outputBuffer: string = '';

  constructor(private serverConfig: any) {
    super();
  }

  /**
   * Starts the MCP server process.
   */
  async connect(): Promise<void> {
    const { command, args } = this.serverConfig;
    if (!command) {
      throw new MCPError(MCPErrorType.ConfigurationError, "No command specified for stdio transport.");
    }

    try {
      this.childProcess = spawn(command, args || [], {
        stdio: ['pipe', 'pipe', 'inherit'],
        env: this.serverConfig.env, // Resolved env vars
      });

      if (!this.childProcess) {
        throw new Error("Failed to spawn child process.");
      }

      this.outputStream = this.childProcess.stdout;
      this.inputStream = this.childProcess.stdin;

      // Handle stdout messages
      this.outputStream.on('data', (data: Buffer) => {
        const chunk = data.toString();
        this._processBuffer(this.outputBuffer, chunk, 'message');
      });

      // Handle stdin messages (if any are sent back from the server for some reason)
      this.inputStream?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        this._processBuffer(this.inputBuffer, chunk, 'input');
      });

      this.childProcess.on('error', (err) => {
        console.error(`StdioTransport Error: ${err.message}`);
        this.emit('error', err);
      });

      this.childProcess.on('close', (code) => {
        this.emit('close', code);
      });

    } catch (err) {
      notifyMCPError({}, new MCPError(MCPErrorType.InitializationError, `Failed to connect to ${this.serverConfig.type}: ${err.message}`));
    }
  }

  /**
   * Internal method to handle buffering and framing of JSON messages.
   */
  private _processBuffer(buffer: string, chunk: string, type: 'message' | 'input') {
    const newBuffer = buffer + chunk;
    let boundary = newBuffer.indexOf('\n');
    
    while (boundary !== -1) {
      const message = newBuffer.slice(0, boundary).trim();
      if (message) {
        try {
          const parsed = JSON.parse(message);
          this.emit(type, parsed);
        } catch (e) {
          console.error(`Failed to parse MCP ${type} message: ${message}`);
        }
      }
      newBuffer = newBuffer.slice(boundary + 1);
      boundary = newBuffer.indexOf('\n');
    }

    if (type === 'message') {
      this.outputBuffer = newBuffer;
    } else {
      this.inputBuffer = newBuffer;
    }
  }

  /**
   * Sends a message to the MCP server via stdin.
   */
  async send(message: any): Promise<void> {
    if (!this.inputStream) {
      throw new Error("Transport is not connected.");
    }
    this.inputStream.write(JSON.stringify(message) + '\n');
  }

  /**
   * Gracefully shuts down the child process.
   */
  async disconnect(): Promise<void> {
    if (this.childProcess) {
      this.childProcess.kill('SIGTERM');
    }
  }
}

// Helper types for missing Node.js definitions in some environments
type ChildProcess = import('node:child_process').ChildProcess;
type BufferWriteStream = import('node:stream').Writable;
type BufferReadStream = import('node:stream').Readable;
