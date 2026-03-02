/* eslint-disable react-refresh/only-export-components */
/**
 * Gesture Settings Schema
 *
 * Settings for mouse gesture actions on media cards.
 * Supports distance-based action cascades (multiple actions per direction).
 */

import { GESTURE_ACTIONS } from '@lib/gestures';
import { useGestureConfigStore } from '@lib/gestures';

import { settingsSchemaRegistry, type SettingGroup, type SettingStoreAdapter } from '../core';

const actionOptions = GESTURE_ACTIONS.map((a) => ({
  value: a.id,
  label: a.label,
}));

const MAX_CASCADE_TIERS = 6;

// ─── Cascade Direction Editor (custom setting component) ─────────────────────

function CascadeDirectionEditor({
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
  id: 'gesture-general',
  title: 'General',
  fields: [
    {
      id: 'enabled',
      type: 'toggle',
      label: 'Enable Mouse Gestures',
      description:
        'Press and drag on media cards to trigger quick actions. Directions are configurable below.',
      defaultValue: true,
    },
    {
      id: 'threshold',
      type: 'range',
      label: 'Gesture Sensitivity',
      description:
        'Minimum drag distance (in pixels) before a gesture is recognized. Lower = more sensitive.',
      min: 15,
      max: 60,
      step: 5,
      defaultValue: 30,
      format: (v: number) => `${v}px`,
      showWhen: (vals) => vals.enabled === true,
    },
    {
      id: 'edgeInset',
      type: 'range',
      label: 'Edge Dead Zone',
      description:
        'Percentage of the card edge where gestures are ignored. Higher = smaller active center area, fewer accidental triggers.',
      min: 0,
      max: 0.4,
      step: 0.05,
      defaultValue: 0.2,
      format: (v: number) => `${Math.round(v * 100)}%`,
      showWhen: (vals) => vals.enabled === true,
    },
    {
      id: 'cascadeStepPixels',
      type: 'range',
      label: 'Cascade Step Distance',
      description:
        'Pixels of additional drag between each cascade tier. Only applies to directions with multiple actions.',
      min: 20,
      max: 120,
      step: 10,
      defaultValue: 50,
      format: (v: number) => `${v}px`,
      showWhen: (vals) => vals.enabled === true,
    },
  ],
};

const directionsGroup: SettingGroup = {
  id: 'gesture-directions',
  title: 'Direction Mappings',
  description: 'Choose which actions to trigger for each swipe direction. Add multiple tiers for distance-based cascading.',
  showWhen: (vals) => vals.enabled === true,
  fields: [
    {
      id: 'gestureUp',
      type: 'custom',
      label: 'Swipe Up',
      component: CascadeDirectionEditor,
      defaultValue: ['upload'],
    },
    {
      id: 'gestureDown',
      type: 'custom',
      label: 'Swipe Down',
      component: CascadeDirectionEditor,
      defaultValue: ['archive'],
    },
    {
      id: 'gestureLeft',
      type: 'custom',
      label: 'Swipe Left',
      component: CascadeDirectionEditor,
      defaultValue: ['none'],
    },
    {
      id: 'gestureRight',
      type: 'custom',
      label: 'Swipe Right',
      component: CascadeDirectionEditor,
      defaultValue: ['quickGenerate'],
    },
  ],
};

function useGestureSettingsAdapter(): SettingStoreAdapter {
  const store = useGestureConfigStore();

  return {
    get: (fieldId: string) => {
      switch (fieldId) {
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

export function registerGestureSettings(): () => void {
  return settingsSchemaRegistry.register({
    categoryId: 'gestures',
    category: {
      label: 'Gestures',
      icon: '👆',
      order: 65,
    },
    groups: [generalGroup, directionsGroup],
    useStore: useGestureSettingsAdapter,
  });
}
