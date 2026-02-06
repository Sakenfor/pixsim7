/**
 * Panel Group Definition Helper
 *
 * Declarative API for defining reusable panel groups (collections of panels
 * with predefined layouts and presets). Panel groups can be hosted in any
 * container (Control Center, Viewer, floating windows, etc.).
 *
 * @example
 * ```typescript
 * // features/generation/panelGroups/quickgen.ts
 * import { definePanelGroup } from '@features/panels/lib/definePanelGroup';
 *
 * export default definePanelGroup({
 *   id: 'quickgen',
 *   title: 'Quick Generate',
 *   description: 'Generation workflow panels for prompt, settings, and assets',
 *   panels: {
 *     asset: 'quickgen-asset',
 *     prompt: 'quickgen-prompt',
 *     settings: 'quickgen-settings',
 *     blocks: 'quickgen-blocks',
 *   },
 *   presets: {
 *     promptSettings: ['prompt', 'settings'],
 *     full: ['asset', 'prompt', 'settings'],
 *     fullWithBlocks: ['asset', 'prompt', 'settings', 'blocks'],
 *   },
 *   defaultScopes: ['generation'],
 *   defaultLayout: (api, panels) => {
 *     // Custom layout logic
 *   },
 * });
 * ```
 */

import type { DockviewApi } from 'dockview-core';
import type { ComponentType } from 'react';

type DockviewPanelPosition = Parameters<DockviewApi['addPanel']>[0]['position'];

/**
 * Panel slot definition within a group.
 * Maps a slot name to a panel ID from the registry.
 */
export type PanelSlots<TSlots extends string = string> = Record<TSlots, string>;

/**
 * Preset configuration for a panel group.
 * Each preset defines which slots are included and optional layout.
 */
export interface PanelGroupPreset<TSlots extends string = string> {
  /** Slot names to include in this preset */
  slots: readonly TSlots[];
  /** Optional custom layout for this preset */
  layout?: (api: DockviewApi, panelIds: Record<TSlots, string>) => void;
  /** Description of when to use this preset */
  description?: string;
}

/**
 * Layout configuration for default panel arrangement.
 */
export interface PanelGroupLayoutConfig<TSlots extends string = string> {
  /** Callback to create the default layout */
  create: (api: DockviewApi, panelIds: Record<TSlots, string>, activeSlots: readonly TSlots[]) => void;
  /** Optional position resolver for missing panels */
  resolvePosition?: (
    slotName: TSlots,
    panelId: string,
    api: DockviewApi,
    panelIds: Record<TSlots, string>
  ) => DockviewPanelPosition | undefined;
}

/**
 * Title resolver for panels in the group.
 */
export type PanelTitleResolver<TSlots extends string = string> =
  | Record<TSlots, string>
  | ((slotName: TSlots, panelId: string) => string);

/**
 * Options for defining a panel group.
 */
export interface DefinePanelGroupOptions<
  TSlots extends string = string,
  TPresets extends string = string,
> {
  // Required
  /** Unique identifier for this panel group */
  id: string;
  /** Display title */
  title: string;
  /** Panel slots: mapping from slot names to panel IDs */
  panels: PanelSlots<TSlots>;

  // Optional metadata
  /** Description of the panel group's purpose */
  description?: string;
  /** Icon identifier */
  icon?: string;
  /** Category for grouping in UI */
  category?: string;
  /** Tags for search/filtering */
  tags?: string[];

  // Presets
  /** Named preset configurations */
  presets?: Record<TPresets, readonly TSlots[] | PanelGroupPreset<TSlots>>;

  // Layout
  /** Default layout configuration */
  defaultLayout?: PanelGroupLayoutConfig<TSlots>;
  /** Title resolver for panels */
  panelTitles?: PanelTitleResolver<TSlots>;
  /** Default scopes for all panels in group */
  defaultScopes?: string[];

  // Host component
  /** Optional custom host component wrapper */
  hostComponent?: ComponentType<PanelGroupHostProps<TSlots, TPresets>>;

  // Behavior
  /** Minimum panels required before showing tabs */
  minPanelsForTabs?: number;
  /** Enable context menu on panels */
  enableContextMenu?: boolean;
  /** Whether layout is persisted */
  persistLayout?: boolean;
}

/**
 * Props passed to panel group host components.
 */
export interface PanelGroupHostProps<
  TSlots extends string = string,
  TPresets extends string = string,
