/**
 * Tests for generateHelper
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generateHelper } from '../session/helperBuilder';
import { sessionHelperRegistry } from '../session/helperRegistry';
import type { GameSessionDTO } from '@pixsim7/shared.types';

describe('generateHelper', () => {
  let mockSession: GameSessionDTO;

  beforeEach(() => {
    // Note: generateHelper uses the global sessionHelperRegistry
    // We use the same instance in tests
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

  describe('get operation', () => {
    it('should generate getter helper', () => {
      generateHelper({
        name: 'getCurrency',
        category: 'custom',
        keyPattern: 'currency.{currencyType}',
        operation: 'get',
      });

      mockSession.flags = { currency: { gold: 100 } };

      const result = sessionHelperRegistry.execute('getCurrency', mockSession, 'gold');
      expect(result).toBe(100);
    });

    it('should return undefined for non-existent path', () => {
      generateHelper({
        name: 'getStat',
        category: 'custom',
        keyPattern: 'stats.{statName}',
        operation: 'get',
      });

      const result = sessionHelperRegistry.execute('getStat', mockSession, 'strength');
      expect(result).toBeUndefined();
    });
  });

  describe('set operation', () => {
    it('should generate setter helper and return session', () => {
      generateHelper({
        name: 'setCurrency',
        category: 'custom',
        keyPattern: 'currency.{currencyType}',
        operation: 'set',
      });

      const result = sessionHelperRegistry.execute('setCurrency', mockSession, 'gold', 100);

      expect(result).toBe(mockSession);
      expect(mockSession.flags.currency?.gold).toBe(100);
    });

    it('should create nested paths automatically', () => {
      generateHelper({
        name: 'setDeepValue',
        category: 'custom',
        keyPattern: 'deep.nested.path.value',
        operation: 'set',
      });

      sessionHelperRegistry.execute('setDeepValue', mockSession, 42);

      expect(mockSession.flags.deep?.nested?.path?.value).toBe(42);
    });
  });

  describe('inc operation', () => {
    it('should generate increment helper and return session', () => {
      generateHelper({
        name: 'addCurrency',
        category: 'custom',
        keyPattern: 'currency.{currencyType}',
        operation: 'inc',
      });

      mockSession.flags = { currency: { gold: 50 } };

      const result = sessionHelperRegistry.execute('addCurrency', mockSession, 'gold', 25);

      expect(result).toBe(mockSession);
      expect(mockSession.flags.currency.gold).toBe(75);
    });

    it('should initialize to 0 if value does not exist', () => {
      generateHelper({
        name: 'incrementStat',
        category: 'custom',
        keyPattern: 'stats.{statName}',
        operation: 'inc',
      });

      const result = sessionHelperRegistry.execute('incrementStat', mockSession, 'strength', 10);

      expect(result).toBe(mockSession);
      expect(mockSession.flags.stats?.strength).toBe(10);
    });

    it('should increment by 1 if amount not provided', () => {
      generateHelper({
        name: 'incrementCounter',
        category: 'custom',
        keyPattern: 'counters.{counterName}',
        operation: 'inc',
      });

      mockSession.flags = { counters: { clicks: 5 } };

      sessionHelperRegistry.execute('incrementCounter', mockSession, 'clicks');

      expect(mockSession.flags.counters.clicks).toBe(6);
    });
  });

  describe('dec operation', () => {
    it('should generate decrement helper and return session', () => {
      generateHelper({
        name: 'removeCurrency',
        category: 'custom',
        keyPattern: 'currency.{currencyType}',
        operation: 'dec',
      });

      mockSession.flags = { currency: { gold: 100 } };

      const result = sessionHelperRegistry.execute('removeCurrency', mockSession, 'gold', 30);

      expect(result).toBe(mockSession);
      expect(mockSession.flags.currency.gold).toBe(70);
    });

    it('should initialize to 0 if value does not exist', () => {
      generateHelper({
        name: 'decrementStat',
        category: 'custom',
        keyPattern: 'stats.{statName}',
        operation: 'dec',
      });

      const result = sessionHelperRegistry.execute('decrementStat', mockSession, 'health', 10);

      expect(result).toBe(mockSession);
      expect(mockSession.flags.stats?.health).toBe(-10);
    });
  });

  describe('push operation', () => {
    it('should generate array push helper and return session', () => {
      generateHelper({
        name: 'addAchievement',
        category: 'custom',
        keyPattern: 'achievements.list',
        operation: 'push',
      });

      mockSession.flags = { achievements: { list: ['first-kill'] } };

      const result = sessionHelperRegistry.execute('addAchievement', mockSession, 'level-10');

      expect(result).toBe(mockSession);
      expect(mockSession.flags.achievements.list).toEqual(['first-kill', 'level-10']);
    });

    it('should create array if it does not exist', () => {
      generateHelper({
        name: 'addItem',
        category: 'custom',
        keyPattern: 'items.{category}',
        operation: 'push',
      });

      const result = sessionHelperRegistry.execute('addItem', mockSession, 'weapons', 'sword');

      expect(result).toBe(mockSession);
      expect(mockSession.flags.items?.weapons).toEqual(['sword']);
    });

    it('should handle non-array values by creating new array', () => {
      generateHelper({
        name: 'addToList',
        category: 'custom',
        keyPattern: 'lists.{listName}',
        operation: 'push',
      });

      mockSession.flags = { lists: { test: 'not-an-array' } };

      sessionHelperRegistry.execute('addToList', mockSession, 'test', 'new-item');

      expect(mockSession.flags.lists.test).toEqual(['new-item']);
    });
  });

  describe('toggle operation', () => {
    it('should generate toggle helper and return session', () => {
      generateHelper({
        name: 'toggleFeature',
        category: 'custom',
        keyPattern: 'features.{featureName}',
        operation: 'toggle',
      });

      mockSession.flags = { features: { darkMode: false } };

      const result = sessionHelperRegistry.execute('toggleFeature', mockSession, 'darkMode');

      expect(result).toBe(mockSession);
      expect(mockSession.flags.features.darkMode).toBe(true);

      sessionHelperRegistry.execute('toggleFeature', mockSession, 'darkMode');
      expect(mockSession.flags.features.darkMode).toBe(false);
    });

    it('should toggle undefined to true', () => {
      generateHelper({
        name: 'toggleSetting',
        category: 'custom',
        keyPattern: 'settings.{settingName}',
        operation: 'toggle',
      });

      const result = sessionHelperRegistry.execute('toggleSetting', mockSession, 'notifications');

      expect(result).toBe(mockSession);
      expect(mockSession.flags.settings?.notifications).toBe(true);
    });
  });

  describe('Key pattern interpolation', () => {
    it('should handle single parameter', () => {
      generateHelper({
        name: 'getGuildRep',
        category: 'custom',
        keyPattern: 'guilds.{guildId}.reputation',
        operation: 'get',
      });

      mockSession.flags = {
        guilds: {
          thieves: { reputation: 50 },
          mages: { reputation: 80 },
        },
      };

      expect(sessionHelperRegistry.execute('getGuildRep', mockSession, 'thieves')).toBe(50);
      expect(sessionHelperRegistry.execute('getGuildRep', mockSession, 'mages')).toBe(80);
    });

    it('should handle multiple parameters', () => {
      generateHelper({
        name: 'getNpcRelationship',
        category: 'custom',
        keyPattern: 'npcs.{npcId}.relationships.{type}',
        operation: 'get',
      });

      mockSession.flags = {
        npcs: {
          alice: { relationships: { friendship: 75, romance: 20 } },
        },
      };

      expect(sessionHelperRegistry.execute('getNpcRelationship', mockSession, 'alice', 'friendship')).toBe(75);
      expect(sessionHelperRegistry.execute('getNpcRelationship', mockSession, 'alice', 'romance')).toBe(20);
    });

    it('should handle no parameters', () => {
      generateHelper({
        name: 'getPlayerLevel',
        category: 'custom',
        keyPattern: 'player.level',
        operation: 'get',
      });

      mockSession.flags = { player: { level: 10 } };

      expect(sessionHelperRegistry.execute('getPlayerLevel', mockSession)).toBe(10);
    });
  });

  describe('Return value chaining', () => {
    it('should allow chaining mutation operations', () => {
      generateHelper({
        name: 'setGold',
        category: 'custom',
        keyPattern: 'currency.gold',
        operation: 'set',
      });

      generateHelper({
        name: 'setSilver',
        category: 'custom',
        keyPattern: 'currency.silver',
        operation: 'set',
      });

      const session1 = sessionHelperRegistry.execute('setGold', mockSession, 100);
      const session2 = sessionHelperRegistry.execute('setSilver', session1, 50);

      expect(session2).toBe(mockSession);
      expect(mockSession.flags.currency?.gold).toBe(100);
      expect(mockSession.flags.currency?.silver).toBe(50);
    });
  });

  describe('Auto-generated metadata', () => {
    it('should create description from operation and pattern', () => {
      generateHelper({
        name: 'testHelper',
        category: 'custom',
        keyPattern: 'test.{id}.value',
        operation: 'inc',
      });

      const helper = sessionHelperRegistry.get('testHelper');
      expect(helper?.description).toBe('Auto-generated: inc test.{id}.value');
    });

    it('should preserve category', () => {
      generateHelper({
        name: 'arcHelper',
        category: 'arcs',
        keyPattern: 'arcs.{arcId}.stage',
        operation: 'set',
      });

      const helper = sessionHelperRegistry.get('arcHelper');
      expect(helper?.category).toBe('arcs');
    });
  });
});
