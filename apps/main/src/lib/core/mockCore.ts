/**
 * Mock implementation of PixSim7Core for testing
 * This will be replaced with the real headless@pixsim7/game.engine package
 */

import {
  PixSim7Core,
  GameSession,
  NpcRelationshipState,
  NpcBrainState,
  CoreEventMap,
  NpcMemory,
} from './types';

type EventHandler<K extends keyof CoreEventMap> = (
  payload: CoreEventMap[K]
) => void;

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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.emit('sessionLoaded', { session: this.session });
  }

  getSession(): GameSession | null {
    return this.session;
  }

  getNpcRelationship(npcId: number): NpcRelationshipState | null {
    if (!this.session) return null;
    return this.session.relationships[`npc:${npcId}`] || null;
  }

  updateNpcRelationship(
    npcId: number,
    patch: Partial<NpcRelationshipState>
  ): void {
    if (!this.session) return;

    const key = `npc:${npcId}`;
    const current = this.session.relationships[key] || {
      affinity: 0,
      trust: 0,
      chemistry: 0,
      tension: 0,
      flags: [],
    };

    this.session.relationships[key] = { ...current, ...patch };

    this.emit('relationshipChanged', {
      npcId,
      relationship: this.session.relationships[key],
    });

    // Also emit brain change
    const brain = this.getNpcBrainState(npcId);
    if (brain) {
      this.emit('npcBrainChanged', { npcId, brain });
    }
  }

  getNpcBrainState(npcId: number): NpcBrainState | null {
    const npc = this.mockNpcs.get(npcId);
    const relationship = this.getNpcRelationship(npcId);

    if (!npc) return null;

    // Derive mood from relationship state
    const mood = this.deriveMood(relationship);

    // Generate mock memories
    const memories = this.generateMockMemories(npcId, relationship);

    return {
      // Cortex
      traits: npc.personality.traits || {},
      personaTags: npc.personality.tags || [],
      conversationStyle: npc.personality.conversation_style,

      // Memory
      memories,

      // Emotion
      mood,

      // Logic (derived from personality)
      logic: {
        strategies: this.deriveStrategies(npc.personality.traits),
      },

      // Instinct (derived from tags)
      instincts: this.deriveInstincts(npc.personality.tags),

      // Social
      social: relationship || {
        affinity: 0,
        trust: 0,
        chemistry: 0,
        tension: 0,
        flags: [],
      },
    };
  }

  applyNpcBrainEdit(npcId: number, edit: Partial<NpcBrainState>): void {
    // Update relationship if social changed
    if (edit.social) {
      this.updateNpcRelationship(npcId, edit.social);
    }

    // Update NPC personality if traits changed
    if (edit.traits || edit.personaTags || edit.conversationStyle) {
      const npc = this.mockNpcs.get(npcId);
      if (npc) {
        npc.personality = {
          ...npc.personality,
          ...(edit.traits && { traits: edit.traits }),
          ...(edit.personaTags && { tags: edit.personaTags }),
          ...(edit.conversationStyle && {
            conversation_style: edit.conversationStyle,
          }),
        };
      }
    }

    // Emit brain change
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

  private deriveMood(relationship: NpcRelationshipState | null): {
    valence: number;
    arousal: number;
    label?: string;
  } {
    if (!relationship) {
      return { valence: 0, arousal: 0, label: 'neutral' };
    }

    // Valence: positive/negative based on affinity and tension
    const valence = (relationship.affinity - relationship.tension) / 100;

    // Arousal: excitement based on chemistry
    const arousal = relationship.chemistry / 100;

    // Derive label
    let label = 'neutral';
    if (valence > 0.5 && arousal > 0.5) label = 'excited';
    else if (valence > 0.5 && arousal < 0.3) label = 'content';
    else if (valence < -0.3 && arousal > 0.5) label = 'angry';
    else if (valence < -0.3 && arousal < 0.3) label = 'sad';
    else if (arousal > 0.7) label = 'anxious';

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
  ): NpcMemory[] {
    const memories: NpcMemory[] = [];

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
