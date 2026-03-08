/**
 * Narrative Feature Module
 *
 * Unified narrative program schema for dialogue trees, action blocks,
 * scene transitions, and player choices.
 *
 * @example
 * ```typescript
 * // Import from barrel
 * import { NarrativeProgramId, DialogueNode } from '@features/narrative';
 *
 * // Or use namespace pattern
 * import { Narrative } from '@features/narrative';
 * const programId: Narrative.NarrativeProgramId = 'intro_scene';
 * ```
 */

import * as Narrative from './lib/types';

// ============================================================================
// Types - Narrative Runtime Schema
// ============================================================================

export type {
  NarrativeProgramId,
  NodeId,
  NarrativeProgramKind,
  ContentRating,
  ConditionExpression,
  StateEffects,
  NarrativeNodeBase,
  DialogueNode,
  ChoiceNode,
  ActionNode,
  ActionBlockNode,
  SceneTransitionNode,
  BranchNode,
  WaitNode,
  ExternalCallNode,
  CommentNode,
  NarrativeNode,
  NarrativeEdge,
  NarrativeProgram,
  NarrativeRuntimeState,
  NarrativeStepResult,
  StartProgramRequest,
  StepProgramRequest,
  NarrativeExecutionResponse,
  ValidationError,
  ValidationResult,
} from './lib/types';

// ============================================================================
// Namespace Export (for clean imports)
// ============================================================================

export { Narrative };
