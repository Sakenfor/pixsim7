/**
 * Console Module Registry Tests
 *
 * Tests the module registration, dependency handling, and lifecycle management
 * for the console module system.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { moduleRegistry, type ConsoleModule } from '../moduleRegistry';

describe('ModuleRegistry', () => {
  beforeEach(() => {
    // Clear registry before each test
    moduleRegistry.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    moduleRegistry.clear();
  });

  describe('register', () => {
    it('should register a module successfully', () => {
      const registerFn = vi.fn();
      const testModule: ConsoleModule = {
        id: 'test',
        name: 'Test Module',
        register: registerFn,
      };

      moduleRegistry.register(testModule);

      expect(moduleRegistry.has('test')).toBe(true);
      expect(registerFn).toHaveBeenCalled();
    });

    it('should skip duplicate registrations', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const registerFn = vi.fn();
      const testModule: ConsoleModule = {
        id: 'test',
        name: 'Test Module',
        register: registerFn,
      };

      moduleRegistry.register(testModule);
      moduleRegistry.register(testModule);

      expect(registerFn).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('already registered')
      );
      consoleSpy.mockRestore();
    });

    it('should call register function during registration', () => {
      const registerFn = vi.fn();
      const testModule: ConsoleModule = {
        id: 'test',
        name: 'Test Module',
        register: registerFn,
      };

      moduleRegistry.register(testModule);

      expect(registerFn).toHaveBeenCalledTimes(1);
    });

    it('should handle registration errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const testModule: ConsoleModule = {
        id: 'failing',
        name: 'Failing Module',
        register: () => {
          throw new Error('Registration failed');
        },
      };

      expect(() => moduleRegistry.register(testModule)).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to register'),
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    it('should track module with description', () => {
      const testModule: ConsoleModule = {
        id: 'described',
        name: 'Described Module',
        description: 'A module with a description',
        register: vi.fn(),
      };

      moduleRegistry.register(testModule);

      const retrieved = moduleRegistry.get('described');
      expect(retrieved?.description).toBe('A module with a description');
    });
  });

  describe('registerAll', () => {
    it('should register multiple modules in order', () => {
      const order: string[] = [];

      const moduleA: ConsoleModule = {
        id: 'a',
        name: 'Module A',
        register: () => order.push('a'),
      };

      const moduleB: ConsoleModule = {
        id: 'b',
        name: 'Module B',
        register: () => order.push('b'),
      };

      const moduleC: ConsoleModule = {
        id: 'c',
        name: 'Module C',
        register: () => order.push('c'),
      };

      moduleRegistry.registerAll([moduleA, moduleB, moduleC]);

      expect(order).toEqual(['a', 'b', 'c']);
      expect(moduleRegistry.keys()).toContain('a');
      expect(moduleRegistry.keys()).toContain('b');
      expect(moduleRegistry.keys()).toContain('c');
    });
  });

  describe('dependencies', () => {
    it('should warn when dependency is not yet initialized', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const dependentModule: ConsoleModule = {
        id: 'dependent',
        name: 'Dependent Module',
        dependencies: ['core', 'other'],
        register: vi.fn(),
      };

      moduleRegistry.register(dependentModule);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('depends on "core"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('depends on "other"')
      );
      consoleSpy.mockRestore();
    });

    it('should not warn when dependencies are satisfied', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const coreModule: ConsoleModule = {
        id: 'core',
        name: 'Core Module',
        register: vi.fn(),
      };

      const dependentModule: ConsoleModule = {
        id: 'dependent',
        name: 'Dependent Module',
        dependencies: ['core'],
        register: vi.fn(),
      };

      moduleRegistry.register(coreModule);
      moduleRegistry.register(dependentModule);

      // Should only warn if there are unmet dependencies, not for satisfied ones
      const warnCalls = consoleSpy.mock.calls.filter((call) =>
        call[0].includes('depends on "core"')
      );
      expect(warnCalls.length).toBe(0);
      consoleSpy.mockRestore();
    });

    it('should work with proper dependency order', () => {
      const order: string[] = [];

      const coreModule: ConsoleModule = {
        id: 'core',
        name: 'Core',
        register: () => order.push('core'),
      };

      const toolsModule: ConsoleModule = {
        id: 'tools',
        name: 'Tools',
        dependencies: ['core'],
        register: () => order.push('tools'),
      };

      const statsModule: ConsoleModule = {
        id: 'stats',
        name: 'Stats',
        dependencies: ['core'],
        register: () => order.push('stats'),
      };

      // Register in dependency order
      moduleRegistry.registerAll([coreModule, toolsModule, statsModule]);

      expect(order).toEqual(['core', 'tools', 'stats']);
    });
  });

  describe('unregister', () => {
    it('should unregister a module', () => {
      const unregisterFn = vi.fn();
      const testModule: ConsoleModule = {
        id: 'test',
        name: 'Test Module',
        register: vi.fn(),
        unregister: unregisterFn,
      };

      moduleRegistry.register(testModule);
      expect(moduleRegistry.has('test')).toBe(true);

      moduleRegistry.unregister('test');
      expect(moduleRegistry.has('test')).toBe(false);
      expect(unregisterFn).toHaveBeenCalled();
    });

    it('should handle unregister of non-existent module', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      moduleRegistry.unregister('nonexistent');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('not found')
      );
      consoleSpy.mockRestore();
    });

    it('should handle unregister errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const testModule: ConsoleModule = {
        id: 'failing',
        name: 'Failing Module',
        register: vi.fn(),
        unregister: () => {
          throw new Error('Unregister failed');
        },
      };

      moduleRegistry.register(testModule);
      expect(() => moduleRegistry.unregister('failing')).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to unregister'),
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    it('should work without unregister callback', () => {
      const testModule: ConsoleModule = {
        id: 'simple',
        name: 'Simple Module',
        register: vi.fn(),
        // No unregister callback
      };

      moduleRegistry.register(testModule);
      expect(() => moduleRegistry.unregister('simple')).not.toThrow();
      expect(moduleRegistry.has('simple')).toBe(false);
    });
  });

  describe('has', () => {
    it('should return true for registered modules', () => {
      moduleRegistry.register({
        id: 'test',
        name: 'Test',
        register: vi.fn(),
      });

      expect(moduleRegistry.has('test')).toBe(true);
    });

    it('should return false for unregistered modules', () => {
      expect(moduleRegistry.has('nonexistent')).toBe(false);
    });
  });

  describe('get', () => {
    it('should return the registered module', () => {
      const testModule: ConsoleModule = {
        id: 'test',
        name: 'Test Module',
        description: 'Test description',
        register: vi.fn(),
      };

      moduleRegistry.register(testModule);

      const retrieved = moduleRegistry.get('test');
      expect(retrieved).toEqual(testModule);
    });

    it('should return undefined for unregistered modules', () => {
      expect(moduleRegistry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('keys', () => {
    it('should return all registered module IDs', () => {
      moduleRegistry.register({ id: 'a', name: 'A', register: vi.fn() });
      moduleRegistry.register({ id: 'b', name: 'B', register: vi.fn() });
      moduleRegistry.register({ id: 'c', name: 'C', register: vi.fn() });

      const keys = moduleRegistry.keys();
      expect(keys).toContain('a');
      expect(keys).toContain('b');
      expect(keys).toContain('c');
      expect(keys.length).toBe(3);
    });

    it('should return empty array when no modules registered', () => {
      expect(moduleRegistry.keys()).toEqual([]);
    });
  });

  describe('entries', () => {
    it('should return all registered modules', () => {
      const moduleA: ConsoleModule = { id: 'a', name: 'A', register: vi.fn() };
      const moduleB: ConsoleModule = { id: 'b', name: 'B', register: vi.fn() };

      moduleRegistry.register(moduleA);
      moduleRegistry.register(moduleB);

      const entries = moduleRegistry.entries();
      expect(entries).toContain(moduleA);
      expect(entries).toContain(moduleB);
      expect(entries.length).toBe(2);
    });
  });

  describe('clear', () => {
    it('should unregister all modules in reverse order', () => {
      const order: string[] = [];

      moduleRegistry.register({
        id: 'first',
        name: 'First',
        register: vi.fn(),
        unregister: () => order.push('first'),
      });

      moduleRegistry.register({
        id: 'second',
        name: 'Second',
        register: vi.fn(),
        unregister: () => order.push('second'),
      });

      moduleRegistry.register({
        id: 'third',
        name: 'Third',
        register: vi.fn(),
        unregister: () => order.push('third'),
      });

      moduleRegistry.clear();

      // Should be unregistered in reverse order
      expect(order).toEqual(['third', 'second', 'first']);
      expect(moduleRegistry.keys()).toEqual([]);
    });
  });
});

describe('Module Registration Patterns', () => {
  beforeEach(() => {
    moduleRegistry.clear();
  });

  afterEach(() => {
    moduleRegistry.clear();
  });

  it('should support typical module pattern with ops registration', () => {
    // This tests the pattern used by statsModule
    const mockOpsRegistry = {
      registerCategory: vi.fn(),
      register: vi.fn(),
    };

    const mockDataRegistry = {
      register: vi.fn(),
    };

    const exampleModule: ConsoleModule = {
      id: 'example',
      name: 'Example Module',
      description: 'An example module demonstrating the pattern',
      dependencies: ['core'],
      register: () => {
        mockOpsRegistry.registerCategory('example', 'Example', 'Example operations');
        mockOpsRegistry.register('example', { id: 'doSomething', execute: () => 'done' });
        mockDataRegistry.register({ id: 'exampleData', getSnapshot: () => ({}) });
      },
      unregister: () => {
        // Cleanup logic here
      },
    };

    // First register core
    moduleRegistry.register({
      id: 'core',
      name: 'Core',
      register: vi.fn(),
    });

    // Then register our module
    moduleRegistry.register(exampleModule);

    expect(mockOpsRegistry.registerCategory).toHaveBeenCalledWith(
      'example',
      'Example',
      'Example operations'
    );
    expect(mockOpsRegistry.register).toHaveBeenCalled();
    expect(mockDataRegistry.register).toHaveBeenCalled();
  });

  it('should support inspector module pattern', () => {
    // This demonstrates the pattern for upcoming Model Inspector modules
    type InspectorTab = {
      id: string;
      label: string;
      component: () => void;
    };

    const inspectorTabs: InspectorTab[] = [];

    const registerInspectorTab = (tab: InspectorTab) => {
      inspectorTabs.push(tab);
    };

    const modelInspectorModule: ConsoleModule = {
      id: 'model-inspector',
      name: 'Model Inspector',
      description: 'Inspector panel for 3D models',
      dependencies: ['core'],
      register: () => {
        registerInspectorTab({
          id: 'transform',
          label: 'Transform',
          component: () => {},
        });
        registerInspectorTab({
          id: 'materials',
          label: 'Materials',
          component: () => {},
        });
      },
      unregister: () => {
        // Remove tabs
        inspectorTabs.length = 0;
      },
    };

    moduleRegistry.register({
      id: 'core',
      name: 'Core',
      register: vi.fn(),
    });

    moduleRegistry.register(modelInspectorModule);

    expect(inspectorTabs).toHaveLength(2);
    expect(inspectorTabs[0].id).toBe('transform');
    expect(inspectorTabs[1].id).toBe('materials');
  });
});
