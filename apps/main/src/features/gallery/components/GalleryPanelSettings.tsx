/* eslint-disable react-refresh/only-export-components */
/**
 * Gallery Panel Settings
 *
 * Settings UI for the Gallery panel, organized into sections.
 * Part of Task 50 Phase 50.4 - Decentralized Panel Settings System
 */

import { mediaCardPresets } from '@lib/ui/overlay';

import { GROUP_BY_LABELS, GROUP_BY_UI_VALUES, normalizeGroupBySelection } from '@features/assets/lib/groupBy';
import type { GalleryGroupBy, GalleryGroupMode, GalleryGroupView, GalleryGroupBySelection } from '@features/panels';
import type { PanelSettingsProps, PanelSettingsSection } from '@features/panels/lib/panelRegistry';

import type { MediaCardBadgeConfig } from '@/components/media/MediaCard';


import { deriveOverlayPresetIdFromBadgeConfig } from '../lib/core/badgeConfigMerge';


export interface GalleryPanelSettings {
  overlayPresetId?: string;
  badgeConfig?: Partial<MediaCardBadgeConfig>;
  groupBy?: GalleryGroupBySelection;
  groupView?: GalleryGroupView;
  groupScope?: string[];
  groupMode?: GalleryGroupMode;
}

/**
 * Section 1: Overlay Presets
 */
