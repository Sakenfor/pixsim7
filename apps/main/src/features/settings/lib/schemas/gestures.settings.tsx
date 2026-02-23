/**
 * Gesture Settings Schema
 *
 * Settings for mouse gesture actions on media cards.
 */

import { GESTURE_ACTIONS } from '@lib/gestures';
import { useGestureConfigStore } from '@lib/gestures';

import { settingsSchemaRegistry, type SettingGroup, type SettingStoreAdapter } from '../core';

const actionOptions = GESTURE_ACTIONS.map((a) => ({
  value: a.id,
  label: a.label,
}));

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
  ],
};

const directionsGroup: SettingGroup = {
  id: 'gesture-directions',
  title: 'Direction Mappings',
  description: 'Choose which action to trigger for each swipe direction.',
  showWhen: (vals) => vals.enabled === true,
  fields: [
    {
      id: 'gestureUp',
      type: 'select',
      label: 'Swipe Up',
      options: actionOptions,
      defaultValue: 'upload',
    },
    {
      id: 'gestureDown',
      type: 'select',
      label: 'Swipe Down',
      options: actionOptions,
      defaultValue: 'none',
    },
    {
      id: 'gestureLeft',
      type: 'select',
      label: 'Swipe Left',
      options: actionOptions,
      defaultValue: 'none',
    },
    {
      id: 'gestureRight',
      type: 'select',
      label: 'Swipe Right',
      options: actionOptions,
      defaultValue: 'quickGenerate',
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
        case 'gestureUp':
          store.setGestureAction('up', String(value));
          break;
        case 'gestureDown':
          store.setGestureAction('down', String(value));
          break;
        case 'gestureLeft':
          store.setGestureAction('left', String(value));
          break;
        case 'gestureRight':
          store.setGestureAction('right', String(value));
          break;
      }
    },
    getAll: () => ({
      enabled: store.enabled,
      threshold: store.threshold,
      edgeInset: store.edgeInset,
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
