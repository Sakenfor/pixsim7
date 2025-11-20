/**
 * Performance benchmarks for plugin registries
 *
 * Measures:
 * - Registry lookup time
 * - Memory usage
 * - Cache hit rates
 * - Lazy loading performance
 *
 * Success criteria (100 plugins):
 * - Loads in <500ms
 * - Uses <50MB extra RAM
 * - Cache hit rate >80% for repeated lookups
 */

import { NodeTypeRegistry, NodeTypeDefinition } from '../nodeTypeRegistry';

interface BenchmarkResult {
  name: string;
  duration: number; // milliseconds
  memoryUsed?: number; // bytes
  cacheHitRate?: number; // percentage
  iterations?: number;
}

/**
 * Measure execution time
 */
function measureTime(fn: () => void | Promise<void>): Promise<number> {
  const start = performance.now();
  const result = fn();

  if (result instanceof Promise) {
    return result.then(() => performance.now() - start);
  }

  return Promise.resolve(performance.now() - start);
}

/**
 * Measure memory usage (if available)
 */
function measureMemory(): number | undefined {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    return process.memoryUsage().heapUsed;
  }
  // @ts-ignore
  if (typeof performance !== 'undefined' && performance.memory) {
    // @ts-ignore
    return performance.memory.usedJSHeapSize;
  }
  return undefined;
}

/**
 * Generate test node types
 */
function generateNodeTypes(count: number): NodeTypeDefinition[] {
  const categories = ['media', 'flow', 'logic', 'action', 'custom'] as const;

  return Array.from({ length: count }, (_, i) => ({
    id: `test-node-${i}`,
    name: `Test Node ${i}`,
    description: `Test node type ${i}`,
    icon: '🔲',
    category: categories[i % categories.length],
    defaultData: { value: i },
    userCreatable: true,
    color: '#3b82f6',
    bgColor: '#eff6ff',
  }));
}

/**
 * Benchmark: Registration performance
 */
async function benchmarkRegistration(nodeCount: number): Promise<BenchmarkResult> {
  const registry = new NodeTypeRegistry();
  const nodeTypes = generateNodeTypes(nodeCount);

  const memBefore = measureMemory();

  const duration = await measureTime(() => {
    nodeTypes.forEach(type => registry.register(type));
  });

  const memAfter = measureMemory();
  const memoryUsed = memBefore && memAfter ? memAfter - memBefore : undefined;

  return {
    name: `Registration (${nodeCount} nodes)`,
    duration,
    memoryUsed,
  };
}

/**
 * Benchmark: Lookup performance (cold cache)
 */
async function benchmarkLookupCold(nodeCount: number, lookups: number): Promise<BenchmarkResult> {
  const registry = new NodeTypeRegistry();
  const nodeTypes = generateNodeTypes(nodeCount);

  nodeTypes.forEach(type => registry.register(type));

  // Clear cache to simulate cold start
  registry.clearCache();

  const duration = await measureTime(() => {
    for (let i = 0; i < lookups; i++) {
      const id = `test-node-${i % nodeCount}`;
      registry.getSync(id);
    }
  });

  return {
    name: `Lookup cold (${nodeCount} nodes, ${lookups} lookups)`,
    duration,
    iterations: lookups,
  };
}

/**
 * Benchmark: Lookup performance (warm cache)
 */
async function benchmarkLookupWarm(nodeCount: number, lookups: number): Promise<BenchmarkResult> {
  const registry = new NodeTypeRegistry();
  const nodeTypes = generateNodeTypes(nodeCount);

  nodeTypes.forEach(type => registry.register(type));

  // Warm up cache
  for (let i = 0; i < Math.min(50, nodeCount); i++) {
    registry.getSync(`test-node-${i}`);
  }

  const duration = await measureTime(() => {
    for (let i = 0; i < lookups; i++) {
      const id = `test-node-${i % 50}`; // Access cached items
      registry.getSync(id);
    }
  });

  return {
    name: `Lookup warm (${nodeCount} nodes, ${lookups} lookups)`,
    duration,
    iterations: lookups,
  };
}

/**
 * Benchmark: Category lookup performance
 */
async function benchmarkCategoryLookup(nodeCount: number, lookups: number): Promise<BenchmarkResult> {
  const registry = new NodeTypeRegistry();
  const nodeTypes = generateNodeTypes(nodeCount);

  nodeTypes.forEach(type => registry.register(type));

  const categories = ['media', 'flow', 'logic', 'action', 'custom'];

  const duration = await measureTime(() => {
    for (let i = 0; i < lookups; i++) {
      const category = categories[i % categories.length];
      registry.getByCategory(category);
    }
  });

  return {
    name: `Category lookup (${nodeCount} nodes, ${lookups} lookups)`,
    duration,
    iterations: lookups,
  };
}

/**
 * Benchmark: Cache efficiency
 */
