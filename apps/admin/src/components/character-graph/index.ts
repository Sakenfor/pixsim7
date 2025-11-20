/**
 * Character Graph Components
 *
 * Interactive tools for exploring the character identity graph.
 */

export { CharacterGraphBrowser } from './CharacterGraphBrowser';
export { SceneCharacterViewer } from './SceneCharacterViewer';

// Re-export types from @pixsim7/types for convenience
export type {
  CharacterIdentityGraph,
  CharacterGraphNodeUnion,
  CharacterGraphEdge,
  CharacterUsageStats,
  CharacterGraphQueryOptions,
} from '@pixsim7/shared.types';
