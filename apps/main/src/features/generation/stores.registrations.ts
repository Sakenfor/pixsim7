/**
 * Generation feature — store registry declarations.
 *
 * Side-effect module imported eagerly at app bootstrap so the store registry
 * knows about deprecated patterns / managed prefixes before `pruneOrphans`
 * runs. Kept separate from heavier component modules so we don't pull in
 * full component trees during bootstrap.
 */

import { registerDeprecatedKeys } from '@lib/stores';

import { useQuickGenOpenersStore } from './stores/quickGenOpenersStore';

// QuickGenWidget v2 layout scheme bucketed layouts per operationType, leaving
// stale arrangements that could resurface after HMR. The new scheme keys only
// by layout shape — old per-op entries should be wiped.
registerDeprecatedKeys([/^dockview:[^:]+:(v2|v2t):(with-asset|no-asset):.+$/]);

// ── Built-in "Open With" surfaces ──────────────────────────────────────────
// Viewer + placeable Quick Gen panel registered as global openers so they're
// targetable from anywhere — even while unmounted. Unlike Control Center (a
// singleton dock that registers its own opener while mounted), opening these
// needs the target asset, so they live here as global, asset-aware openers.
// Dynamic imports keep the viewer/workspace/asset trees out of the bootstrap
// path and avoid feature import cycles. When a surface IS mounted it wins as a
// live capability provider; these only fill in the unmounted case.
useQuickGenOpenersStore.getState().register({
  widgetId: 'viewerQuickGenerate',
  label: 'Viewer Quick Generate',
  order: 20,
  open: (ctx) => {
    const asset = ctx?.asset;
    if (!asset) return;
    void import('@features/assets').then(({ toViewerAsset, useAssetViewerStore }) => {
      const viewerAsset = toViewerAsset(asset);
      useAssetViewerStore.getState().openViewer(viewerAsset, [viewerAsset]);
    });
  },
});

useQuickGenOpenersStore.getState().register({
  widgetId: 'panelQuickGenerate',
  label: 'Quick Gen Panel',
  order: 30,
  open: (ctx) => {
    const asset = ctx?.asset;
    void Promise.all([
      import('@features/workspace'),
      import('@features/assets'),
    ]).then(([{ openFloatingWorkspacePanel }, { toViewerAsset }]) => {
      openFloatingWorkspacePanel(
        'quick-generate',
        asset ? { context: { currentAsset: toViewerAsset(asset) } } : undefined,
      );
    });
  },
});
