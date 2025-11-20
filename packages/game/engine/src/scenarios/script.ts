/**
 * Scenario Script Model
 *
 * Defines a simple DSL for describing sequences of actions in headless scenarios.
 */

import { WorldSnapshot } from './snapshot';

/**
 * Tick step - advance world time
 */
export interface TickStep {
  kind: 'tick';
  worldId: number;
  deltaSeconds: number;
}

/**
 * Interaction step - execute an interaction with an NPC
 */
export interface InteractionStep {
  kind: 'interaction';
  worldId: number;
  sessionId: number;
  npcId: number;
  interactionId: string;
  params?: Record<string, unknown>;
}

/**
 * Narrative step - advance narrative runtime
 */
export interface NarrativeStep {
  kind: 'narrativeStep';
  worldId: number;
  sessionId: number;
  npcId: number;
  input?: unknown;
}

/**
 * Assert step - checkpoint for assertions
 */
export interface AssertStep {
  kind: 'assert';
  assertId: string;
  description?: string;
}

/**
 * Union of all scenario step types
 */
export type ScenarioStep = TickStep | InteractionStep | NarrativeStep | AssertStep;

/**
 * Complete scenario script
 */
export interface ScenarioScript {
  id: string;
  name: string;
  description?: string;
  snapshot: WorldSnapshot;
  steps: ScenarioStep[];
}

/**
 * Scenario script metadata (without full snapshot/steps)
 */
export interface ScenarioScriptMetadata {
  id: string;
  name: string;
  description?: string;
  worldId: number;
  stepCount: number;
  assertCount: number;
}

/**
 * Helper to extract metadata from a scenario script
 */
export function extractScenarioMetadata(script: ScenarioScript): ScenarioScriptMetadata {
  return {
    id: script.id,
    name: script.name,
    description: script.description,
    worldId: script.snapshot.worldId,
    stepCount: script.steps.length,
    assertCount: script.steps.filter(s => s.kind === 'assert').length,
  };
}
