import { describe, it, expect } from 'vitest';
import { parseMessages } from './stdio_transport.js';

describe('parseMessages', () => {
  it('parses a single complete message', () => {
    const { messages, remainder } = parseMessages('', '{"id":1}\n');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ id: 1 });
    expect(remainder).toBe('');
  });

  it('accumulates a partial message as remainder', () => {
    const { messages, remainder } = parseMessages('', '{"id":1');
    expect(messages).toHaveLength(0);
    expect(remainder).toBe('{"id":1');
  });

  it('completes a message split across two chunks', () => {
    const first = parseMessages('', '{"id":1');
    const second = parseMessages(first.remainder, '}\n');
    expect(second.messages).toHaveLength(1);
    expect(second.messages[0]).toEqual({ id: 1 });
  });

  it('parses two messages in one chunk', () => {
    const { messages } = parseMessages('', '{"a":1}\n{"b":2}\n');
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ a: 1 });
    expect(messages[1]).toEqual({ b: 2 });
  });

  it('skips malformed JSON without throwing', () => {
    const { messages, remainder } = parseMessages('', 'not-json\n{"id":2}\n');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ id: 2 });
    expect(remainder).toBe('');
  });

  it('handles empty chunk with no prior buffer', () => {
    const { messages, remainder } = parseMessages('', '');
    expect(messages).toHaveLength(0);
    expect(remainder).toBe('');
  });
});
