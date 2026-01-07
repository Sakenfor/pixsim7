/**
 * Effect Applicator for Narrative Runtime
 *
 * Applies StateEffects to game session state.
 * Handles relationship changes, flag updates, arc/quest progression,
 * inventory modifications, and event triggers.
 *
 * All operations are immutable - returns a new session object.
 *
 * @example
 * const effects: StateEffects = {
 *   relationship: { affinity: 10, trust: 5 },
 *   flags: { set: { "met_in_garden": true } },
 *   arcs: { "romance_alex": "stage_2" },
 * };
 * const newSession = applyEffects(effects, session, npcId);
 */

import type { GameSessionDTO } from '@pixsim7/shared.types';
import type { StateEffects } from '@pixsim7/shared.types';
import {
  getNpcRelationshipState,
  setNpcRelationshipState,
  setArcState,
  setQuestState,
  addInventoryItem,
  removeInventoryItem,
  setEventState,
} from '../session/state';

/**
 * Result of applying effects.
 */
export interface ApplyEffectsResult {
  /** Updated session state */
  session: GameSessionDTO;

  /** Summary of changes made */
  changes: {
    relationship?: {
      affinity?: { from: number; to: number };
      trust?: { from: number; to: number };
      chemistry?: { from: number; to: number };
      tension?: { from: number; to: number };
    };
    flags?: {
      set?: string[];
      deleted?: string[];
      incremented?: string[];
    };
    arcs?: string[];
    quests?: string[];
    inventory?: {
      added?: string[];
      removed?: string[];
    };
    events?: {
      triggered?: string[];
      ended?: string[];
    };
  };
}

/**
 * Deep clone a session object.
 */
function cloneSession(session: GameSessionDTO): GameSessionDTO {
  return {
    ...session,
    flags: JSON.parse(JSON.stringify(session.flags)),
    stats: JSON.parse(JSON.stringify(session.stats)),
  };
}

/**
 * Clamp a value to the 0-100 range.
 */
function clamp(value: number, min: number = 0, max: number = 100): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Set a nested value in an object using dot-notation path.
 */
function setNestedValue(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Delete a nested value from an object using dot-notation path.
 */
function deleteNestedValue(obj: any, path: string): boolean {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      return false;
    }
    current = current[part];
  }

  const lastPart = parts[parts.length - 1];
  if (lastPart in current) {
    delete current[lastPart];
    return true;
  }
  return false;
}

/**
 * Get a nested value from an object using dot-notation path.
 */
function getNestedValue(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }

  return current;
}

/**
 * Apply StateEffects to a game session.
 *
 * @param effects - Effects to apply
 * @param session - Current session state
 * @param npcId - NPC ID for relationship effects
 * @returns Result with updated session and change summary
 */
