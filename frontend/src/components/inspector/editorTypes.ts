/**
 * Centralized type definitions for all node editors
 * This file eliminates duplicate interface definitions across editor components
 */

import type { DraftSceneNode } from '../../modules/scene-builder';

/**
 * Standard props interface for all node editors
 * Import this instead of defining locally
 */
export interface NodeEditorProps {
  node: DraftSceneNode;
  onUpdate: (patch: Partial<DraftSceneNode>) => void;
}

/**
 * Choice configuration stored in metadata.choiceConfig
 */
export interface Choice {
  id: string;
  text: string;
  targetNodeId?: string;
  color?: string;
}

export interface ChoiceConfig {
  choices: Choice[];
}

/**
 * Condition configuration stored in metadata.conditionConfig
 */
export interface Condition {
  variable: string;
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=';
  value: string;
}

export interface ConditionConfig {
  conditions: Condition[];
  logicMode: 'AND' | 'OR';
}

/**
 * End node configuration stored in metadata.endConfig
 */
export interface EndConfig {
  endType: 'success' | 'failure' | 'neutral';
  message: string;
}

/**
 * Video node configuration stored in metadata.videoConfig
 */
export interface VideoConfig {
  selectionKind: 'ordered' | 'random' | 'pool';
  filterTags: string;
  progressionSteps: Array<{ label: string; segmentIds: string }>;
  selectedAssetIds: string[];
  // Life Sim metadata
  advanceMinutes?: number;
  npcId?: number;
  speakerRole?: string;
  npcState?: string;
}

/**
 * Mini-game configuration stored in metadata.miniGameConfig
 */
export interface MiniGameConfig {
  gameType: 'reflex' | 'memory' | 'puzzle' | 'sceneGizmo';
  rounds: number;
  difficulty: 'easy' | 'medium' | 'hard';
  timeLimit: number;
  gizmoConfig?: {
    type: string;
    zoneCount: number;
  };
}

/**
 * Seduction node configuration stored in metadata.seductionConfig
 */
export interface SeductionStage {
  id: string;
  name: string;
  description: string;
  requiredAffinity: number;
  successMessage?: string;
  failureMessage?: string;
}

export interface SeductionConfig {
  stages: SeductionStage[];
  currentStage: number;
  affinityCheckFlag: string;
  allowRetry: boolean;
}

/**
 * Validation result type
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}