> {
  /** Which preset to use, or custom slot array */
  preset?: TPresets | readonly TSlots[];
  /** Storage key for layout persistence */
  storageKey: string;
  /** Panel manager ID for settings resolution */
  panelManagerId?: string;
  /** Context passed to panels */
  context?: unknown;
  /** Custom default layout override */
  defaultLayout?: (api: DockviewApi) => void;
  /** Callback when dockview is ready */
  onReady?: (api: DockviewApi) => void;
  /** CSS class for container */
  className?: string;
}

/**
 * Full panel group definition with resolved values.
 */
export interface PanelGroupDefinition<
  TSlots extends string = string,
  TPresets extends string = string,
> extends Required<Omit<DefinePanelGroupOptions<TSlots, TPresets>, 'hostComponent' | 'defaultLayout' | 'panelTitles'>> {
  /** Panel slots: mapping from slot names to panel IDs */
  panels: PanelSlots<TSlots>;
  /** Named preset configurations (normalized) */
  presets: Record<TPresets, PanelGroupPreset<TSlots>>;
  /** Default layout configuration */
  defaultLayout?: PanelGroupLayoutConfig<TSlots>;
  /** Title resolver for panels */
  panelTitles?: PanelTitleResolver<TSlots>;
  /** Optional custom host component wrapper */
  hostComponent?: ComponentType<PanelGroupHostProps<TSlots, TPresets>>;

  // Utility methods
  /** Get panel IDs for a preset */
  getPanelIds: (preset: TPresets | readonly TSlots[]) => string[];
  /** Get slot names for a preset */
  getSlots: (preset: TPresets) => readonly TSlots[];
  /** Resolve panel title for a slot */
  resolveTitle: (slotName: TSlots) => string;
  /** Check if a slot exists */
  hasSlot: (slotName: string) => slotName is TSlots;
}

/**
 * Define a panel group with simplified options.
 * Returns a full PanelGroupDefinition with utility methods.
 */
export function definePanelGroup<
  TSlots extends string,
  TPresets extends string = never,
>(
  options: DefinePanelGroupOptions<TSlots, TPresets>
): PanelGroupDefinition<TSlots, TPresets> {
  const {
    id,
    title,
    panels,
    description = '',
    icon,
    category = 'workspace',
    tags = [],
    presets: rawPresets = {} as Record<TPresets, readonly TSlots[] | PanelGroupPreset<TSlots>>,
    defaultLayout,
    panelTitles,
    defaultScopes = [],
    hostComponent,
    minPanelsForTabs = 1,
    enableContextMenu = true,
    persistLayout = true,
  } = options;

  // Normalize presets to full PanelGroupPreset objects
  const presets = Object.entries(rawPresets).reduce(
    (acc, [key, value]) => {
      if (Array.isArray(value)) {
        acc[key as TPresets] = { slots: value as readonly TSlots[] };
      } else {
        acc[key as TPresets] = value as PanelGroupPreset<TSlots>;
      }
      return acc;
    },
    {} as Record<TPresets, PanelGroupPreset<TSlots>>
  );

  // Slot names for type checking
  const slotNames = Object.keys(panels) as TSlots[];

  // Utility: get panel IDs for a preset or custom slots
  const getPanelIds = (preset: TPresets | readonly TSlots[]): string[] => {
    if (Array.isArray(preset)) {
      return preset.map((slot) => panels[slot]).filter(Boolean);
    }
    const presetConfig = presets[preset as TPresets];
    const slots = presetConfig?.slots ?? [];
    return slots.map((slot) => panels[slot]).filter(Boolean);
  };

  // Utility: get slots for a preset
  const getSlots = (preset: TPresets): readonly TSlots[] => {
    return presets[preset]?.slots ?? [];
  };

  // Utility: resolve panel title
  const resolveTitle = (slotName: TSlots): string => {
    if (!panelTitles) {
      // Default: capitalize slot name
      return slotName.charAt(0).toUpperCase() + slotName.slice(1);
    }
    if (typeof panelTitles === 'function') {
      return panelTitles(slotName, panels[slotName]);
    }
    return panelTitles[slotName] ?? slotName;
  };

  // Utility: check if slot exists
  const hasSlot = (slotName: string): slotName is TSlots => {
    return slotNames.includes(slotName as TSlots);
  };

  return {
    id,
    title,
    panels,
    description,
    icon,
    category,
    tags,
    presets,
    defaultLayout,
    panelTitles,
    defaultScopes,
    hostComponent,
    minPanelsForTabs,
    enableContextMenu,
    persistLayout,
    getPanelIds,
    getSlots,
    resolveTitle,
    hasSlot,
  };
}

/**
 * Panel group module structure for auto-discovery.
 */
export interface PanelGroupModule {
  /** The panel group definition */
  default: PanelGroupDefinition;
}
