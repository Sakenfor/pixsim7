/**
 * Active add-target overlay widgets.
 *
 * Single source of truth for the per-set toggle glyphs shown on a media card's
 * hover overlay. The gallery (RemoteGallerySource) and the viewer
 * (useOverlayWidgetsForAsset) both render asset cards and must show the same
 * affordance, so they share this builder instead of hand-rolling it twice and
 * drifting (cf. the media-card-fresh-asset-ref surface-drift history).
 *
 * One glyph per active target set: green (member, always visible) or grey
 * (addable, hover-only). Clicking toggles membership — silent remove, reversible
 * by clicking again. See plan `sets-multi-target-add`.
 */
import { buildTargetToggleWidget } from '@lib/ui/overlay';
import type { OverlayWidget } from '@lib/ui/overlay';

import type { AssetSet, ManualAssetSet } from '../stores/assetSetStore';
import { useAssetSetStore } from '../stores/assetSetStore';

/**
 * Resolve the ordered active-target ids to the loaded manual sets, dropping any
 * that are missing or smart (membership ops apply to manual sets only).
 */
export function selectActiveTargetSets(
  sets: AssetSet[],
  activeManualSetIds: number[],
): ManualAssetSet[] {
  return activeManualSetIds
    .map((id) => sets.find((s) => s.id === id))
    .filter((s): s is ManualAssetSet => s?.kind === 'manual');
}

/** Build one toggle glyph per active target set for the given asset. */
export function buildActiveTargetWidgets(
  assetId: number,
  activeSets: ManualAssetSet[],
): OverlayWidget[] {
  return activeSets.map((set) => {
    const isMember = set.assetIds.includes(assetId);
    return buildTargetToggleWidget(
      () => {
        const store = useAssetSetStore.getState();
        if (isMember) void store.removeAssetsFromSet(set.id, [assetId]);
        else void store.addAssetsToSet(set.id, [assetId]);
      },
      {
        id: `target-toggle-${set.id}`,
        isMember,
        icon: set.icon,
        tooltip: isMember ? `In "${set.name}" — click to remove` : `Add to "${set.name}"`,
      },
    );
  });
}
