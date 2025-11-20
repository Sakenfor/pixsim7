/**
 * Custom Session Helpers
 *
 * Example of how to extend the session helper system with custom helpers.
 * Register these in App.tsx before creating any sessions.
 */

import { sessionHelperRegistry, generateHelper } from '@pixsim7/game.engine';
import type { GameSessionDTO } from '@pixsim7/shared.types';

/**
 * Get points required for next level (example formula)
 */
function getPointsForNextLevel(currentLevel: number = 1): number {
  return currentLevel * 100;
}

/**
 * Register custom helpers for your game
 * Call this once during app initialization
 */
export function registerCustomHelpers() {
  // ===== Manual Custom Helper =====
  sessionHelperRegistry.register({
    name: 'addSkillPoints',
    category: 'custom',
    description: 'Add skill points to a skill tree',
    fn: (session: GameSessionDTO, skillTree: string, points: number) => {
      if (!session.flags.skills) session.flags.skills = {};
      if (!session.flags.skills[skillTree]) {
        session.flags.skills[skillTree] = { points: 0, level: 1 };
      }
      session.flags.skills[skillTree].points += points;

      // Level up logic
      while (
        session.flags.skills[skillTree].points >=
        getPointsForNextLevel(session.flags.skills[skillTree].level)
      ) {
        session.flags.skills[skillTree].level++;
      }
    },
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'skillTree', type: 'string' },
      { name: 'points', type: 'number' },
    ],
  });

  // ===== Auto-generated Helpers =====

  // Guild reputation
  generateHelper({
    name: 'setGuildReputation',
    category: 'custom',
    keyPattern: 'guilds.{guildId}.reputation',
    operation: 'set',
  });

  generateHelper({
    name: 'incrementGuildReputation',
    category: 'custom',
    keyPattern: 'guilds.{guildId}.reputation',
    operation: 'inc',
  });

  // Currency
  generateHelper({
    name: 'addCurrency',
    category: 'custom',
    keyPattern: 'currency.{currencyType}',
    operation: 'inc',
  });

  generateHelper({
    name: 'removeCurrency',
    category: 'custom',
    keyPattern: 'currency.{currencyType}',
    operation: 'dec',
  });

  generateHelper({
    name: 'getCurrency',
    category: 'custom',
    keyPattern: 'currency.{currencyType}',
    operation: 'get',
  });

  // Achievements
  generateHelper({
    name: 'unlockAchievement',
    category: 'custom',
    keyPattern: 'achievements.{achievementId}',
    operation: 'set',
  });

  generateHelper({
    name: 'isAchievementUnlocked',
    category: 'custom',
    keyPattern: 'achievements.{achievementId}',
    operation: 'get',
  });

  // Stats
  generateHelper({
    name: 'incrementStat',
    category: 'custom',
    keyPattern: 'stats.{statName}',
    operation: 'inc',
  });

  generateHelper({
    name: 'getStat',
    category: 'custom',
    keyPattern: 'stats.{statName}',
    operation: 'get',
  });

  // Feature flags
  generateHelper({
    name: 'toggleFeature',
    category: 'custom',
    keyPattern: 'features.{featureName}',
    operation: 'toggle',
  });
}

/**
 * Usage examples:
 *
 * After registering, these helpers are available on the session object:
 *
 * // Skills
 * session.addSkillPoints('combat', 5);
 *
 * // Reputation
 * session.setGuildReputation('thieves', 50);
 * session.incrementGuildReputation('thieves', 10);
 *
 * // Currency
 * session.addCurrency('gold', 100);
 * session.removeCurrency('gold', 50);
 * const gold = session.getCurrency('gold');
 *
 * // Achievements
 * session.unlockAchievement('first-kill', true);
 * const hasAchievement = session.isAchievementUnlocked('first-kill');
 *
 * // Stats
 * session.incrementStat('enemiesKilled', 1);
 * const kills = session.getStat('enemiesKilled');
 *
 * // Features
 * session.toggleFeature('darkMode');
 */
