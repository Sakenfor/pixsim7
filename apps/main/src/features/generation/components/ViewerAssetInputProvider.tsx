/**
 * ViewerAssetInputProvider
 *
 * Widget chrome component that provides CAP_ASSET_INPUT capability for a single asset.
 * Use this in widget headers to make the viewed/selected asset available to generation panels.
 *
 * Usage: Render inside a GenerationScopeProvider alongside panels that consume CAP_ASSET_INPUT.
 */

import { resolveMediaType } from '@pixsim7/shared.assets-core';
import { Ref } from '@pixsim7/ref-core';
import type { AssetRef } from '@pixsim7/shared.types';

import type { ViewerAsset } from '@features/assets';
import {
  CAP_ASSET_INPUT,
  useProvideCapability,
  type AssetInputContext,
} from '@features/contextHub';
import { useScopeInstanceId, resolveCapabilityScopeFromScopeInstanceId } from '@features/panels';


export interface ViewerAssetInputProviderProps {
  /** The asset to provide as input */
  asset: ViewerAsset | null;
  /** Override the scope for capability registration */
  scope?: 'root' | 'local';
}

/**
 * Provides CAP_ASSET_INPUT capability for a single viewed asset.
 * Renders nothing - just registers the capability.
 */
export function ViewerAssetInputProvider({
  asset,
  scope,
}: ViewerAssetInputProviderProps) {
  const scopeInstanceId = useScopeInstanceId('generation');
  const capabilityScope = scope ?? resolveCapabilityScopeFromScopeInstanceId(scopeInstanceId);

  useProvideCapability<AssetInputContext>(
    CAP_ASSET_INPUT,
    {
      id: 'viewer:asset-input',
      label: 'Asset Input',
      priority: 40,
      isAvailable: () => !!asset,
      getValue: () => {
        const id = asset ? Number(asset.id) : NaN;
        const ref = Number.isFinite(id) ? Ref.asset(id) : null;
        const refs = ref ? ([ref] as AssetRef[]) : [];
        const resolvedType = resolveMediaType(asset);
        const types =
          resolvedType === 'image' || resolvedType === 'video'
            ? [resolvedType]
            : [];

        return {
          assets: asset ? [asset] : [],
          supportsMulti: false,
          ref,
          refs,
          selection: {
            count: refs.length,
            min: 0,
            max: 1,
            mode: 'single',
          },
          constraints: {
            types: types.length > 0 ? types : undefined,
            canMixTypes: false,
          },
          status:
            refs.length > 0
              ? { ready: true }
              : { ready: false, reason: 'Select an asset to generate from.' },
        };
      },
    },
    [asset],
    { scope: capabilityScope }
  );

  return null;
}
