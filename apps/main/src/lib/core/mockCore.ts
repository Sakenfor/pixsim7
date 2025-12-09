/**
 * Mock implementation of PixSim7Core for testing
 * This will be replaced with the real headless@pixsim7/game.engine package
 */

import {
  PixSim7Core,
  GameSession,
  NpcRelationshipState,
  CoreEventMap,
} from './types';
import type { BrainState, BrainStatSnapshot } from '@pixsim7/shared.types';

type EventHandler<K extends keyof CoreEventMap> = (
  payload: CoreEventMap[K]
) => void;

type MockMemory = {
  id: string;
  timestamp: string;
  summary: string;
  tags: string[];
  source?: 'scene' | 'event' | 'flag';
};

export class MockPixSim7Core implements PixSim7Core {
  private session: GameSession | null = null;
  private eventHandlers: Map<
    keyof CoreEventMap,
    Set<EventHandler<any>>
  > = new Map();

  // Mock NPC data
  private mockNpcs: Map<number, { name: string; personality: any }> = new Map([
    [
      1,
      {
        name: 'Alice',
        personality: {
          traits: { openness: 0.8, boldness: 0.6, kindness: 0.9 },
          tags: ['curious', 'friendly', 'optimistic'],
          conversation_style: 'warm',
        },
      },
    ],
    [
      2,
      {
        name: 'Bob',
        personality: {
          traits: { openness: 0.4, boldness: 0.9, kindness: 0.5 },
          tags: ['confident', 'direct', 'competitive'],
          conversation_style: 'assertive',
        },
      },
    ],
  ]);

