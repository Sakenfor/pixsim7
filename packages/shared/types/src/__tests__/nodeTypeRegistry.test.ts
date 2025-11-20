/**
 * Tests for NodeTypeRegistry with caching and lazy loading
 */

import { NodeTypeRegistry, NodeTypeDefinition } from '../nodeTypeRegistry';

describe('NodeTypeRegistry', () => {
  let registry: NodeTypeRegistry;

  beforeEach(() => {
    registry = new NodeTypeRegistry();
  });

  describe('Basic operations', () => {
    it('should register and retrieve node types', () => {
      const nodeType: NodeTypeDefinition = {
        id: 'test-node',
        name: 'Test Node',
        defaultData: { value: 'test' },
      };

      registry.register(nodeType);

      const retrieved = registry.getSync('test-node');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('test-node');
      expect(retrieved?.name).toBe('Test Node');
    });

    it('should return undefined for unregistered types', () => {
      const retrieved = registry.getSync('nonexistent');
      expect(retrieved).toBeUndefined();
    });

    it('should check if type exists', () => {
      const nodeType: NodeTypeDefinition = {
        id: 'test-node',
        name: 'Test Node',
        defaultData: {},
      };

      registry.register(nodeType);

      expect(registry.has('test-node')).toBe(true);
      expect(registry.has('nonexistent')).toBe(false);
    });

    it('should get all registered types', () => {
      registry.register({ id: 'node1', name: 'Node 1', defaultData: {} });
      registry.register({ id: 'node2', name: 'Node 2', defaultData: {} });

      const all = registry.getAll();
      expect(all.length).toBe(2);
      expect(all.map(n => n.id).sort()).toEqual(['node1', 'node2']);
    });

    it('should warn when overwriting existing types', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      registry.register({ id: 'test', name: 'Test 1', defaultData: {} });
      registry.register({ id: 'test', name: 'Test 2', defaultData: {} });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('test already registered')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Category operations', () => {
    it('should get types by category', () => {
      registry.register({ id: 'video1', name: 'Video 1', category: 'media', defaultData: {} });
      registry.register({ id: 'video2', name: 'Video 2', category: 'media', defaultData: {} });
      registry.register({ id: 'choice1', name: 'Choice 1', category: 'flow', defaultData: {} });

      const mediaTypes = registry.getByCategory('media');
      expect(mediaTypes.length).toBe(2);
      expect(mediaTypes.every(t => t.category === 'media')).toBe(true);

      const flowTypes = registry.getByCategory('flow');
      expect(flowTypes.length).toBe(1);
      expect(flowTypes[0].id).toBe('choice1');
    });

    it('should return empty array for nonexistent category', () => {
      const types = registry.getByCategory('nonexistent');
      expect(types).toEqual([]);
    });

    it('should update category index when re-registering', () => {
      registry.register({ id: 'test', name: 'Test', category: 'media', defaultData: {} });
      registry.register({ id: 'test', name: 'Test', category: 'flow', defaultData: {} });

      const mediaTypes = registry.getByCategory('media');
      const flowTypes = registry.getByCategory('flow');

      expect(mediaTypes.length).toBe(0);
      expect(flowTypes.length).toBe(1);
    });
  });

  describe('User-creatable types', () => {
    it('should get user-creatable types', () => {
      registry.register({ id: 'user1', name: 'User 1', userCreatable: true, defaultData: {} });
      registry.register({ id: 'user2', name: 'User 2', userCreatable: true, defaultData: {} });
      registry.register({ id: 'system1', name: 'System 1', userCreatable: false, defaultData: {} });

      const userCreatable = registry.getUserCreatable();
      expect(userCreatable.length).toBe(2);
      expect(userCreatable.every(t => t.userCreatable !== false)).toBe(true);
    });

    it('should include types with undefined userCreatable (default true)', () => {
      registry.register({ id: 'test', name: 'Test', defaultData: {} });

      const userCreatable = registry.getUserCreatable();
      expect(userCreatable.length).toBe(1);
    });
  });

  describe('Caching', () => {
    it('should cache frequently accessed types', () => {
      const nodeType: NodeTypeDefinition = {
        id: 'test-node',
        name: 'Test Node',
        defaultData: {},
      };

      registry.register(nodeType);

      // First access - not in cache
      registry.getSync('test-node');

      const statsBefore = registry.getCacheStats();

      // Second access - should hit cache
      registry.getSync('test-node');

      const statsAfter = registry.getCacheStats();

      expect(statsAfter.size).toBeGreaterThan(0);
      expect(statsAfter.maxSize).toBe(50);
    });

    it('should clear cache', () => {
      registry.register({ id: 'test', name: 'Test', defaultData: {} });
      registry.getSync('test');

      let stats = registry.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);

      registry.clearCache();

      stats = registry.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should update cache when re-registering', () => {
      registry.register({ id: 'test', name: 'Test 1', defaultData: {} });
      registry.getSync('test'); // Cache it

      registry.register({ id: 'test', name: 'Test 2', defaultData: {} });

      const retrieved = registry.getSync('test');
      expect(retrieved?.name).toBe('Test 2');
    });
  });

  describe('Lazy loading', () => {
    it('should support lazy-loaded types', async () => {
      const loader = jest.fn(async () => ({
        id: 'lazy-node',
        name: 'Lazy Node (loaded)',
        defaultData: { loaded: true },
      }));

      registry.register({
        id: 'lazy-node',
        name: 'Lazy Node',
        defaultData: {},
        loader,
      });

      // Async get should trigger loader
      const loaded = await registry.get('lazy-node');

      expect(loader).toHaveBeenCalled();
      expect(loaded?.name).toBe('Lazy Node (loaded)');
    });

    it('should not load eager types', async () => {
      registry.register({
        id: 'eager-node',
        name: 'Eager Node',
        defaultData: {},
      });

      const retrieved = await registry.get('eager-node');
      expect(retrieved?.name).toBe('Eager Node');
    });

    it('should cache loaded types', async () => {
      const loader = jest.fn(async () => ({
        id: 'lazy-node',
        name: 'Lazy Node (loaded)',
        defaultData: {},
      }));

      registry.register({
        id: 'lazy-node',
        name: 'Lazy Node',
        defaultData: {},
        loader,
      });

      // First load
      await registry.get('lazy-node');

      // Second access - should use cache, not call loader again
      await registry.get('lazy-node');

      expect(loader).toHaveBeenCalledTimes(1);
    });

    it('should handle loader errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      registry.register({
        id: 'failing-node',
        name: 'Failing Node',
        defaultData: {},
        loader: async () => {
          throw new Error('Load failed');
        },
      });

      const result = await registry.get('failing-node');

      // Should return stub on error
      expect(result?.name).toBe('Failing Node');
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should preload high-priority types', async () => {
      const loader1 = jest.fn(async () => ({
        id: 'node1',
        name: 'Node 1 (loaded)',
        defaultData: {},
      }));

      const loader2 = jest.fn(async () => ({
        id: 'node2',
        name: 'Node 2 (loaded)',
        defaultData: {},
      }));

      registry.register({
        id: 'node1',
        name: 'Node 1',
        defaultData: {},
        loader: loader1,
        preloadPriority: 10,
      });

      registry.register({
        id: 'node2',
        name: 'Node 2',
        defaultData: {},
        loader: loader2,
        preloadPriority: 5,
      });

      await registry.preload();

      expect(loader1).toHaveBeenCalled();
      expect(loader2).toHaveBeenCalled();
    });

    it('should preload specific IDs', async () => {
      const loader1 = jest.fn(async () => ({
        id: 'node1',
        name: 'Node 1 (loaded)',
        defaultData: {},
      }));

      const loader2 = jest.fn(async () => ({
        id: 'node2',
        name: 'Node 2 (loaded)',
        defaultData: {},
      }));

      registry.register({
        id: 'node1',
        name: 'Node 1',
        defaultData: {},
        loader: loader1,
      });

      registry.register({
        id: 'node2',
        name: 'Node 2',
        defaultData: {},
        loader: loader2,
      });

      // Only preload node1
      await registry.preload(['node1']);

      expect(loader1).toHaveBeenCalled();
      expect(loader2).not.toHaveBeenCalled();
    });

    it('should deduplicate concurrent load requests', async () => {
      const loader = jest.fn(async () => {
        // Simulate slow load
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          id: 'slow-node',
          name: 'Slow Node (loaded)',
          defaultData: {},
        };
      });

      registry.register({
        id: 'slow-node',
        name: 'Slow Node',
        defaultData: {},
        loader,
      });

      // Start multiple concurrent loads
      const [result1, result2, result3] = await Promise.all([
        registry.get('slow-node'),
        registry.get('slow-node'),
        registry.get('slow-node'),
      ]);

      // Loader should only be called once
      expect(loader).toHaveBeenCalledTimes(1);

      // All results should be the same
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });
  });

  describe('Scope operations', () => {
    it('should get types by scope', () => {
      registry.register({ id: 'scene1', name: 'Scene 1', scope: 'scene', defaultData: {} });
      registry.register({ id: 'scene2', name: 'Scene 2', scope: 'scene', defaultData: {} });
      registry.register({ id: 'arc1', name: 'Arc 1', scope: 'arc', defaultData: {} });
      registry.register({ id: 'world1', name: 'World 1', scope: 'world', defaultData: {} });

      const sceneTypes = registry.getByScope('scene');
      expect(sceneTypes.length).toBe(2);
      expect(sceneTypes.every(t => t.scope === 'scene')).toBe(true);

      const arcTypes = registry.getByScope('arc');
      expect(arcTypes.length).toBe(1);
      expect(arcTypes[0].id).toBe('arc1');
    });

    it('should return empty array for nonexistent scope', () => {
      const types = registry.getByScope('nonexistent');
      expect(types).toEqual([]);
    });

    it('should get types by multiple scopes', () => {
      registry.register({ id: 'scene1', name: 'Scene 1', scope: 'scene', defaultData: {} });
      registry.register({ id: 'arc1', name: 'Arc 1', scope: 'arc', defaultData: {} });
      registry.register({ id: 'world1', name: 'World 1', scope: 'world', defaultData: {} });

      const types = registry.getByScopes(['scene', 'arc']);
      expect(types.length).toBe(2);
      expect(types.map(t => t.id).sort()).toEqual(['arc1', 'scene1']);
    });

    it('should update scope index when re-registering', () => {
      registry.register({ id: 'test', name: 'Test', scope: 'scene', defaultData: {} });
      registry.register({ id: 'test', name: 'Test', scope: 'arc', defaultData: {} });

      const sceneTypes = registry.getByScope('scene');
      const arcTypes = registry.getByScope('arc');

      expect(sceneTypes.length).toBe(0);
      expect(arcTypes.length).toBe(1);
    });

    it('should filter by both category and scope', () => {
      registry.register({
        id: 'scene-action',
        name: 'Scene Action',
        category: 'action',
        scope: 'scene',
        defaultData: {},
      });
      registry.register({
        id: 'arc-action',
        name: 'Arc Action',
        category: 'action',
        scope: 'arc',
        defaultData: {},
      });
      registry.register({
        id: 'scene-media',
        name: 'Scene Media',
        category: 'media',
        scope: 'scene',
        defaultData: {},
      });

      // Get all action types
      const actionTypes = registry.getByCategory('action');
      expect(actionTypes.length).toBe(2);

      // Get all scene types
      const sceneTypes = registry.getByScope('scene');
      expect(sceneTypes.length).toBe(2);

      // Filter manually for scene + action
      const sceneActions = sceneTypes.filter(t => t.category === 'action');
      expect(sceneActions.length).toBe(1);
      expect(sceneActions[0].id).toBe('scene-action');
    });
  });
});
