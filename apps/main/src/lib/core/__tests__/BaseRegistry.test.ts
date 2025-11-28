/**
 * Tests for BaseRegistry
 *
 * Part of Task 91 - UI Registry Base & Feature Normalization
 */

import { BaseRegistry, Identifiable } from '../BaseRegistry';

// Test item type
interface TestItem extends Identifiable {
  id: string;
  name: string;
  value?: number;
}

// Concrete test registry
class TestRegistry extends BaseRegistry<TestItem> {}

describe('BaseRegistry', () => {
  let registry: TestRegistry;

  beforeEach(() => {
    registry = new TestRegistry();
  });

  describe('register', () => {
    it('should register an item', () => {
      const item: TestItem = { id: 'test-1', name: 'Test Item' };
      registry.register(item);

      expect(registry.has('test-1')).toBe(true);
      expect(registry.get('test-1')).toEqual(item);
    });

    it('should warn when overwriting an existing item', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const item1: TestItem = { id: 'test-1', name: 'First' };
      const item2: TestItem = { id: 'test-1', name: 'Second' };

      registry.register(item1);
      registry.register(item2);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Item with id "test-1" is already registered')
      );
      expect(registry.get('test-1')).toEqual(item2);

      consoleSpy.mockRestore();
    });

    it('should notify listeners when registering', () => {
      const listener = jest.fn();
      registry.subscribe(listener);

      registry.register({ id: 'test-1', name: 'Test' });

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('unregister', () => {
    it('should remove an item and return true', () => {
      registry.register({ id: 'test-1', name: 'Test' });

      const result = registry.unregister('test-1');

      expect(result).toBe(true);
      expect(registry.has('test-1')).toBe(false);
    });

    it('should return false when item does not exist', () => {
      const result = registry.unregister('non-existent');

      expect(result).toBe(false);
    });

    it('should notify listeners when unregistering', () => {
      const listener = jest.fn();
      registry.register({ id: 'test-1', name: 'Test' });
      registry.subscribe(listener);

      registry.unregister('test-1');

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should not notify listeners when item does not exist', () => {
      const listener = jest.fn();
      registry.subscribe(listener);

      registry.unregister('non-existent');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('should retrieve an item by id', () => {
      const item: TestItem = { id: 'test-1', name: 'Test', value: 42 };
      registry.register(item);

      expect(registry.get('test-1')).toEqual(item);
    });

    it('should return undefined for non-existent item', () => {
      expect(registry.get('non-existent')).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all registered items', () => {
      const items: TestItem[] = [
        { id: 'test-1', name: 'First' },
        { id: 'test-2', name: 'Second' },
        { id: 'test-3', name: 'Third' },
      ];

      items.forEach(item => registry.register(item));

      const all = registry.getAll();
      expect(all).toHaveLength(3);
      expect(all).toEqual(expect.arrayContaining(items));
    });

    it('should return empty array when no items registered', () => {
      expect(registry.getAll()).toEqual([]);
    });
  });

  describe('has', () => {
    it('should return true when item exists', () => {
      registry.register({ id: 'test-1', name: 'Test' });

      expect(registry.has('test-1')).toBe(true);
    });

    it('should return false when item does not exist', () => {
      expect(registry.has('non-existent')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all items', () => {
      registry.register({ id: 'test-1', name: 'First' });
      registry.register({ id: 'test-2', name: 'Second' });
      registry.register({ id: 'test-3', name: 'Third' });

      registry.clear();

      expect(registry.getAll()).toHaveLength(0);
      expect(registry.has('test-1')).toBe(false);
      expect(registry.has('test-2')).toBe(false);
      expect(registry.has('test-3')).toBe(false);
    });

    it('should notify listeners exactly once', () => {
      const listener = jest.fn();
      registry.register({ id: 'test-1', name: 'First' });
      registry.register({ id: 'test-2', name: 'Second' });
      registry.subscribe(listener);

      registry.clear();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should work when registry is already empty', () => {
      const listener = jest.fn();
      registry.subscribe(listener);

      registry.clear();

      expect(registry.getAll()).toHaveLength(0);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribe', () => {
    it('should call listener on changes', () => {
      const listener = jest.fn();
      registry.subscribe(listener);

      registry.register({ id: 'test-1', name: 'Test' });
      registry.unregister('test-1');

      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('should return an unsubscribe function', () => {
      const listener = jest.fn();
      const unsubscribe = registry.subscribe(listener);

      registry.register({ id: 'test-1', name: 'Test' });
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      registry.register({ id: 'test-2', name: 'Test 2' });
      expect(listener).toHaveBeenCalledTimes(1); // Should not be called again
    });

    it('should support multiple listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();

      registry.subscribe(listener1);
      registry.subscribe(listener2);
      registry.subscribe(listener3);

      registry.register({ id: 'test-1', name: 'Test' });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);
    });

    it('should catch errors in individual listeners', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const goodListener = jest.fn();
      const badListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const anotherGoodListener = jest.fn();

      registry.subscribe(goodListener);
      registry.subscribe(badListener);
      registry.subscribe(anotherGoodListener);

      registry.register({ id: 'test-1', name: 'Test' });

      // All listeners should be called, even if one throws
      expect(goodListener).toHaveBeenCalledTimes(1);
      expect(badListener).toHaveBeenCalledTimes(1);
      expect(anotherGoodListener).toHaveBeenCalledTimes(1);

      // Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in registry listener'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('inheritance behavior', () => {
    it('should allow subclasses to override methods', () => {
      class CustomRegistry extends BaseRegistry<TestItem> {
        override register(item: TestItem): void {
          // Custom validation
          if (item.value && item.value < 0) {
            throw new Error('Value must be non-negative');
          }
          super.register(item);
        }
      }

      const customRegistry = new CustomRegistry();

      expect(() => {
        customRegistry.register({ id: 'test-1', name: 'Test', value: -1 });
      }).toThrow('Value must be non-negative');

      customRegistry.register({ id: 'test-2', name: 'Test', value: 42 });
      expect(customRegistry.has('test-2')).toBe(true);
    });

    it('should allow subclasses to access protected members', () => {
      class CustomRegistry extends BaseRegistry<TestItem> {
        getItemsMap() {
          return this.items;
        }

        getListenersSet() {
          return this.listeners;
        }

        manualNotify() {
          this.notifyListeners();
        }
      }

      const customRegistry = new CustomRegistry();
      customRegistry.register({ id: 'test-1', name: 'Test' });

      expect(customRegistry.getItemsMap().size).toBe(1);
      expect(customRegistry.getListenersSet().size).toBe(0);

      const listener = jest.fn();
      customRegistry.subscribe(listener);

      customRegistry.manualNotify();
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
