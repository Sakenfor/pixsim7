/**
 * Asset action descriptors for generation-related actions.
 *
 * These wrap the standalone lib functions in `assetGenerationActions.ts`
 * with the metadata each surface needs (id, label, icon, visibility).
 */

import { CAP_ASSET, CAP_GENERATION_WIDGET } from '@features/contextHub';
import { loadAssetToQuickGen, patchAssetToWidget } from '@features/generation/lib/assetGenerationActions';

import type { AssetModel } from '../models/asset';

import type { AssetActionDescriptor } from './types';

function hasGenerationContext(asset: AssetModel): boolean {
  return asset.hasGenerationContext === true || asset.sourceGenerationId != null;
}

export const loadToQuickGenDescriptor: AssetActionDescriptor<{ withoutSeed: boolean }> = {
  id: 'asset:load-to-quick-gen',
  defaultLabel: 'Load to Quick Gen',
  defaultIcon: 'rotate-ccw',
  requiredCapabilities: [CAP_ASSET, CAP_GENERATION_WIDGET],
  isVisible: hasGenerationContext,
  execute: (asset, { widget, fallbackOperationType, scopeId }, { withoutSeed }) =>
    loadAssetToQuickGen(asset, fallbackOperationType, { widget, scopeId, withoutSeed }),
};

export const patchAssetDescriptor: AssetActionDescriptor = {
  id: 'asset:patch-asset',
  defaultLabel: 'Patch Asset',
  defaultIcon: 'pencil',
  requiredCapabilities: [CAP_ASSET, CAP_GENERATION_WIDGET],
  isVisible: () => true,
  execute: (asset, { widget, fallbackOperationType, scopeId }) =>
    patchAssetToWidget(asset, fallbackOperationType, { widget, scopeId }),
};
