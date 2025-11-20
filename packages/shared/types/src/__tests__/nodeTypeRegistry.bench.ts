/**
 * Benchmarks for NodeTypeRegistry performance
 *
 * Run with: npm run test:bench (or appropriate test runner)
 *
 * Measures:
 * - Lazy loading performance
 * - Preload performance
 * - Cache hit/miss performance
 * - Scope filtering performance
 */

import { NodeTypeRegistry, NodeTypeDefinition } from '../nodeTypeRegistry';

// ===== Test Data Setup =====

function createMockNodeType(id: string, hasLoader = false): NodeTypeDefinition {
  return {
    id,
    name: `Node ${id}`,
    description: `Test node type ${id}`,
    category: 'custom',
    scope: 'scene',
    defaultData: {},
    preloadPriority: Math.floor(Math.random() * 10),
    ...(hasLoader && {
      loader: async () => {
        // Simulate async load with delay
        await new Promise(resolve => setTimeout(resolve, 5));
        return {
          id,
          name: `Node ${id} (loaded)`,
          defaultData: { loaded: true },
        };
      },
    }),
  };
}

// ===== Benchmark Utilities =====

async function benchmark(name: string, fn: () => Promise<void>, iterations = 100) {
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < 10; i++) {
    await fn();
  }

  // Actual benchmark
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const median = times.sort((a, b) => a - b)[Math.floor(times.length / 2)];

  console.log(`\n${name}`);
  console.log(`  Avg: ${avg.toFixed(3)}ms`);
  console.log(`  Min: ${min.toFixed(3)}ms`);
  console.log(`  Max: ${max.toFixed(3)}ms`);
  console.log(`  Median: ${median.toFixed(3)}ms`);

  return { avg, min, max, median };
}

// ===== Benchmarks =====

async function benchmarkBasicOperations() {
  console.log('\n=== Basic Operations ===');

  const registry = new NodeTypeRegistry();

  // Register 100 types
  for (let i = 0; i < 100; i++) {
    registry.register(createMockNodeType(`type-${i}`));
  }

  await benchmark('Synchronous get (cache miss)', async () => {
    registry.clearCache();
    registry.getSync('type-50');
  });

  await benchmark('Synchronous get (cache hit)', async () => {
    registry.getSync('type-50'); // Already cached from previous access
  });

  await benchmark('Get all types', async () => {
    registry.getAll();
  });

  await benchmark('Get by category', async () => {
    registry.getByCategory('custom');
  });

  await benchmark('Get by scope', async () => {
    registry.getByScope('scene');
  });
}

async function benchmarkLazyLoading() {
  console.log('\n=== Lazy Loading ===');

  const registry = new NodeTypeRegistry();

  // Register 50 types with loaders
  for (let i = 0; i < 50; i++) {
    registry.register(createMockNodeType(`lazy-${i}`, true));
  }

  await benchmark('Async get (first load)', async () => {
    const id = `lazy-${Math.floor(Math.random() * 50)}`;
    await registry.get(id);
  }, 20); // Fewer iterations due to async delay

  await benchmark('Async get (cached)', async () => {
    await registry.get('lazy-0'); // Already loaded
  });
}

async function benchmarkPreloading() {
  console.log('\n=== Preloading ===');

  const registry = new NodeTypeRegistry();

  // Register 100 types with loaders and varying priorities
  for (let i = 0; i < 100; i++) {
    registry.register({
      id: `preload-${i}`,
      name: `Preload ${i}`,
      defaultData: {},
      loader: async () => ({
        id: `preload-${i}`,
        name: `Preload ${i} (loaded)`,
        defaultData: {},
      }),
      preloadPriority: i % 10, // 0-9 priority distribution
    });
  }

  const start = performance.now();
  await registry.preload(); // Preloads top 10 by priority
  const end = performance.now();

  console.log(`\nPreload top 10 (by priority): ${(end - start).toFixed(3)}ms`);

  const start2 = performance.now();
  await registry.preload(['preload-20', 'preload-21', 'preload-22']); // Specific IDs
  const end2 = performance.now();

  console.log(`Preload 3 specific IDs: ${(end2 - start2).toFixed(3)}ms`);
}

async function benchmarkCaching() {
  console.log('\n=== Caching Performance ===');

  const registry = new NodeTypeRegistry();

  // Register 200 types (exceeds cache size of 50)
  for (let i = 0; i < 200; i++) {
    registry.register(createMockNodeType(`cache-${i}`));
  }

  // Access first 50 to fill cache
  for (let i = 0; i < 50; i++) {
    registry.getSync(`cache-${i}`);
  }

  await benchmark('Cache hit (LRU head)', async () => {
    registry.getSync('cache-49'); // Most recently used
  });

  await benchmark('Cache hit (LRU tail)', async () => {
    registry.getSync('cache-0'); // Least recently used (might be evicted)
  });

  await benchmark('Cache miss (not in cache)', async () => {
    registry.getSync('cache-150'); // Never accessed before
  });

  const stats = registry.getCacheStats();
  console.log(`\nCache statistics: ${JSON.stringify(stats)}`);
}

async function benchmarkScopeFiltering() {
  console.log('\n=== Scope Filtering ===');

  const registry = new NodeTypeRegistry();

  // Register 100 types across different scopes
  for (let i = 0; i < 100; i++) {
    const scopes = ['scene', 'arc', 'world', 'custom'];
    registry.register({
      id: `scope-${i}`,
      name: `Scope ${i}`,
      scope: scopes[i % 4] as any,
      category: 'custom',
      defaultData: {},
    });
  }

  await benchmark('Get by single scope', async () => {
    registry.getByScope('scene');
  });

  await benchmark('Get by multiple scopes', async () => {
    registry.getByScopes(['scene', 'arc', 'world']);
  });

  await benchmark('Combined category + scope filter', async () => {
    const types = registry.getByScope('scene');
    types.filter(t => t.category === 'custom');
  });
}

// ===== Main Runner =====

async function runAllBenchmarks() {
  console.log('Node Type Registry Benchmarks');
  console.log('=============================');

  await benchmarkBasicOperations();
  await benchmarkLazyLoading();
  await benchmarkPreloading();
  await benchmarkCaching();
  await benchmarkScopeFiltering();

  console.log('\n=== Benchmark Complete ===\n');
}

// Run if called directly
if (require.main === module) {
  runAllBenchmarks().catch(console.error);
}

export {
  runAllBenchmarks,
  benchmarkBasicOperations,
  benchmarkLazyLoading,
  benchmarkPreloading,
  benchmarkCaching,
  benchmarkScopeFiltering,
};
