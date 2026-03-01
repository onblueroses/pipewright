import { describe, it, expect } from 'vitest';
import { ExecutionContext, createExecutionContext } from '../../src/core/context.js';

describe('ExecutionContext', () => {
  it('stores and retrieves a flat variable', () => {
    const ctx = createExecutionContext();
    ctx.set('count', 42);
    expect(ctx.get('count')).toBe(42);
  });

  it('stores initial vars from constructor', () => {
    const ctx = createExecutionContext({}, { myKey: 'hello' });
    expect(ctx.get('myKey')).toBe('hello');
  });

  it('setNodeOutput stores under step ID key', () => {
    const ctx = createExecutionContext();
    ctx.setNodeOutput('fetch', { posts: [], count: 0 });
    expect(ctx.get('fetch')).toEqual({ posts: [], count: 0 });
  });

  it('setNodeOutput does not merge flat keys into root vars', () => {
    const ctx = createExecutionContext();
    ctx.setNodeOutput('fetch', { posts: [1, 2], count: 2 });
    expect(ctx.get('count')).toBeUndefined();
    expect(ctx.get('posts')).toBeUndefined();
    expect(ctx.get('fetch.count')).toBe(2);
    expect(ctx.get('fetch.posts')).toEqual([1, 2]);
  });

  it('get supports dot-notation path', () => {
    const ctx = createExecutionContext();
    ctx.setNodeOutput('analyze', { relevanceScore: 0.9, tags: ['web', 'api'] });
    expect(ctx.get('analyze.relevanceScore')).toBe(0.9);
    expect(ctx.get('analyze.tags')).toEqual(['web', 'api']);
  });

  it('get returns undefined for missing path', () => {
    const ctx = createExecutionContext();
    expect(ctx.get('nonexistent')).toBeUndefined();
    expect(ctx.get('a.b.c')).toBeUndefined();
  });

  it('interpolate replaces {{path}} with context value', () => {
    const ctx = createExecutionContext();
    ctx.set('name', 'Alice');
    expect(ctx.interpolate('Hello, {{name}}!')).toBe('Hello, Alice!');
  });

  it('interpolate handles dot-notation paths', () => {
    const ctx = createExecutionContext();
    ctx.setNodeOutput('fetch', { count: 7 });
    expect(ctx.interpolate('Got {{fetch.count}} items')).toBe('Got 7 items');
  });

  it('interpolate leaves unknown paths unchanged', () => {
    const ctx = createExecutionContext();
    expect(ctx.interpolate('Hello {{unknown}}!')).toBe('Hello {{unknown}}!');
  });

  it('interpolate handles multiple replacements', () => {
    const ctx = createExecutionContext();
    ctx.set('a', 'foo');
    ctx.set('b', 'bar');
    expect(ctx.interpolate('{{a}} and {{b}}')).toBe('foo and bar');
  });

  it('interpolateObject recursively interpolates string values', () => {
    const ctx = createExecutionContext();
    ctx.set('category', 'technology');
    ctx.setNodeOutput('fetch', { count: 5 });
    const result = ctx.interpolateObject({
      label: 'Fetching {{category}}',
      nested: { info: '{{fetch.count}} items' },
      num: 42,
    });
    expect(result.label).toBe('Fetching technology');
    expect((result.nested as Record<string, string>).info).toBe('5 items');
    expect(result.num).toBe(42);
  });

  it('snapshot returns copy of current vars', () => {
    const ctx = createExecutionContext();
    ctx.set('x', 1);
    const snap = ctx.snapshot();
    ctx.set('x', 2);
    expect(snap.x).toBe(1);
    expect(ctx.get('x')).toBe(2);
  });

  it('services are accessible via context', () => {
    const fakeService = { doThing: () => 'result' };
    const ctx = createExecutionContext({ myService: fakeService });
    expect(ctx.services.myService).toBe(fakeService);
  });

  it('interpolateObject handles arrays with template strings', () => {
    const ctx = createExecutionContext();
    ctx.set('tag1', 'web');
    ctx.set('tag2', 'api');
    const result = ctx.interpolateObject({
      tags: ['{{tag1}}', '{{tag2}}', 'static'],
    });
    expect(result.tags).toEqual(['web', 'api', 'static']);
  });

  it('interpolateObject handles nested arrays in objects', () => {
    const ctx = createExecutionContext();
    ctx.set('name', 'Alice');
    const result = ctx.interpolateObject({
      users: [{ label: '{{name}}' }],
      plain: 'hello',
    });
    expect((result.users as unknown[])[0]).toEqual({ label: 'Alice' });
    expect(result.plain).toBe('hello');
  });

  it('interpolateObject preserves non-string array items', () => {
    const ctx = createExecutionContext();
    const result = ctx.interpolateObject({
      mixed: [42, true, null, '{{missing}}'],
    });
    expect(result.mixed).toEqual([42, true, null, '{{missing}}']);
  });

  describe('single-var interpolation', () => {
    it('returns actual array for single {{ref}}', () => {
      const ctx = createExecutionContext();
      const items = [{ id: 1 }, { id: 2 }];
      ctx.set('items', items);
      expect(ctx.interpolate('{{items}}')).toEqual(items);
    });

    it('returns actual object for single {{ref}}', () => {
      const ctx = createExecutionContext();
      ctx.set('config', { debug: true, port: 3000 });
      expect(ctx.interpolate('{{config}}')).toEqual({ debug: true, port: 3000 });
    });

    it('returns actual number for single {{ref}}', () => {
      const ctx = createExecutionContext();
      ctx.set('count', 42);
      expect(ctx.interpolate('{{count}}')).toBe(42);
    });

    it('returns actual boolean for single {{ref}}', () => {
      const ctx = createExecutionContext();
      ctx.set('flag', false);
      expect(ctx.interpolate('{{flag}}')).toBe(false);
    });

    it('returns template string when ref is missing', () => {
      const ctx = createExecutionContext();
      expect(ctx.interpolate('{{missing}}')).toBe('{{missing}}');
    });

    it('returns raw null for single {{ref}} resolved to null', () => {
      const ctx = createExecutionContext();
      ctx.set('empty', null);
      expect(ctx.interpolate('{{empty}}')).toBeNull();
    });

    it('leaves {{ref}} intact in multi-var when resolved to null', () => {
      const ctx = createExecutionContext();
      ctx.set('empty', null);
      ctx.set('name', 'Alice');
      expect(ctx.interpolate('{{empty}} and {{name}}')).toBe('{{empty}} and Alice');
    });

    it('still returns string for multi-var templates', () => {
      const ctx = createExecutionContext();
      ctx.set('a', [1, 2]);
      ctx.set('b', 'hello');
      const result = ctx.interpolate('{{a}} and {{b}}');
      expect(typeof result).toBe('string');
    });

    it('works through interpolateObject for data flow', () => {
      const ctx = createExecutionContext();
      ctx.setNodeOutput('fetch', { items: [{ id: 1 }, { id: 2 }], count: 2 });
      const result = ctx.interpolateObject({
        items: '{{fetch.items}}',
        label: 'Got {{fetch.count}} items',
      });
      expect(result.items).toEqual([{ id: 1 }, { id: 2 }]);
      expect(result.label).toBe('Got 2 items');
    });
  });

  describe('array index access', () => {
    it('resolves items[0]', () => {
      const ctx = createExecutionContext();
      ctx.set('items', ['a', 'b', 'c']);
      expect(ctx.get('items[0]')).toBe('a');
      expect(ctx.get('items[2]')).toBe('c');
    });

    it('resolves nested path after array index', () => {
      const ctx = createExecutionContext();
      ctx.set('entries', [{ title: 'Hello' }, { title: 'World' }]);
      expect(ctx.get('entries[0].title')).toBe('Hello');
      expect(ctx.get('entries[1].title')).toBe('World');
    });

    it('returns undefined for out-of-bounds index', () => {
      const ctx = createExecutionContext();
      ctx.set('items', [1, 2]);
      expect(ctx.get('items[5]')).toBeUndefined();
    });

    it('returns undefined when indexing non-array', () => {
      const ctx = createExecutionContext();
      ctx.set('name', 'Alice');
      expect(ctx.get('name[0]')).toBeUndefined();
    });

    it('works with node output paths', () => {
      const ctx = createExecutionContext();
      ctx.setNodeOutput('fetch', { entries: [{ id: 'abc' }, { id: 'def' }] });
      expect(ctx.get('fetch.entries[0].id')).toBe('abc');
    });

    it('works in interpolation templates', () => {
      const ctx = createExecutionContext();
      ctx.set('tags', ['web', 'api', 'data']);
      expect(ctx.interpolate('First: {{tags[0]}}')).toBe('First: web');
    });
  });

  describe('multi-var formatting', () => {
    it('formats arrays as comma-joined in multi-var', () => {
      const ctx = createExecutionContext();
      ctx.set('tags', ['web', 'api', 'data']);
      expect(ctx.interpolate('Tags: {{tags}}')).toBe('Tags: web, api, data');
    });

    it('formats objects as JSON in multi-var', () => {
      const ctx = createExecutionContext();
      ctx.set('config', { a: 1 });
      expect(ctx.interpolate('Config: {{config}}')).toBe('Config: {"a":1}');
    });

    it('formats numbers normally in multi-var', () => {
      const ctx = createExecutionContext();
      ctx.set('count', 5);
      expect(ctx.interpolate('Found {{count}} items')).toBe('Found 5 items');
    });
  });

  describe('fromJSON', () => {
    it('reconstructs context from snapshot', () => {
      const original = createExecutionContext();
      original.set('x', 42);
      original.setNodeOutput('fetch', { count: 5 });
      const snap = original.snapshot();

      const restored = ExecutionContext.fromJSON(snap);
      expect(restored.get('x')).toBe(42);
      expect(restored.get('fetch.count')).toBe(5);
    });

    it('accepts optional services', () => {
      const svc = { myService: { run: () => 'ok' } };
      const ctx = ExecutionContext.fromJSON({ key: 'val' }, svc);
      expect(ctx.services.myService).toBeDefined();
      expect(ctx.get('key')).toBe('val');
    });
  });
});