async function benchmarkCacheEfficiency(nodeCount: number): Promise<BenchmarkResult> {
  const registry = new NodeTypeRegistry();
  const nodeTypes = generateNodeTypes(nodeCount);

  nodeTypes.forEach(type => registry.register(type));

  // Simulate realistic access pattern (80/20 rule)
  const popularNodes = 20; // 20% of nodes
  const totalAccesses = 1000;

  let cacheHits = 0;

  const duration = await measureTime(() => {
    for (let i = 0; i < totalAccesses; i++) {
      // 80% of accesses go to 20% of nodes
      const id = i % 100 < 80
        ? `test-node-${i % popularNodes}`
        : `test-node-${popularNodes + (i % (nodeCount - popularNodes))}`;

      const statsBefore = registry.getCacheStats();
      registry.getSync(id);
      const statsAfter = registry.getCacheStats();

      if (statsAfter.size > statsBefore.size || registry.getSync(id) !== undefined) {
        cacheHits++;
      }
    }
  });

  return {
    name: `Cache efficiency (${nodeCount} nodes)`,
    duration,
    cacheHitRate: (cacheHits / totalAccesses) * 100,
    iterations: totalAccesses,
  };
}

/**
 * Benchmark: Lazy loading performance
 */
async function benchmarkLazyLoading(nodeCount: number): Promise<BenchmarkResult> {
  const registry = new NodeTypeRegistry();

  // Register nodes with lazy loaders
  for (let i = 0; i < nodeCount; i++) {
    registry.register({
      id: `lazy-node-${i}`,
      name: `Lazy Node ${i}`,
      defaultData: {},
      loader: async () => ({
        id: `lazy-node-${i}`,
        name: `Lazy Node ${i} (loaded)`,
        defaultData: { loaded: true },
        description: `Loaded node ${i}`,
      }),
      preloadPriority: i < 10 ? 10 - i : 0, // Higher priority for first 10
    });
  }

  const memBefore = measureMemory();

  // Preload high-priority nodes
  const duration = await measureTime(async () => {
    await registry.preload();
  });

  const memAfter = measureMemory();
  const memoryUsed = memBefore && memAfter ? memAfter - memBefore : undefined;

  return {
    name: `Lazy loading with preload (${nodeCount} nodes)`,
    duration,
    memoryUsed,
  };
}

/**
 * Run all benchmarks
 */
export async function runBenchmarks(): Promise<void> {
  console.log('🚀 Running Plugin Registry Performance Benchmarks\n');

  const results: BenchmarkResult[] = [];

  // Test with different node counts
  for (const nodeCount of [10, 50, 100, 500, 1000]) {
    console.log(`\n📊 Testing with ${nodeCount} nodes...\n`);

    // Registration
    results.push(await benchmarkRegistration(nodeCount));

    // Lookups
    results.push(await benchmarkLookupCold(nodeCount, 1000));
    results.push(await benchmarkLookupWarm(nodeCount, 1000));

    // Category lookups
    results.push(await benchmarkCategoryLookup(nodeCount, 100));

    // Cache efficiency (only for larger sets)
    if (nodeCount >= 100) {
      results.push(await benchmarkCacheEfficiency(nodeCount));
    }

    // Lazy loading
    results.push(await benchmarkLazyLoading(nodeCount));
  }

  // Print results
  console.log('\n📈 Benchmark Results:\n');
  console.log('Name'.padEnd(60), 'Duration', 'Ops/sec', 'Memory', 'Cache Hit%');
  console.log('-'.repeat(120));

  for (const result of results) {
    const opsPerSec = result.iterations ? (result.iterations / result.duration) * 1000 : null;
    const memory = result.memoryUsed ? `${(result.memoryUsed / 1024 / 1024).toFixed(2)}MB` : '-';
    const cacheHit = result.cacheHitRate ? `${result.cacheHitRate.toFixed(1)}%` : '-';

    console.log(
      result.name.padEnd(60),
      `${result.duration.toFixed(2)}ms`.padEnd(10),
      opsPerSec ? `${opsPerSec.toFixed(0)}`.padEnd(10) : '-'.padEnd(10),
      memory.padEnd(10),
      cacheHit
    );
  }

  // Check success criteria
  console.log('\n✅ Success Criteria (100 plugins):');

  const loadTimeResult = results.find(r => r.name.includes('100 nodes') && r.name.includes('Registration'));
  const memoryResult = results.find(r => r.name.includes('100 nodes') && r.memoryUsed !== undefined);
  const cacheResult = results.find(r => r.name.includes('Cache efficiency'));

  if (loadTimeResult) {
    const passed = loadTimeResult.duration < 500;
    console.log(`  ${passed ? '✓' : '✗'} Load time: ${loadTimeResult.duration.toFixed(2)}ms (target: <500ms)`);
  }

  if (memoryResult && memoryResult.memoryUsed) {
    const memoryMB = memoryResult.memoryUsed / 1024 / 1024;
    const passed = memoryMB < 50;
    console.log(`  ${passed ? '✓' : '✗'} Memory usage: ${memoryMB.toFixed(2)}MB (target: <50MB)`);
  }

  if (cacheResult && cacheResult.cacheHitRate) {
    const passed = cacheResult.cacheHitRate > 80;
    console.log(`  ${passed ? '✓' : '✗'} Cache hit rate: ${cacheResult.cacheHitRate.toFixed(1)}% (target: >80%)`);
  }

  console.log('\n✨ Benchmarks complete!\n');
}

// Run benchmarks if executed directly
if (require.main === module) {
  runBenchmarks().catch(console.error);
}