export function applyEffects(
  effects: StateEffects | undefined,
  session: GameSessionDTO,
  npcId: number
): ApplyEffectsResult {
  if (!effects) {
    return { session, changes: {} };
  }

  let newSession = cloneSession(session);
  const changes: ApplyEffectsResult['changes'] = {};

  // 1. Apply relationship effects
  if (effects.relationship) {
    const current = getNpcRelationshipState(newSession, npcId);
    const relationshipChanges: ApplyEffectsResult['changes']['relationship'] = {};

    const oldValues = {
      affinity: current?.values.affinity ?? 0,
      trust: current?.values.trust ?? 0,
      chemistry: current?.values.chemistry ?? 0,
      tension: current?.values.tension ?? 0,
    };

    const patchValues: Record<string, number> = {};

    if (effects.relationship.affinity !== undefined) {
      const newValue = clamp(oldValues.affinity + effects.relationship.affinity);
      patchValues.affinity = newValue;
      relationshipChanges.affinity = { from: oldValues.affinity, to: newValue };
    }

    if (effects.relationship.trust !== undefined) {
      const newValue = clamp(oldValues.trust + effects.relationship.trust);
      patchValues.trust = newValue;
      relationshipChanges.trust = { from: oldValues.trust, to: newValue };
    }

    if (effects.relationship.chemistry !== undefined) {
      const newValue = clamp(oldValues.chemistry + effects.relationship.chemistry);
      patchValues.chemistry = newValue;
      relationshipChanges.chemistry = { from: oldValues.chemistry, to: newValue };
    }

    if (effects.relationship.tension !== undefined) {
      const newValue = clamp(oldValues.tension + effects.relationship.tension);
      patchValues.tension = newValue;
      relationshipChanges.tension = { from: oldValues.tension, to: newValue };
    }

    if (Object.keys(patchValues).length > 0) {
      newSession = setNpcRelationshipState(newSession, npcId, { values: patchValues });
      changes.relationship = relationshipChanges;
    }
  }

  // 2. Apply flag effects
  if (effects.flags) {
    const flagChanges: ApplyEffectsResult['changes']['flags'] = {};
    const flags = newSession.flags as Record<string, any>;

    // Set flags
    if (effects.flags.set) {
      flagChanges.set = [];
      for (const [path, value] of Object.entries(effects.flags.set)) {
        setNestedValue(flags, path, value);
        flagChanges.set.push(path);
      }
    }

    // Delete flags
    if (effects.flags.delete) {
      flagChanges.deleted = [];
      for (const path of effects.flags.delete) {
        if (deleteNestedValue(flags, path)) {
          flagChanges.deleted.push(path);
        }
      }
    }

    // Increment flags
    if (effects.flags.increment) {
      flagChanges.incremented = [];
      for (const [path, delta] of Object.entries(effects.flags.increment)) {
        const current = getNestedValue(flags, path);
        const deltaNum = typeof delta === 'number' ? delta : 0;
        const newValue = (typeof current === 'number' ? current : 0) + deltaNum;
        setNestedValue(flags, path, newValue);
        flagChanges.incremented.push(path);
      }
    }

    if (flagChanges.set?.length || flagChanges.deleted?.length || flagChanges.incremented?.length) {
      changes.flags = flagChanges;
    }
  }

  // 3. Apply arc effects
  if (effects.arcs) {
    changes.arcs = [];
    for (const [arcId, newStage] of Object.entries(effects.arcs)) {
      // Narrative effects use strings, ArcState.stage is number
      // Convert string stages to numbers if possible, otherwise store as custom key
      const stageValue = String(newStage);
      const stageNum = parseInt(stageValue, 10);
      if (!isNaN(stageNum)) {
        newSession = setArcState(newSession, arcId, { stage: stageNum });
      } else {
        // String stage names - store in custom stageName field
        newSession = setArcState(newSession, arcId, { stage: 0, stageName: stageValue } as any);
      }
      changes.arcs.push(arcId);
    }
  }

  // 4. Apply quest effects
  if (effects.quests) {
    changes.quests = [];
    for (const [questId, status] of Object.entries(effects.quests)) {
      // Map status to QuestState status
      let questStatus: 'not_started' | 'in_progress' | 'completed' | 'failed';
      if (status === 'active') {
        questStatus = 'in_progress';
      } else if (status === 'completed') {
        questStatus = 'completed';
      } else if (status === 'failed') {
        questStatus = 'failed';
      } else {
        questStatus = 'not_started';
      }
      newSession = setQuestState(newSession, questId, { status: questStatus });
      changes.quests.push(questId);
    }
  }

  // 5. Apply inventory effects
  if (effects.inventory) {
    const inventoryChanges: ApplyEffectsResult['changes']['inventory'] = {};

    // Add items
    if (effects.inventory.add) {
      inventoryChanges.added = [];
      for (const item of effects.inventory.add) {
        newSession = addInventoryItem(newSession, item.itemId, item.quantity ?? 1);
        inventoryChanges.added.push(item.itemId);
      }
    }

    // Remove items
    if (effects.inventory.remove) {
      inventoryChanges.removed = [];
      for (const item of effects.inventory.remove) {
        const result = removeInventoryItem(newSession, item.itemId, item.quantity ?? 1);
        if (result) {
          newSession = result;
          inventoryChanges.removed.push(item.itemId);
        }
      }
    }

    if (inventoryChanges.added?.length || inventoryChanges.removed?.length) {
      changes.inventory = inventoryChanges;
    }
  }

  // 6. Apply event effects
  if (effects.events) {
    const eventChanges: ApplyEffectsResult['changes']['events'] = {};

    // Trigger events
    if (effects.events.trigger) {
      eventChanges.triggered = [];
      for (const eventId of effects.events.trigger) {
        newSession = setEventState(newSession, eventId, true, { triggeredAt: Date.now() });
        eventChanges.triggered.push(eventId);
      }
    }

    // End events
    if (effects.events.end) {
      eventChanges.ended = [];
      for (const eventId of effects.events.end) {
        newSession = setEventState(newSession, eventId, false);
        eventChanges.ended.push(eventId);
      }
    }

    if (eventChanges.triggered?.length || eventChanges.ended?.length) {
      changes.events = eventChanges;
    }
  }

  // 7. Apply component effects (ECS components - pass through to flags for now)
  if (effects.components) {
    const flags = newSession.flags as Record<string, any>;
    const npcKey = `npc:${npcId}`;

    if (!flags.npcs) flags.npcs = {};
    if (!flags.npcs[npcKey]) flags.npcs[npcKey] = {};
    if (!flags.npcs[npcKey].components) flags.npcs[npcKey].components = {};

    for (const [componentName, componentData] of Object.entries(effects.components)) {
      const existing = flags.npcs[npcKey].components[componentName] || {};
      const newData = componentData && typeof componentData === 'object' ? componentData : {};
      flags.npcs[npcKey].components[componentName] = {
        ...existing,
        ...(newData as Record<string, any>),
      };
    }
  }

  return { session: newSession, changes };
}

