/**
 * Asset viewer panel keyboard actions, registered as capability actions so
 * shortcuts are user-editable via the settings UI. Each action gates on
 * `useAssetViewerStore.mode !== 'closed'` so the bare-letter shortcuts
 * (F/I) don't fire outside the viewer.
 *
 * Migrated from a raw `window.addEventListener('keydown', ...)` inside
 * `AssetViewerPanel.tsx`. Benefits: inherits the input-focus gate in
 * `useKeyboardShortcuts` (so F/I don't hijack typing, including in
 * contenteditable which the old raw listener missed), participates in
 * shortcut dedupe, and is user-rebindable.
 *
 * Single-instance surface (the viewer is a singleton panel), so this does
 * NOT use the `activeTargetActions` factory — that pattern is for
 * per-instance fan-out (media cards etc.).
 */

import type { ActionDefinition } from '@pixsim7/shared.types';

import {
  registerAction,
  registerFeature,
  toActionCapability,
  unregisterAction,
  unregisterFeature,
} from '@lib/capabilities';

import { useAssetViewerStore } from '@features/assets';

const FEATURE_ID = 'asset-viewer.panel';

const isViewerOpen = () => useAssetViewerStore.getState().mode !== 'closed';

const VIEWER_ACTIONS: ActionDefinition[] = [
  {
    id: 'asset-viewer.close',
    featureId: FEATURE_ID,
    title: 'Close viewer',
    description: 'Close the asset viewer',
    shortcut: 'Escape',
    execute: () => useAssetViewerStore.getState().closeViewer(),
    enabled: isViewerOpen,
  },
  {
    id: 'asset-viewer.prev',
    featureId: FEATURE_ID,
    title: 'Previous asset',
    description: 'Navigate to the previous asset in the viewer list',
    shortcut: 'ArrowLeft',
    execute: () => {
      const s = useAssetViewerStore.getState();
      if (s.currentIndex > 0) s.navigatePrev();
    },
    enabled: () => {
      const s = useAssetViewerStore.getState();
      return s.mode !== 'closed' && s.currentIndex > 0;
    },
  },
  {
    id: 'asset-viewer.next',
    featureId: FEATURE_ID,
    title: 'Next asset',
    description: 'Navigate to the next asset in the viewer list',
    shortcut: 'ArrowRight',
    execute: () => {
      const s = useAssetViewerStore.getState();
      if (s.currentIndex < s.assetList.length - 1) s.navigateNext();
    },
    enabled: () => {
      const s = useAssetViewerStore.getState();
      return s.mode !== 'closed' && s.currentIndex < s.assetList.length - 1;
    },
  },
  {
    id: 'asset-viewer.fullscreen',
    featureId: FEATURE_ID,
    title: 'Toggle fullscreen',
    description: 'Toggle viewer fullscreen mode',
    shortcut: 'F',
    execute: () => useAssetViewerStore.getState().toggleFullscreen(),
    enabled: isViewerOpen,
  },
  {
    id: 'asset-viewer.metadata',
    featureId: FEATURE_ID,
    title: 'Toggle metadata',
    description: 'Toggle the asset metadata panel',
    shortcut: 'I',
    execute: () => useAssetViewerStore.getState().toggleMetadata(),
    enabled: isViewerOpen,
  },
];

let registered = false;

export function registerViewerPanelCapabilityActions(): void {
  if (registered) return;
  registerFeature({
    id: FEATURE_ID,
    name: 'Asset Viewer',
    description: 'Keyboard shortcuts for the asset viewer panel.',
    icon: 'eye',
    category: 'utility',
  });
  for (const action of VIEWER_ACTIONS) {
    registerAction(toActionCapability(action));
  }
  registered = true;
}

export function unregisterViewerPanelCapabilityActions(): void {
  if (!registered) return;
  for (const action of VIEWER_ACTIONS) {
    unregisterAction(action.id);
  }
  unregisterFeature(FEATURE_ID);
  registered = false;
}
