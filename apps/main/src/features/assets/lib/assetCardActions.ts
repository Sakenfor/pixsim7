/**
 * Asset Card Actions - Re-export from shared package with app-specific types
 * @deprecated Import from @pixsim7/shared.assets.core instead
 */
import type {
  AssetActionHandlers as GenericAssetActionHandlers,
  AssetActions as GenericAssetActions,
} from '@pixsim7/shared.assets.core';

import type { AssetModel } from '../models/asset';

export { createAssetActions, type MinimalAsset } from '@pixsim7/shared.assets.core';

// App-specific type aliases for backwards compatibility
export type AssetActionHandlers = GenericAssetActionHandlers<AssetModel>;
export type AssetActions = GenericAssetActions;
