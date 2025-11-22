/**
 * Data Binding System Tests
 *
 * Tests for the data binding system (Task 51)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  dataSourceRegistry,
  createStoreSource,
  createStaticSource,
  createComputedSource,
  createBinding,
  resolveBinding,
  getValueByPath,
} from '../dataBinding';
import type { DataTransform } from '../dataBinding';

describe('Data Source Registry', () => {
  beforeEach(() => {
    // Clear registry before each test
    dataSourceRegistry.clear();
  });

  it('should register and retrieve a static source', () => {
    const source = createStaticSource('test.static', 'Test Static', 42);
    dataSourceRegistry.registerSource(source);

    const retrieved = dataSourceRegistry.getSource('test.static');
    expect(retrieved).toEqual(source);
  });

  it('should register and retrieve a store source', () => {
    const source = createStoreSource('test.store', 'Test Store', 'workspace', 'isLocked');
    dataSourceRegistry.registerSource(source);

    const retrieved = dataSourceRegistry.getSource('test.store');
    expect(retrieved).toEqual(source);
  });

  it('should register and retrieve a computed source', () => {
    const source = createComputedSource('test.computed', 'Test Computed', ['dep1', 'dep2'], 'sum');
    dataSourceRegistry.registerSource(source);

    const retrieved = dataSourceRegistry.getSource('test.computed');
    expect(retrieved).toEqual(source);
  });

  it('should list all registered sources', () => {
    dataSourceRegistry.registerSource(createStaticSource('s1', 'Source 1', 1));
    dataSourceRegistry.registerSource(createStaticSource('s2', 'Source 2', 2));
    dataSourceRegistry.registerSource(createStaticSource('s3', 'Source 3', 3));

    const sources = dataSourceRegistry.getAllSources();
    expect(sources).toHaveLength(3);
  });

  it('should filter sources by type', () => {
    dataSourceRegistry.registerSource(createStaticSource('s1', 'Static 1', 1));
    dataSourceRegistry.registerSource(createStoreSource('s2', 'Store 1', 'workspace', 'path'));
    dataSourceRegistry.registerSource(createStaticSource('s3', 'Static 2', 2));

    const staticSources = dataSourceRegistry.getSourcesByType('static');
    expect(staticSources).toHaveLength(2);

    const storeSources = dataSourceRegistry.getSourcesByType('store');
    expect(storeSources).toHaveLength(1);
  });

  it('should search sources by query', () => {
    dataSourceRegistry.registerSource(
      createStaticSource('workspace.foo', 'Workspace Foo', 1, {
        tags: ['workspace', 'test'],
      })
    );
    dataSourceRegistry.registerSource(
      createStaticSource('game.bar', 'Game Bar', 2, {
        tags: ['game', 'test'],
      })
    );

    const results = dataSourceRegistry.searchSources('workspace');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('workspace.foo');
  });

  it('should validate source definitions', () => {
    // Missing storeId for store source
    expect(() => {
      dataSourceRegistry.registerSource({
        id: 'invalid',
        type: 'store',
        label: 'Invalid',
        // storeId is missing
      } as any);
    }).toThrow();

    // Missing dependencies for computed source
    expect(() => {
      dataSourceRegistry.registerSource({
        id: 'invalid',
        type: 'computed',
        label: 'Invalid',
        transformId: 'sum',
        // dependencies is missing
      } as any);
    }).toThrow();
  });
});

describe('Transform Registry', () => {
  beforeEach(() => {
    dataSourceRegistry.clear();
  });

  it('should register and retrieve a transform', () => {
    const transform: DataTransform = {
      id: 'double',
      label: 'Double',
      apply: (x: unknown) => Number(x) * 2,
    };

    dataSourceRegistry.registerTransform(transform);

    const retrieved = dataSourceRegistry.getTransform('double');
    expect(retrieved).toBeDefined();
    expect(retrieved!.apply(5)).toBe(10);
  });

  it('should list all registered transforms', () => {
    dataSourceRegistry.registerTransform({
      id: 't1',
      label: 'Transform 1',
      apply: (x) => x,
    });
    dataSourceRegistry.registerTransform({
      id: 't2',
      label: 'Transform 2',
      apply: (x) => x,
    });

    const transforms = dataSourceRegistry.getAllTransforms();
    expect(transforms).toHaveLength(2);
  });

  it('should validate transform has apply function', () => {
    expect(() => {
      dataSourceRegistry.registerTransform({
        id: 'invalid',
        label: 'Invalid',
        // apply is missing
      } as any);
    }).toThrow();
  });
});

describe('Path Access', () => {
  it('should access nested properties', () => {
    const obj = {
      a: {
        b: {
          c: 42,
        },
      },
    };

    expect(getValueByPath(obj, 'a.b.c')).toBe(42);
    expect(getValueByPath(obj, 'a.b')).toEqual({ c: 42 });
    expect(getValueByPath(obj, 'a')).toEqual({ b: { c: 42 } });
  });

  it('should handle missing paths gracefully', () => {
    const obj = { a: { b: 1 } };

    expect(getValueByPath(obj, 'a.c')).toBeUndefined();
    expect(getValueByPath(obj, 'x.y.z')).toBeUndefined();
  });

  it('should handle null/undefined objects', () => {
    expect(getValueByPath(null, 'a.b')).toBeUndefined();
    expect(getValueByPath(undefined, 'a.b')).toBeUndefined();
  });

  it('should handle empty path', () => {
    const obj = { a: 1 };
    expect(getValueByPath(obj, '')).toEqual(obj);
  });

  it('should access array properties', () => {
    const obj = {
      items: [1, 2, 3],
    };

    expect(getValueByPath(obj, 'items.length')).toBe(3);
    expect(getValueByPath(obj, 'items.0')).toBe(1);
  });
});

describe('Data Resolution', () => {
  beforeEach(() => {
    dataSourceRegistry.clear();
  });

  it('should resolve a static source', () => {
    dataSourceRegistry.registerSource(createStaticSource('static.value', 'Static Value', 123));

    const binding = createBinding('b1', 'static.value', 'value');
    const resolved = resolveBinding(binding);

    expect(resolved.value).toBe(123);
    expect(resolved.error).toBeUndefined();
  });

  it('should apply transforms to bindings', () => {
    dataSourceRegistry.registerSource(createStaticSource('static.number', 'Static Number', 5));
    dataSourceRegistry.registerTransform({
      id: 'double',
      label: 'Double',
      apply: (x: unknown) => Number(x) * 2,
    });

    const binding = createBinding('b1', 'static.number', 'value', {
      transformId: 'double',
    });
    const resolved = resolveBinding(binding);

    expect(resolved.value).toBe(10);
  });

  it('should use fallback value on error', () => {
    const binding = createBinding('b1', 'nonexistent', 'value', {
      fallbackValue: 'default',
    });
    const resolved = resolveBinding(binding);

    expect(resolved.value).toBe('default');
    expect(resolved.error).toBeDefined();
  });

  it('should resolve computed sources', () => {
    // Register dependencies
    dataSourceRegistry.registerSource(createStaticSource('num1', 'Number 1', 10));
    dataSourceRegistry.registerSource(createStaticSource('num2', 'Number 2', 20));

    // Register transform
    dataSourceRegistry.registerTransform({
      id: 'sum',
      label: 'Sum',
      apply: (input: unknown) => {
        if (!Array.isArray(input)) return 0;
        return input.reduce((sum, val) => sum + Number(val), 0);
      },
    });

    // Register computed source
    dataSourceRegistry.registerSource(
      createComputedSource('total', 'Total', ['num1', 'num2'], 'sum')
    );

    // Resolve it
    const binding = createBinding('b1', 'total', 'total');
    const resolved = resolveBinding(binding);

    expect(resolved.value).toBe(30);
  });

  it('should detect circular dependencies', () => {
    // This is a simplified test - full circular dependency detection
    // would require more complex setup
    dataSourceRegistry.registerSource(
      createComputedSource('circular', 'Circular', ['circular'], 'sum')
    );
    dataSourceRegistry.registerTransform({
      id: 'sum',
      label: 'Sum',
      apply: (x) => x,
    });

    const binding = createBinding('b1', 'circular', 'value', {
      fallbackValue: 0,
    });
    const resolved = resolveBinding(binding);

    // Should use fallback due to error
    expect(resolved.value).toBe(0);
    expect(resolved.error).toBeDefined();
  });
});

describe('Data Binding Creation', () => {
  it('should create a basic binding', () => {
    const binding = createBinding('b1', 'source-id', 'targetProp');

    expect(binding).toEqual({
      id: 'b1',
      sourceId: 'source-id',
      targetProp: 'targetProp',
      transformId: undefined,
      fallbackValue: undefined,
    });
  });

  it('should create a binding with options', () => {
    const binding = createBinding('b1', 'source-id', 'targetProp', {
      transformId: 'to-string',
      fallbackValue: 'default',
    });

    expect(binding).toEqual({
      id: 'b1',
      sourceId: 'source-id',
      targetProp: 'targetProp',
      transformId: 'to-string',
      fallbackValue: 'default',
    });
  });
});

describe('Registry Statistics', () => {
  beforeEach(() => {
    dataSourceRegistry.clear();
  });

  it('should provide statistics', () => {
    dataSourceRegistry.registerSource(createStaticSource('s1', 'Static 1', 1));
    dataSourceRegistry.registerSource(createStaticSource('s2', 'Static 2', 2));
    dataSourceRegistry.registerSource(createStoreSource('st1', 'Store 1', 'workspace', 'path'));
    dataSourceRegistry.registerTransform({
      id: 't1',
      label: 'Transform 1',
      apply: (x) => x,
    });

    const stats = dataSourceRegistry.getStats();

    expect(stats.sources.total).toBe(3);
    expect(stats.sources.byType.static).toBe(2);
    expect(stats.sources.byType.store).toBe(1);
    expect(stats.transforms.total).toBe(1);
  });
});
