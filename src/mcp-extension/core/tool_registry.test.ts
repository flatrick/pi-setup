import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from './tool_registry.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('registers tools with server prefix', () => {
    registry.register('github', [{ name: 'create_issue', description: 'Creates an issue' }]);
    expect(registry.hasTool('github:create_issue')).toBe(true);
  });

  it('stored tool retains original fields plus prefixed name', () => {
    registry.register('github', [{ name: 'create_issue', description: 'Creates an issue' }]);
    const tools = registry.getAllTools();
    expect(tools['github:create_issue'].name).toBe('github:create_issue');
    expect(tools['github:create_issue'].description).toBe('Creates an issue');
  });

  it('two servers with the same base tool name do not collide', () => {
    registry.register('github', [{ name: 'create_issue' }]);
    registry.register('gitlab', [{ name: 'create_issue' }]);
    const tools = registry.getAllTools();
    expect(tools['github:create_issue']).toBeDefined();
    expect(tools['gitlab:create_issue']).toBeDefined();
    expect(Object.keys(tools)).toHaveLength(2);
  });

  it('returns empty object when nothing is registered', () => {
    expect(registry.getAllTools()).toEqual({});
  });

  it('hasTool returns false for an unknown tool', () => {
    expect(registry.hasTool('unknown:tool')).toBe(false);
  });

  it('ignores non-array input gracefully', () => {
    registry.register('bad', null as any);
    expect(registry.getAllTools()).toEqual({});
  });
});
