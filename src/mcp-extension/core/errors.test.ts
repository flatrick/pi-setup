import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPError, MCPErrorType, notifyMCPError } from './errors.js';

describe('MCPError', () => {
  it('is an instance of Error', () => {
    const err = new MCPError(MCPErrorType.ConfigurationError, 'bad config');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(MCPError);
  });

  it('sets name, type, and message', () => {
    const err = new MCPError(MCPErrorType.TransportError, 'connection refused');
    expect(err.name).toBe('MCPError');
    expect(err.type).toBe(MCPErrorType.TransportError);
    expect(err.message).toBe('connection refused');
  });
});

describe('notifyMCPError', () => {
  it('calls ctx.ui.notify when available', () => {
    const notify = vi.fn();
    const ctx = { ui: { notify } };
    const err = new MCPError(MCPErrorType.RequestError, 'tool failed');
    notifyMCPError(ctx, err);
    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0][0]).toContain('tool failed');
  });

  it('falls back to console.error when ctx has no ui', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new MCPError(MCPErrorType.RequestError, 'tool failed');
    notifyMCPError({}, err);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
