/**
 * @pixsim7/plugin-romance - Frontend Types
 *
 * Re-exports shared types for frontend use.
 * The actual gizmo tools (caress, feather, silk, etc.) remain in
 * apps/main/src/features/gizmos/lib/core/registry-romance.ts
 * as they are UI concerns.
 */

// Re-export all shared types
export * from '../shared/types';

// Re-export specific types commonly used in frontend
export type {
  SensualTouchConfig,
  SensualTouchRequest,
  SensualTouchResponse,
  NpcRomancePreferences,
  RomanceComponent,
  TouchToolId,
  TouchPattern,
  RomanceStage,
} from '../shared/types';