function OverlayPresetsSection({ settings, helpers }: PanelSettingsProps<GalleryPanelSettings>) {
  const derivedOverlayId =
    settings.overlayPresetId ||
    deriveOverlayPresetIdFromBadgeConfig(settings.badgeConfig);
  const activePresetId = derivedOverlayId || 'media-card-default';

  return (
    <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">MediaCard Overlay Presets</h3>
      <div className="grid grid-cols-2 gap-3">
        {mediaCardPresets.map((preset) => {
          const isActive = activePresetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => helpers.set('overlayPresetId', preset.id)}
              className={`px-4 py-3 rounded-lg text-sm border-2 transition-all text-left ${
                isActive
                  ? 'bg-blue-500 text-white border-blue-500 shadow-sm'
                  : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-600 hover:border-blue-400'
              }`}
              title={preset.configuration.description}
            >
              <div className="flex items-center gap-2">
                {preset.icon && <span className="text-lg">{preset.icon}</span>}
                <span className="font-medium">{preset.name}</span>
              </div>
              {preset.configuration.description && (
                <div className="text-xs mt-1 opacity-80">
                  {preset.configuration.description}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Section 2: Display Options
 */
function DisplayOptionsSection({ settings, helpers }: PanelSettingsProps<GalleryPanelSettings>) {
  const updateBadgeConfig = (updates: Partial<MediaCardBadgeConfig>) => {
    helpers.update({
      badgeConfig: {
        ...settings.badgeConfig,
        ...updates,
      },
    });
  };

  return (
    <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">Display Options</h3>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white dark:hover:bg-neutral-800 p-2 rounded transition-colors">
          <input
            type="checkbox"
            checked={settings.badgeConfig?.showPrimaryIcon ?? true}
            onChange={(e) => updateBadgeConfig({ showPrimaryIcon: e.target.checked })}
            className="w-4 h-4"
          />
          <span>Media type icon</span>
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white dark:hover:bg-neutral-800 p-2 rounded transition-colors">
          <input
            type="checkbox"
            checked={settings.badgeConfig?.showStatusIcon ?? true}
            onChange={(e) => updateBadgeConfig({ showStatusIcon: e.target.checked })}
            className="w-4 h-4"
          />
          <span>Status icon</span>
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white dark:hover:bg-neutral-800 p-2 rounded transition-colors">
          <input
            type="checkbox"
            checked={settings.badgeConfig?.showStatusTextOnHover ?? true}
            onChange={(e) => updateBadgeConfig({ showStatusTextOnHover: e.target.checked })}
            className="w-4 h-4"
          />
          <span>Status text on hover</span>
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white dark:hover:bg-neutral-800 p-2 rounded transition-colors">
          <input
            type="checkbox"
            checked={settings.badgeConfig?.showTagsInOverlay ?? true}
            onChange={(e) => updateBadgeConfig({ showTagsInOverlay: e.target.checked })}
            className="w-4 h-4"
          />
          <span>Tags in overlay</span>
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white dark:hover:bg-neutral-800 p-2 rounded transition-colors">
          <input
            type="checkbox"
            checked={settings.badgeConfig?.showFooterProvider ?? false}
            onChange={(e) => updateBadgeConfig({ showFooterProvider: e.target.checked })}
            className="w-4 h-4"
          />
          <span>Footer provider</span>
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white dark:hover:bg-neutral-800 p-2 rounded transition-colors">
          <input
            type="checkbox"
            checked={settings.badgeConfig?.showFooterDate ?? true}
            onChange={(e) => updateBadgeConfig({ showFooterDate: e.target.checked })}
            className="w-4 h-4"
          />
          <span>Footer date</span>
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white dark:hover:bg-neutral-800 p-2 rounded transition-colors">
          <input
            type="checkbox"
            checked={settings.badgeConfig?.enableBadgePulse ?? false}
            onChange={(e) => updateBadgeConfig({ enableBadgePulse: e.target.checked })}
            className="w-4 h-4"
          />
          <span>Enable badge pulse</span>
        </label>
      </div>
    </div>
  );
}

/**
 * Section 3: Generation Actions
 */
function GenerationActionsSection({ settings, helpers }: PanelSettingsProps<GalleryPanelSettings>) {
  const updateBadgeConfig = (updates: Partial<MediaCardBadgeConfig>) => {
    helpers.update({
      badgeConfig: {
        ...settings.badgeConfig,
        ...updates,
      },
    });
  };

  return (
    <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">Generation Actions</h3>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white dark:hover:bg-neutral-800 p-2 rounded transition-colors">
            <input
              type="checkbox"
              checked={settings.badgeConfig?.showGenerationBadge ?? true}
              onChange={(e) => updateBadgeConfig({ showGenerationBadge: e.target.checked })}
              className="w-4 h-4"
            />
            <span>Generation badge</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white dark:hover:bg-neutral-800 p-2 rounded transition-colors">
            <input
              type="checkbox"
              checked={settings.badgeConfig?.showGenerationInMenu ?? true}
              onChange={(e) => updateBadgeConfig({ showGenerationInMenu: e.target.checked })}
              className="w-4 h-4"
            />
            <span>Show in menu</span>
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white dark:hover:bg-neutral-800 p-2 rounded transition-colors">
          <input
            type="checkbox"
            checked={settings.badgeConfig?.showGenerationOnHoverOnly ?? true}
            onChange={(e) => updateBadgeConfig({ showGenerationOnHoverOnly: e.target.checked })}
            className="w-4 h-4"
            disabled={!(settings.badgeConfig?.showGenerationBadge ?? true)}
          />
          <span>Only show on hover</span>
        </label>

        {/* Quick Action Selector */}
        <div className="flex flex-col gap-2 mt-2">
          <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Quick Action:
          </label>
          <select
            value={settings.badgeConfig?.generationQuickAction ?? 'auto'}
            onChange={(e) =>
              updateBadgeConfig({ generationQuickAction: e.target.value as any })
            }
            className="px-3 py-2 text-sm border-2 rounded-lg bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900"
          >
            <option value="auto">Auto (Smart Default)</option>
            <option value="image_to_video">Image → Video</option>
            <option value="video_extend">Video Extend</option>
            <option value="add_to_transition">Add to Transition</option>
            <option value="none">None</option>
          </select>
        </div>
      </div>
    </div>
  );
}

/**
 * Section 4: Grouping
 */
function GroupingSection({ settings, helpers }: PanelSettingsProps<GalleryPanelSettings>) {
  const groupMode: GalleryGroupMode = settings.groupMode ?? 'single';
  const groupBySelection = normalizeGroupBySelection(settings.groupBy ?? (groupMode === 'single' ? 'none' : []));
  const groupView = settings.groupView ?? 'inline';

  const handleGroupModeChange = (mode: GalleryGroupMode) => {
    if (mode === groupMode) return;
    if (mode === 'single') {
      helpers.update({
        groupMode: mode,
        groupBy: groupBySelection[0] ?? 'none',
      });
      return;
    }
    helpers.update({
      groupMode: mode,
      groupBy: groupBySelection,
    });
  };

  const toggleGroupBy = (value: GalleryGroupBy) => {
    const next = [...groupBySelection];
    const index = next.indexOf(value);
    if (index >= 0) {
      next.splice(index, 1);
    } else {
      next.push(value);
    }
    helpers.set('groupBy', next);
  };

  const clearGroupBy = () => {
    helpers.set('groupBy', groupMode === 'single' ? 'none' : []);
  };

  return (
    <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">Grouping</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Group Mode
          </label>
          <select
            value={groupMode}
            onChange={(e) => handleGroupModeChange(e.target.value as GalleryGroupMode)}
            className="px-3 py-2 text-sm border-2 rounded-lg bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900"
          >
            <option value="single">Single</option>
            <option value="multi">Multi</option>
          </select>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Multi-mode stacks groupings in the order selected.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Group By
          </label>
          {groupMode === 'single' ? (
            <select
              value={groupBySelection[0] ?? 'none'}
              onChange={(e) => helpers.set('groupBy', e.target.value as GalleryGroupBy)}
              className="px-3 py-2 text-sm border-2 rounded-lg bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900"
            >
              <option value="none">None</option>
              {GROUP_BY_UI_VALUES.map((value) => (
                <option key={value} value={value}>
                  {GROUP_BY_LABELS[value]}
                </option>
              ))}
            </select>
          ) : (
            <div className="border-2 rounded-lg bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 px-3 py-2 text-sm space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-600 dark:text-neutral-300">
                  {groupBySelection.length > 0
                    ? groupBySelection.map((value) => GROUP_BY_LABELS[value]).join(', ')
                    : 'None'}
                </span>
                <button
                  type="button"
                  onClick={clearGroupBy}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Clear
                </button>
              </div>
              <div className="flex flex-col gap-1">
                {GROUP_BY_UI_VALUES.map((value) => (
                  <label key={value} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={groupBySelection.includes(value)}
                      onChange={() => toggleGroupBy(value)}
                      className="accent-blue-500"
                    />
                    <span>{GROUP_BY_LABELS[value]}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Group assets into folders based on shared metadata.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Group View
          </label>
          <select
            value={groupView}
            onChange={(e) => helpers.set('groupView', e.target.value as GalleryGroupView)}
            className="px-3 py-2 text-sm border-2 rounded-lg bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900"
          >
            <option value="folders">Folder tiles</option>
            <option value="inline">List view</option>
            <option value="panel">Floating panel</option>
          </select>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Choose how grouped assets are displayed.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Gallery panel settings sections
 */
export const galleryPanelSettingsSections: PanelSettingsSection<GalleryPanelSettings>[] = [
  {
    id: 'overlay-presets',
    title: 'Overlay Presets',
    description: 'Choose the MediaCard overlay preset for the gallery',
    component: OverlayPresetsSection,
  },
  {
    id: 'display-options',
    title: 'Display Options',
    description: 'Customize what information is displayed on media cards',
    component: DisplayOptionsSection,
  },
  {
    id: 'generation-actions',
    title: 'Generation Actions',
    description: 'Configure generation shortcuts and quick actions',
    component: GenerationActionsSection,
  },
  {
    id: 'grouping',
    title: 'Grouping',
    description: 'Group assets into folders or sections',
    component: GroupingSection,
  },
];