/**
 * Merge multiple StateEffects into one.
 * Later effects override earlier ones for the same keys.
 */
export function mergeEffects(...effectsList: (StateEffects | undefined)[]): StateEffects {
  const merged: StateEffects = {};

  for (const effects of effectsList) {
    if (!effects) continue;

    // Merge relationship (additive for deltas)
    if (effects.relationship) {
      if (!merged.relationship) merged.relationship = {};
      if (effects.relationship.affinity !== undefined) {
        merged.relationship.affinity = (merged.relationship.affinity ?? 0) + effects.relationship.affinity;
      }
      if (effects.relationship.trust !== undefined) {
        merged.relationship.trust = (merged.relationship.trust ?? 0) + effects.relationship.trust;
      }
      if (effects.relationship.chemistry !== undefined) {
        merged.relationship.chemistry = (merged.relationship.chemistry ?? 0) + effects.relationship.chemistry;
      }
      if (effects.relationship.tension !== undefined) {
        merged.relationship.tension = (merged.relationship.tension ?? 0) + effects.relationship.tension;
      }
    }

    // Merge flags (later overwrites)
    if (effects.flags) {
      if (!merged.flags) merged.flags = {};
      if (effects.flags.set) {
        merged.flags.set = { ...merged.flags.set, ...effects.flags.set };
      }
      if (effects.flags.delete) {
        merged.flags.delete = [...(merged.flags.delete ?? []), ...effects.flags.delete];
      }
      if (effects.flags.increment) {
        if (!merged.flags.increment) merged.flags.increment = {};
        for (const [key, delta] of Object.entries(effects.flags.increment)) {
          merged.flags.increment[key] = (merged.flags.increment[key] ?? 0) + delta;
        }
      }
    }

    // Merge arcs (later overwrites)
    if (effects.arcs) {
      merged.arcs = { ...merged.arcs, ...effects.arcs };
    }

    // Merge quests (later overwrites)
    if (effects.quests) {
      merged.quests = { ...merged.quests, ...effects.quests };
    }

    // Merge inventory (accumulate)
    if (effects.inventory) {
      if (!merged.inventory) merged.inventory = {};
      if (effects.inventory.add) {
        merged.inventory.add = [...(merged.inventory.add ?? []), ...effects.inventory.add];
      }
      if (effects.inventory.remove) {
        merged.inventory.remove = [...(merged.inventory.remove ?? []), ...effects.inventory.remove];
      }
    }

    // Merge events (accumulate)
    if (effects.events) {
      if (!merged.events) merged.events = {};
      if (effects.events.trigger) {
        merged.events.trigger = [...(merged.events.trigger ?? []), ...effects.events.trigger];
      }
      if (effects.events.end) {
        merged.events.end = [...(merged.events.end ?? []), ...effects.events.end];
      }
    }

    // Merge components (deep merge)
    if (effects.components) {
      if (!merged.components) merged.components = {};
      for (const [key, value] of Object.entries(effects.components)) {
        const existing = merged.components[key] || {};
        const newValue = value && typeof value === 'object' ? value : {};
        merged.components[key] = { ...existing, ...(newValue as Record<string, any>) };
      }
    }
  }

  return merged;
}
