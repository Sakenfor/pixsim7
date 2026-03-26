/**
 * @deprecated Use `buildLocalAssetModel` from `../types/localFolderMeta` instead.
 *
 * This file now re-exports from the new location for backward compatibility.
 * The store already converts at the boundary — callers should use the
 * LocalAssetModel directly (it extends AssetModel).
 */

export { hashStringToStableNegativeId } from '../types/localFolderMeta';
