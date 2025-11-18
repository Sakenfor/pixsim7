/**
 * Tests for SessionHelperRegistry
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SessionHelperRegistry,
  VALID_HELPER_CATEGORIES,
  type HelperDefinition,
} from '../session/helperRegistry';
import type { GameSessionDTO } from '@pixsim7/types';

describe('SessionHelperRegistry', () => {
  let registry: SessionHelperRegistry;
  let mockSession: GameSessionDTO;

  beforeEach(() => {
    registry = new SessionHelperRegistry();
    mockSession = {
      id: 'test-session',
      user_id: 'test-user',
      flags: {},
      relationships: {},
      world_time: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as GameSessionDTO;
  });

  describe('Registration', () => {
    it('should register a valid helper', () => {
      const helper: HelperDefinition = {
        name: 'testHelper',
        fn: (session) => session,
        category: 'custom',
        description: 'Test helper',
      };

      registry.register(helper);
      const retrieved = registry.get('testHelper');

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('testHelper');
      expect(retrieved?.category).toBe('custom');
    });

    it('should throw error for empty helper name', () => {
      const helper: HelperDefinition = {
        name: '',
        fn: (session) => session,
      };

      expect(() => registry.register(helper)).toThrow(
        'Helper name is required and cannot be empty'
      );
    });

    it('should throw error for whitespace-only helper name', () => {
      const helper: HelperDefinition = {
        name: '   ',
        fn: (session) => session,
      };

      expect(() => registry.register(helper)).toThrow(
        'Helper name is required and cannot be empty'
      );
    });

    it('should throw error for invalid category', () => {
      const helper: HelperDefinition = {
        name: 'testHelper',
        fn: (session) => session,
        category: 'invalid' as any,
      };

      expect(() => registry.register(helper)).toThrow(
        'Invalid helper category "invalid"'
      );
    });

    it('should accept all valid categories', () => {
      VALID_HELPER_CATEGORIES.forEach((category) => {
        const helper: HelperDefinition = {
          name: `helper_${category}`,
          fn: (session) => session,
          category,
        };

        expect(() => registry.register(helper)).not.toThrow();
      });
    });

    it('should throw error when fn is not a function', () => {
      const helper: HelperDefinition = {
        name: 'testHelper',
        fn: 'not a function' as any,
      };

      expect(() => registry.register(helper)).toThrow(
        'Helper "testHelper" must have a function (fn)'
      );
    });

    it('should allow registration without category', () => {
      const helper: HelperDefinition = {
        name: 'testHelper',
        fn: (session) => session,
      };

      expect(() => registry.register(helper)).not.toThrow();
    });
  });

  describe('Duplicate Registration', () => {
    it('should warn on duplicate registration in non-strict mode', () => {
      const helper1: HelperDefinition = {
        name: 'testHelper',
        fn: (session) => session,
      };

      const helper2: HelperDefinition = {
        name: 'testHelper',
        fn: (session) => ({ ...session, flags: { modified: true } }),
      };

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      registry.register(helper1);
      registry.register(helper2);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Helper "testHelper" already registered')
      );

      warnSpy.mockRestore();
    });

    it('should throw error on duplicate registration in strict mode', () => {
      const strictRegistry = new SessionHelperRegistry({ strict: true });

      const helper1: HelperDefinition = {
        name: 'testHelper',
        fn: (session) => session,
      };

      const helper2: HelperDefinition = {
        name: 'testHelper',
        fn: (session) => session,
      };

      strictRegistry.register(helper1);

      expect(() => strictRegistry.register(helper2)).toThrow(
        'Helper "testHelper" already registered'
      );
    });

    it('should overwrite helper on duplicate in non-strict mode', () => {
      const helper1: HelperDefinition = {
        name: 'testHelper',
        fn: (session) => 'original',
        description: 'Original',
      };

      const helper2: HelperDefinition = {
        name: 'testHelper',
        fn: (session) => 'updated',
        description: 'Updated',
      };

      vi.spyOn(console, 'warn').mockImplementation(() => {});

      registry.register(helper1);
      registry.register(helper2);

      const retrieved = registry.get('testHelper');
      expect(retrieved?.description).toBe('Updated');
      expect(retrieved?.fn(mockSession)).toBe('updated');
    });
  });

  describe('Retrieval', () => {
    beforeEach(() => {
      registry.register({
        name: 'helper1',
        fn: (session) => session,
        category: 'arcs',
      });

      registry.register({
        name: 'helper2',
        fn: (session) => session,
        category: 'arcs',
      });

      registry.register({
        name: 'helper3',
        fn: (session) => session,
        category: 'quests',
      });
    });

    it('should get helper by name', () => {
      const helper = registry.get('helper1');
      expect(helper).toBeDefined();
      expect(helper?.name).toBe('helper1');
    });

    it('should return undefined for non-existent helper', () => {
      const helper = registry.get('nonExistent');
      expect(helper).toBeUndefined();
    });

    it('should get all helpers', () => {
      const all = registry.getAll();
      expect(all).toHaveLength(3);
    });

    it('should get helpers by category', () => {
      const arcsHelpers = registry.getByCategory('arcs');
      expect(arcsHelpers).toHaveLength(2);
      expect(arcsHelpers.every((h) => h.category === 'arcs')).toBe(true);

      const questsHelpers = registry.getByCategory('quests');
      expect(questsHelpers).toHaveLength(1);
      expect(questsHelpers[0].name).toBe('helper3');
    });

    it('should return empty array for category with no helpers', () => {
      const helpers = registry.getByCategory('inventory');
      expect(helpers).toHaveLength(0);
    });
  });

  describe('Execution', () => {
    it('should execute helper by name', () => {
      registry.register({
        name: 'addValue',
        fn: (session, key: string, value: any) => {
          session.flags[key] = value;
          return session;
        },
        category: 'custom',
      });

      const result = registry.execute('addValue', mockSession, 'test', 42);

      expect(result.flags.test).toBe(42);
    });

    it('should throw error when executing non-existent helper', () => {
      expect(() => registry.execute('nonExistent', mockSession)).toThrow(
        'Unknown session helper: nonExistent'
      );
    });

    it('should pass arguments to helper function', () => {
      registry.register({
        name: 'concat',
        fn: (session, a: string, b: string, c: string) => {
          return a + b + c;
        },
        category: 'custom',
      });

      const result = registry.execute('concat', mockSession, 'a', 'b', 'c');
      expect(result).toBe('abc');
    });
  });

  describe('buildHelpersObject', () => {
    beforeEach(() => {
      registry.register({
        name: 'getValue',
        fn: (session, key: string) => session.flags[key],
        category: 'custom',
      });

      registry.register({
        name: 'setValue',
        fn: (session, key: string, value: any) => {
          session.flags[key] = value;
          return session;
        },
        category: 'custom',
      });
    });

    it('should build helpers object bound to session', () => {
      mockSession.flags.test = 'initial';

      const helpers = registry.buildHelpersObject(mockSession);

      expect(helpers.getValue).toBeDefined();
      expect(helpers.setValue).toBeDefined();

      expect(helpers.getValue('test')).toBe('initial');

      helpers.setValue('test', 'updated');
      expect(mockSession.flags.test).toBe('updated');
    });

    it('should include all registered helpers', () => {
      registry.register({
        name: 'helper1',
        fn: (session) => session,
      });

      registry.register({
        name: 'helper2',
        fn: (session) => session,
      });

      const helpers = registry.buildHelpersObject(mockSession);

      expect(Object.keys(helpers)).toContain('getValue');
      expect(Object.keys(helpers)).toContain('setValue');
      expect(Object.keys(helpers)).toContain('helper1');
      expect(Object.keys(helpers)).toContain('helper2');
    });

    it('should create independent helper objects for different sessions', () => {
      const session1: GameSessionDTO = {
        ...mockSession,
        id: 'session1',
        flags: { value: 1 },
      };

      const session2: GameSessionDTO = {
        ...mockSession,
        id: 'session2',
        flags: { value: 2 },
      };

      const helpers1 = registry.buildHelpersObject(session1);
      const helpers2 = registry.buildHelpersObject(session2);

      expect(helpers1.getValue('value')).toBe(1);
      expect(helpers2.getValue('value')).toBe(2);
    });
  });

  describe('Metadata', () => {
    it('should preserve helper metadata', () => {
      const helper: HelperDefinition = {
        name: 'testHelper',
        fn: (session) => session,
        category: 'custom',
        description: 'Test description',
        params: [
          { name: 'session', type: 'GameSessionDTO' },
          { name: 'value', type: 'number', description: 'A test value' },
        ],
        returns: 'GameSessionDTO',
      };

      registry.register(helper);
      const retrieved = registry.get('testHelper');

      expect(retrieved?.description).toBe('Test description');
      expect(retrieved?.params).toHaveLength(2);
      expect(retrieved?.params?.[1].name).toBe('value');
      expect(retrieved?.returns).toBe('GameSessionDTO');
    });
  });
});