  async loadSession(sessionId: number): Promise<void> {
    // Mock session data
    this.session = {
      id: sessionId,
      world_id: 1,
      player_character_id: 1,
      current_location_id: 1,
      flags: {
        quests: {},
        inventory: { items: [] },
      },
      stats: {
        relationships: {
          'npc:1': {
            affinity: 75,
            trust: 60,
            chemistry: 80,
            tension: 20,
            flags: ['first_meeting', 'helped_with_task'],
            tierId: 'friend',
            intimacyLevelId: 'light_flirt',
          },
          'npc:2': {
            affinity: 40,
            trust: 30,
            chemistry: 20,
            tension: 60,
            flags: ['rivalry'],
            tierId: 'acquaintance',
            intimacyLevelId: null,
          },
        },
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.emit('sessionLoaded', { session: this.session });
  }

  getSession(): GameSession | null {
    return this.session;
  }

  getNpcRelationship(npcId: number): NpcRelationshipState | null {
    if (!this.session?.stats.relationships) return null;
    return this.session.stats.relationships[`npc:${npcId}`] || null;
  }

  updateNpcRelationship(
    npcId: number,
    patch: Partial<NpcRelationshipState>
  ): void {
    if (!this.session) return;

    // Ensure stats.relationships exists
    if (!this.session.stats.relationships) {
      this.session.stats.relationships = {};
    }

    const key = `npc:${npcId}`;
    const current = this.session.stats.relationships[key] || {
      affinity: 0,
      trust: 0,
      chemistry: 0,
      tension: 0,
      flags: [],
    };

    this.session.stats.relationships[key] = { ...current, ...patch };

    this.emit('relationshipChanged', {
      npcId,
      relationship: this.session.stats.relationships[key],
    });

    // Also emit brain change
    const brain = this.getNpcBrainState(npcId);
    if (brain) {
      this.emit('npcBrainChanged', { npcId, brain });
    }
  }

  getNpcBrainState(npcId: number): BrainState | null {
    const npc = this.mockNpcs.get(npcId);
    const relationship = this.getNpcRelationship(npcId);

    if (!npc) return null;

    // Derive mood from relationship state
    const mood = this.deriveMood(relationship);

    const memories = this.generateMockMemories(npcId, relationship);

    const stats: Record<string, BrainStatSnapshot> = {};
    const derived: Record<string, unknown> = {};

    // Personality stats (scale traits 0-1 to 0-100)
    const rawTraits = (npc.personality.traits || {}) as Record<
      string,
      number
    >;
    const personalityAxes: Record<string, number> = {};
    Object.entries(rawTraits).forEach(([key, value]) => {
      personalityAxes[key] = Math.round((value ?? 0) * 100);
    });
    stats['personality'] = {
      axes: personalityAxes,
      tiers: {},
      levelId: undefined,
      levelIds: [],
    };

    const personaTags: string[] = npc.personality.tags || [];
    if (personaTags.length > 0) {
      derived['persona_tags'] = personaTags;
    }
    if (npc.personality.conversation_style) {
      derived['conversation_style'] = npc.personality.conversation_style;
    }

    // Relationship stats
    if (relationship) {
      stats['relationships'] = {
        axes: {
          affinity: relationship.affinity,
          trust: relationship.trust,
          chemistry: relationship.chemistry,
          tension: relationship.tension,
        },
        tiers: {},
        levelId: relationship.tierId,
        levelIds: relationship.tierId ? [relationship.tierId] : [],
      };

      if (relationship.intimacyLevelId) {
        derived['intimacy_level'] = relationship.intimacyLevelId;
      }

      if (relationship.flags && relationship.flags.length > 0) {
        derived['relationship_flags'] = relationship.flags;
      }
    }

    // Mood stat + derived mood
    stats['mood'] = {
      axes: {
        valence: mood.valence,
        arousal: mood.arousal,
      },
      tiers: {},
      levelId: mood.label,
      levelIds: mood.label ? [mood.label] : [],
    };
    derived['mood'] = { ...mood, source: 'mock' };

    // Logic strategies
    const strategies = this.deriveStrategies(rawTraits);
    if (strategies.length > 0) {
      derived['logic_strategies'] = strategies;
    }

    // Instincts
    const instincts = this.deriveInstincts(personaTags);
    if (instincts.length > 0) {
      derived['instincts'] = instincts;
    }

    // Memories
    if (memories.length > 0) {
      derived['memories'] = memories;
    }

    return {
      npcId,
      worldId: 1,
      stats,
      derived,
      computedAt: Date.now(),
      sourcePackages: ['mock.personality', 'mock.relationships', 'mock.mood'],
    };
  }

  applyNpcBrainEdit(_npcId: number, _edit: Partial<BrainState>): void {
    // Mock implementation: BrainState is derived from internal session/personality,
    // so edits are not persisted. Emit current brain state for listeners.
    const npcIds = Array.from(this.mockNpcs.keys());
    npcIds.forEach((npcId) => {
      const brain = this.getNpcBrainState(npcId);
      if (brain) {
        this.emit('npcBrainChanged', { npcId, brain });
      }
    });
  }
    const brain = this.getNpcBrainState(npcId);
    if (brain) {
      this.emit('npcBrainChanged', { npcId, brain });
    }
  }

  on<K extends keyof CoreEventMap>(
    event: K,
    handler: EventHandler<K>
  ): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        handlers.delete(handler);
      }
    };
  }

  emit<K extends keyof CoreEventMap>(event: K, payload: CoreEventMap[K]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(payload));
    }
  }

  // Helper methods for deriving brain state

  private deriveMood(
    relationship: NpcRelationshipState | null
  ): { valence: number; arousal: number; label?: string } {
    if (!relationship) {
      return { valence: 50, arousal: 50, label: 'neutral' };
    }

    // Valence: 0-100, positive when affinity is high and tension is low
    const valence = Math.max(
      0,
      Math.min(100, relationship.affinity - relationship.tension * 0.5)
    );

    // Arousal: 0-100, increases with chemistry and tension
    const arousal = Math.max(
      0,
      Math.min(100, relationship.chemistry * 0.7 + relationship.tension * 0.3)
    );

    // Derive label from valence/arousal quadrants
    let label = 'neutral';
    if (valence >= 60 && arousal >= 60) label = 'excited';
    else if (valence >= 60 && arousal < 40) label = 'content';
    else if (valence < 40 && arousal >= 60) label = 'anxious';
    else if (valence < 40 && arousal < 40) label = 'down';

    return { valence, arousal, label };
  }

  private deriveStrategies(traits: Record<string, number>): string[] {
    const strategies: string[] = [];

    if (traits.openness > 0.6) strategies.push('exploratory');
    if (traits.boldness > 0.7) strategies.push('impulsive');
    else if (traits.boldness < 0.4) strategies.push('cautious');
    if (traits.kindness > 0.7) strategies.push('cooperative');
    else if (traits.kindness < 0.4) strategies.push('competitive');

    return strategies.length > 0 ? strategies : ['balanced'];
  }

  private deriveInstincts(tags: string[]): string[] {
    const instincts: string[] = [];

    if (tags.includes('curious')) instincts.push('exploratory');
    if (tags.includes('protective')) instincts.push('defensive');
    if (tags.includes('competitive')) instincts.push('ambitious');
    if (tags.includes('friendly')) instincts.push('social');

    return instincts.length > 0 ? instincts : ['survival'];
  }

  private generateMockMemories(
    npcId: number,
    relationship: NpcRelationshipState | null
  ): MockMemory[] {
    const memories: MockMemory[] = [];

    if (!relationship) return memories;

    // Generate memories based on flags
    relationship.flags.forEach((flag, index) => {
      memories.push({
        id: `memory-${npcId}-${index}`,
        timestamp: new Date(Date.now() - index * 86400000).toISOString(), // Days ago
        summary: this.flagToMemory(flag),
        tags: [flag],
        source: 'flag',
      });
    });

    return memories.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  private flagToMemory(flag: string): string {
    const memoryMap: Record<string, string> = {
      first_meeting: 'First time we met',
      helped_with_task: 'I helped them with an important task',
      rivalry: 'We had a competitive encounter',
      first_kiss: 'Our first kiss',
      conflict: 'We had a disagreement',
      gift: 'They gave me a gift',
    };

    return memoryMap[flag] || `Event: ${flag}`;
  }
}

// Export singleton instance for easy use
export const mockCore = new MockPixSim7Core();
