/**
 * Adapters for PixSim7Core to use frontend APIs
 */

import type { ApiClient, StorageProvider } from '@pixsim7/game-core';
import type { GameSessionDTO } from '@pixsim7/types';
import { getGameSession, updateGameSession } from '../api/game';

/**
 * API client adapter using frontend API functions
 */
export const frontendApiClient: ApiClient = {
  async fetchSession(sessionId: number): Promise<GameSessionDTO> {
    return await getGameSession(sessionId);
  },

  async saveSession(session: GameSessionDTO): Promise<void> {
    await updateGameSession(session.id, {
      world_time: session.world_time,
      flags: session.flags,
      relationships: session.relationships,
    });
  },
};

/**
 * Storage provider using localStorage
 */
export const localStorageProvider: StorageProvider = {
  async loadLocalSession(sessionId: number): Promise<GameSessionDTO | null> {
    try {
      const key = `pixsim7:session:${sessionId}`;
      const data = localStorage.getItem(key);
      if (!data) return null;
      return JSON.parse(data) as GameSessionDTO;
    } catch (error) {
      console.error('Failed to load session from localStorage:', error);
      return null;
    }
  },

  async saveLocalSession(session: GameSessionDTO): Promise<void> {
    try {
      const key = `pixsim7:session:${session.id}`;
      localStorage.setItem(key, JSON.stringify(session));
    } catch (error) {
      console.error('Failed to save session to localStorage:', error);
    }
  },
};
