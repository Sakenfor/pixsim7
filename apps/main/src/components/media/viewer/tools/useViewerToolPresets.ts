/**
 * useViewerToolPresets
 *
 * Resolves available ViewerToolPresets for the current viewer context.
 * Combines built-in manual presets with dynamically discovered presets
 * from analyzers (and later, providers).
 *
 * Returns presets with resolved availability so the UI can render
 * disabled states with reasons.
 */

import { useMemo } from 'react';

import { analyzersToPresets, type AnalyzerCatalogEntry } from './analyzerPresetBridge';
import type { ViewerToolPreset, PresetAvailability } from './viewerToolPresets';
import {
  PRESET_MANUAL_DRAW,
  PRESET_MANUAL_POLYGON,
  resolvePresetAvailability,
  isMaskPreset,
} from './viewerToolPresets';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolvedPreset {
  preset: ViewerToolPreset;
  availability: PresetAvailability;
}

export interface ViewerToolPresetsResult {
  /** All resolved presets (mask + edit categories in B1). */
  all: ResolvedPreset[];
  /** Only mask-category presets. */
  masks: ResolvedPreset[];
  /** Only edit-category presets. */
  edits: ResolvedPreset[];
  /** Manual presets (always available). */
  manual: ResolvedPreset[];
  /** Non-manual presets (local/remote, may be unavailable). */
  automatic: ResolvedPreset[];
}

export interface ViewerToolPresetsContext {
  /** The viewer has an image loaded. */
  hasImage?: boolean;
  /** The viewer has a video loaded. */
  hasVideo?: boolean;
  /** The user has an active region selection. */
  hasSelection?: boolean;
  /** Analyzer catalog entries from the backend (empty = not yet loaded). */
  analyzers?: AnalyzerCatalogEntry[];
  /** Provider IDs that are currently available. */
  availableProviderIds?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual presets (always included)
// ─────────────────────────────────────────────────────────────────────────────

const MANUAL_PRESETS: ViewerToolPreset[] = [
  PRESET_MANUAL_DRAW,
  PRESET_MANUAL_POLYGON,
];

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useViewerToolPresets(
  context: ViewerToolPresetsContext = {},
): ViewerToolPresetsResult {
  const {
    hasImage,
    hasVideo,
    hasSelection,
    analyzers = [],
    availableProviderIds = [],
  } = context;

  // Derive analyzer-based presets
  const analyzerPresets = useMemo(
    () => analyzersToPresets(analyzers),
    [analyzers],
  );

  // Combine all presets and resolve availability
  const resolved = useMemo(() => {
    const allPresets = [...MANUAL_PRESETS, ...analyzerPresets];
    const analyzerIds = analyzers.filter((a) => a.enabled).map((a) => a.id);

    return allPresets
      .filter(isMaskPreset)
      .map((preset): ResolvedPreset => ({
        preset,
        availability: resolvePresetAvailability(preset, {
          hasImage,
          hasVideo,
          hasSelection,
          availableAnalyzerIds: analyzerIds,
          availableProviderIds,
        }),
      }));
  }, [analyzerPresets, analyzers, hasImage, hasVideo, hasSelection, availableProviderIds]);

  // Split into categories
  return useMemo(() => {
    const masks = resolved.filter((r) => r.preset.category === 'mask');
    const edits = resolved.filter((r) => r.preset.category === 'edit');
    const manual = resolved.filter((r) => r.preset.source === 'manual');
    const automatic = resolved.filter((r) => r.preset.source !== 'manual');

    return { all: resolved, masks, edits, manual, automatic };
  }, [resolved]);
}
