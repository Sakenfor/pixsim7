import type { HudToolPlacement, HudRegion } from '@features/worldTools';

export interface ToolPlacementRow extends HudToolPlacement {
  name: string;
  description: string;
  icon?: string;
}

export const VISIBILITY_CONDITION_KINDS = [
  { value: '', label: 'Always visible' },
  { value: 'session', label: 'Only when session exists' },
  { value: 'flag', label: 'When session flag is set' },
  { value: 'capability', label: 'When capability is enabled' },
  { value: 'location', label: 'At specific locations' },
  { value: 'time', label: 'During specific time' },
  { value: 'quest', label: 'When quest is active' },
  { value: 'relationship', label: 'Based on NPC relationship' },
];

export const TOOL_SIZES = [
  { value: '', label: 'Default' },
  { value: 'compact', label: 'Compact' },
  { value: 'normal', label: 'Normal' },
  { value: 'expanded', label: 'Expanded' },
];

export const REGIONS: { value: HudRegion; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'overlay', label: 'Overlay' },
];

export const REGION_DESCRIPTIONS: Record<HudRegion, string> = {
  top: 'Tools appear at the top of the screen',
  bottom: 'Tools appear at the bottom of the screen',
  left: 'Tools appear on the left side',
  right: 'Tools appear on the right side',
  overlay: 'Tools appear as floating overlays',
};
