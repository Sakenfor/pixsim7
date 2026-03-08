import type { OverlayPreset } from '../types';

export interface OverlayPresetMetadata {
  chips: string[];
  details: string[];
}

function summarizeWidgetTypes(preset: OverlayPreset): string | null {
  const widgets = preset.configuration.widgets ?? [];
  if (widgets.length === 0) return null;

  const counts = new Map<string, number>();
  for (const widget of widgets) {
    const next = (counts.get(widget.type) ?? 0) + 1;
    counts.set(widget.type, next);
  }

  return Array.from(counts.entries())
    .map(([type, count]) => `${type}x${count}`)
    .join(', ');
}

function summarizeGestureOverrides(preset: OverlayPreset): string | null {
  const gesture = preset.capabilities?.gestureOverrides;
  if (!gesture) return null;
  if (gesture.enabled === false) return 'disabled';

  const parts: string[] = [];
  if (gesture.gestureLeft?.length) parts.push(`L=${gesture.gestureLeft.join('>')}`);
  if (gesture.gestureRight?.length) parts.push(`R=${gesture.gestureRight.join('>')}`);
  if (gesture.gestureUp?.length) parts.push(`U=${gesture.gestureUp.join('>')}`);
  if (gesture.gestureDown?.length) parts.push(`D=${gesture.gestureDown.join('>')}`);

  return parts.length > 0 ? parts.join(', ') : 'custom';
}

export function getOverlayPresetMetadata(preset: OverlayPreset): OverlayPresetMetadata {
  const chips: string[] = [];
  const details: string[] = [];
  const { configuration, capabilities, policyChain } = preset;

  const spacing = configuration.spacing ?? 'normal';
  chips.push(`spacing:${spacing}`);
  details.push(`Layout spacing: ${spacing}`);

  if (configuration.collisionDetection === true) {
    chips.push('collision:on');
    details.push('Collision detection: enabled');
  } else if (configuration.collisionDetection === false) {
    chips.push('collision:off');
    details.push('Collision detection: disabled');
  }

  const widgetSummary = summarizeWidgetTypes(preset);
  if (widgetSummary) {
    chips.push(`widgets:${configuration.widgets.length}`);
    details.push(`Preset widgets: ${widgetSummary}`);
  } else {
    chips.push('runtime-widgets');
    details.push('Preset widgets: runtime defaults');
  }

  if (policyChain?.length) {
    chips.push(`policy:${policyChain.length}`);
    details.push(`Policy chain: ${policyChain.map((step) => step.policyId).join(', ')}`);
  }

  if (capabilities?.showsGenerationMenu) {
    chips.push('gen-menu');
    details.push('Generation menu: enabled');
  }
  if (capabilities?.showsQuickGenerate) {
    chips.push('quick-gen');
    details.push('Quick generate: enabled');
  }
  if (capabilities?.skipUploadButton) {
    chips.push('hide-upload');
    details.push('Upload button: hidden');
  }
  if (capabilities?.skipTagsTooltip) {
    chips.push('hide-tags');
    details.push('Tags tooltip: hidden');
  }
  if (capabilities?.providesStatusWidget) {
    chips.push('custom-status');
    details.push('Status widget: preset-provided');
  }
  if (capabilities?.forceHoverOnly) {
    chips.push('hover-only');
    details.push('Visibility mode: hover only');
  }
  if (capabilities?.touchFriendlyButtons) {
    chips.push('touch-friendly');
    details.push('Button behavior: touch friendly');
  }

  const gestureSummary = summarizeGestureOverrides(preset);
  if (gestureSummary) {
    chips.push(`gestures:${gestureSummary === 'disabled' ? 'off' : 'custom'}`);
    details.push(`Gesture map: ${gestureSummary}`);
  }

  return {
    chips: Array.from(new Set(chips)),
    details: Array.from(new Set(details)),
  };
}
