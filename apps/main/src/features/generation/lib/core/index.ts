/**
 * Generation Library Exports
 */

// Asset input types (asset ID resolution pattern)
export type { AssetInput } from '@pixsim7/shared.generation.core';
export { hasAssetIdParams, extractAssetInput } from '@pixsim7/shared.generation.core';

// Asset resolver for ActionBlocks / DSL → Assets (Task 99.2)
export * from './assetResolver';

// Generation status configuration
export * from './generationStatusConfig';
