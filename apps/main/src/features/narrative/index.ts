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
 * import { Types } from '@features/narrative';
 * const programId: Types.NarrativeProgramId = 'intro_scene';
 * ```
 */

// ============================================================================
// Types - Narrative Runtime Schema
// ============================================================================

export * from './lib/types';

// ============================================================================
// Namespace Export (for clean imports)
// ============================================================================

export * as Types from './lib/types';
