/* eslint-disable react-refresh/only-export-components */
/**
 * Viewer Gesture Settings Schema
 *
 * Settings for mouse gesture actions in the media viewer (viewing mode).
 * Supports independent config or mirroring gallery card gestures.
 */

import { ALL_VIEWER_ACTIONS } from '@lib/gestures';
import { useViewerGestureConfigStore } from '@lib/gestures';

import { settingsSchemaRegistry, type SettingGroup, type SettingStoreAdapter } from '../core';

const actionOptions = ALL_VIEWER_ACTIONS.map((a) => ({
  value: a.id,
  label: a.label,
}));

const MAX_CASCADE_TIERS = 6;

// ─── Cascade Direction Editor (viewer variant with viewer-specific actions) ──

function ViewerCascadeDirectionEditor({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const actions: string[] = Array.isArray(value) ? value : [value ?? 'none'];

  const handleChange = (index: number, actionId: string) => {
    const next = [...actions];
    next[index] = actionId;
    onChange(next);
  };

  const handleRemove = (index: number) => {
    if (actions.length <= 1) return;
    const next = actions.filter((_, i) => i !== index);
    onChange(next);
  };

  const handleAdd = () => {
    if (actions.length >= MAX_CASCADE_TIERS) return;
    onChange([...actions, 'none']);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {actions.map((actionId, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="w-5 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums text-right shrink-0">
            {index + 1}.
          </span>
          <select
            value={actionId}
            onChange={(e) => handleChange(index, e.target.value)}
            disabled={disabled}
            className="flex-1 min-w-0 text-sm rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1 disabled:opacity-50"
          >
            {actionOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {actions.length > 1 && (
            <button
              type="button"
              onClick={() => handleRemove(index)}
              disabled={disabled}
              className="text-neutral-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400 text-sm px-1 disabled:opacity-50"
              title="Remove tier"
            >
              &times;
            </button>
          )}
        </div>
      ))}
      {actions.length < MAX_CASCADE_TIERS && (
        <button
          type="button"
          onClick={handleAdd}
          disabled={disabled}
          className="self-start text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 mt-0.5"
        >
          + Add tier
        </button>
      )}
    </div>
  );
}

// ─── Setting Groups ──────────────────────────────────────────────────────────

const generalGroup: SettingGroup = {
  id: 'viewer-gesture-general',
  title: 'General',
  fields: [
    {
      id: 'source',
      type: 'select',
      label: 'Configuration Source',
      description:
        'Use independent viewer gesture mappings, or mirror the gallery card gesture config.',
      options: [
        { value: 'independent', label: 'Independent' },
        { value: 'gallery', label: 'Mirror Gallery Cards' },
      ],
      defaultValue: 'independent',
    },
    {
      id: 'enabled',
      type: 'toggle',
      label: 'Enable Viewer Gestures',
      description:
        'Press and drag on the media viewer to trigger quick actions. Only active in viewing mode (no overlay tool).',
      defaultValue: true,
      showWhen: (vals) => vals.source === 'independent',
    },
    {
      id: 'threshold',
      type: 'range',
      label: 'Gesture Sensitivity',
      description:
        'Minimum drag distance (in pixels) before a gesture is recognized.',
      min: 15,
      max: 80,
      step: 5,
      defaultValue: 40,
      format: (v: number) => `${v}px`,
      showWhen: (vals) => vals.source === 'independent' && vals.enabled === true,
    },
    {
      id: 'edgeInset',
      type: 'range',
      label: 'Edge Dead Zone',
      description:
        'Percentage of the viewer edge where gestures are ignored.',
      min: 0,
      max: 0.3,
      step: 0.05,
      defaultValue: 0.05,
      format: (v: number) => `${Math.round(v * 100)}%`,
      showWhen: (vals) => vals.source === 'independent' && vals.enabled === true,
    },
    {
      id: 'cascadeStepPixels',
      type: 'range',
      label: 'Cascade Step Distance',
      description:
        'Pixels of additional drag between each cascade tier.',
      min: 20,
      max: 120,
      step: 10,
      defaultValue: 50,
      format: (v: number) => `${v}px`,
      showWhen: (vals) => vals.source === 'independent' && vals.enabled === true,
    },
  ],
};

const directionsGroup: SettingGroup = {
  id: 'viewer-gesture-directions',
  title: 'Direction Mappings',
  description: 'Choose which actions to trigger for each swipe direction in the viewer. Includes viewer-specific actions (navigate, close, toggle fit).',
  showWhen: (vals) => vals.source === 'independent' && vals.enabled === true,
  fields: [
    {
      id: 'gestureUp',
      type: 'custom',
      label: 'Swipe Up',
      component: ViewerCascadeDirectionEditor,
      defaultValue: ['toggleFavorite'],
    },
    {
      id: 'gestureDown',
      type: 'custom',
      label: 'Swipe Down',
      component: ViewerCascadeDirectionEditor,
      defaultValue: ['closeViewer'],
    },
    {
      id: 'gestureLeft',
      type: 'custom',
      label: 'Swipe Left',
      component: ViewerCascadeDirectionEditor,
      defaultValue: ['navigateNext'],
    },
    {
      id: 'gestureRight',
      type: 'custom',
      label: 'Swipe Right',
      component: ViewerCascadeDirectionEditor,
      defaultValue: ['navigatePrev'],
    },
  ],
};

function useViewerGestureSettingsAdapter(): SettingStoreAdapter {
  const store = useViewerGestureConfigStore();

  return {
    get: (fieldId: string) => {
      switch (fieldId) {
        case 'source': return store.source;
        case 'enabled': return store.enabled;
        case 'threshold': return store.threshold;
        case 'edgeInset': return store.edgeInset;
        case 'cascadeStepPixels': return store.cascadeStepPixels;
        case 'gestureUp': return store.gestureUp;
        case 'gestureDown': return store.gestureDown;
        case 'gestureLeft': return store.gestureLeft;
        case 'gestureRight': return store.gestureRight;
        default: return undefined;
      }
    },
    set: (fieldId: string, value: any) => {
      switch (fieldId) {
        case 'source':
          store.setSource(value as 'independent' | 'gallery');
          break;
        case 'enabled':
          store.setEnabled(Boolean(value));
          break;
        case 'threshold':
          store.setThreshold(Number(value));
          break;
        case 'edgeInset':
          store.setEdgeInset(Number(value));
          break;
        case 'cascadeStepPixels':
          store.setCascadeStepPixels(Number(value));
          break;
        case 'gestureUp':
          store.setCascadeActions('up', value as string[]);
          break;
        case 'gestureDown':
          store.setCascadeActions('down', value as string[]);
          break;
        case 'gestureLeft':
          store.setCascadeActions('left', value as string[]);
          break;
        case 'gestureRight':
          store.setCascadeActions('right', value as string[]);
          break;
      }
    },
    getAll: () => ({
      source: store.source,
      enabled: store.enabled,
      threshold: store.threshold,
      edgeInset: store.edgeInset,
      cascadeStepPixels: store.cascadeStepPixels,
      gestureUp: store.gestureUp,
      gestureDown: store.gestureDown,
      gestureLeft: store.gestureLeft,
      gestureRight: store.gestureRight,
    }),
  };
}

export function registerViewerGestureSettings(): () => void {
  return settingsSchemaRegistry.register({
    categoryId: 'viewer-gestures',
    category: {
      label: 'Viewer Gestures',
      icon: '🖼️',
      order: 66,
    },
    groups: [generalGroup, directionsGroup],
    useStore: useViewerGestureSettingsAdapter,
  });
}
