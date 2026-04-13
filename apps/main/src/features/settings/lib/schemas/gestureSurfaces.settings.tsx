/* eslint-disable react-refresh/only-export-components */
/**
 * Gesture surface settings.
 *
 * Dynamically builds one settings category per registered gesture surface
 * (gallery, viewer, recent strip, …). Adding a new surface via
 * `registerGestureSurface` auto-adds a category here — no edits needed.
 */

import {
  getAllGestureSurfaces,
  useGestureSurfaceStore,
  useSurfaceOwnConfig,
  type GestureSurfaceDescriptor,
  type GestureSurfaceSource,
} from '@lib/gestures';

import { settingsSchemaRegistry, type SettingGroup, type SettingField, type SettingStoreAdapter } from '../core';

const MAX_CASCADE_TIERS = 6;

// ─── Cascade Direction Editor (closes over the surface's action pool) ────────

function makeCascadeEditor(actionOptions: { value: string; label: string }[]) {
  return function CascadeDirectionEditor({
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
      onChange(actions.filter((_, i) => i !== index));
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
  };
}

function buildSourceOptions(descriptor: GestureSurfaceDescriptor) {
  const options: { value: string; label: string }[] = [
    { value: 'independent', label: 'Independent' },
  ];
  const others = descriptor.allowMirrorFrom ?? [];
  for (const otherId of others) {
    options.push({ value: `mirror:${otherId}`, label: `Mirror ${otherId}` });
  }
  return options;
}

function buildGroups(descriptor: GestureSurfaceDescriptor): SettingGroup[] {
  const actionOptions = descriptor.actionPool.map((a) => ({ value: a.id, label: a.label }));
  const CascadeEditor = makeCascadeEditor(actionOptions);
  const sourceOptions = buildSourceOptions(descriptor);
  const isIndependent = (vals: Record<string, any>) => vals.source === 'independent';
  const isIndependentAndEnabled = (vals: Record<string, any>) =>
    vals.source === 'independent' && vals.enabled === true;

  const generalFields: SettingField[] = [];
  if (sourceOptions.length > 1) {
    generalFields.push({
      id: 'source',
      type: 'select' as const,
      label: 'Configuration Source',
      description: 'Use this surface\'s own gesture config, or mirror another surface.',
      options: sourceOptions,
      defaultValue: 'independent',
    });
  }
  generalFields.push(
    {
      id: 'enabled',
      type: 'toggle' as const,
      label: 'Enable Gestures',
      description: descriptor.description ?? 'Press and drag to trigger quick actions.',
      defaultValue: descriptor.defaults.enabled,
      ...(sourceOptions.length > 1 ? { showWhen: isIndependent } : {}),
    },
    {
      id: 'threshold',
      type: 'range' as const,
      label: 'Gesture Sensitivity',
      description: 'Minimum drag distance (in pixels) before a gesture is recognized. Lower = more sensitive.',
      min: 15,
      max: 80,
      step: 5,
      defaultValue: descriptor.defaults.threshold,
      format: (v: number) => `${v}px`,
      showWhen: sourceOptions.length > 1 ? isIndependentAndEnabled : (vals: Record<string, any>) => vals.enabled === true,
    },
    {
      id: 'edgeInset',
      type: 'range' as const,
      label: 'Edge Dead Zone',
      description: 'Percentage of the surface edge where gestures are ignored.',
      min: 0,
      max: 0.4,
      step: 0.05,
      defaultValue: descriptor.defaults.edgeInset,
      format: (v: number) => `${Math.round(v * 100)}%`,
      showWhen: sourceOptions.length > 1 ? isIndependentAndEnabled : (vals: Record<string, any>) => vals.enabled === true,
    },
    {
      id: 'cascadeStepPixels',
      type: 'range' as const,
      label: 'Cascade Step Distance',
      description: 'Pixels of additional drag between each cascade tier.',
      min: 20,
      max: 120,
      step: 10,
      defaultValue: descriptor.defaults.cascadeStepPixels,
      format: (v: number) => `${v}px`,
      showWhen: sourceOptions.length > 1 ? isIndependentAndEnabled : (vals: Record<string, any>) => vals.enabled === true,
    },
  );

  const generalGroup: SettingGroup = {
    id: `${descriptor.id}-general`,
    title: 'General',
    fields: generalFields,
  };

  const directionsGroup: SettingGroup = {
    id: `${descriptor.id}-directions`,
    title: 'Direction Mappings',
    description: 'Choose which actions to trigger for each swipe direction. Add multiple tiers for distance-based cascading.',
    showWhen: sourceOptions.length > 1 ? isIndependentAndEnabled : (vals: Record<string, any>) => vals.enabled === true,
    fields: [
      { id: 'gestureUp', type: 'custom', label: 'Swipe Up', component: CascadeEditor, defaultValue: descriptor.defaults.gestureUp as unknown as string[] },
      { id: 'gestureDown', type: 'custom', label: 'Swipe Down', component: CascadeEditor, defaultValue: descriptor.defaults.gestureDown as unknown as string[] },
      { id: 'gestureLeft', type: 'custom', label: 'Swipe Left', component: CascadeEditor, defaultValue: descriptor.defaults.gestureLeft as unknown as string[] },
      { id: 'gestureRight', type: 'custom', label: 'Swipe Right', component: CascadeEditor, defaultValue: descriptor.defaults.gestureRight as unknown as string[] },
    ],
  };

  return [generalGroup, directionsGroup];
}

function makeAdapterHook(surfaceId: string) {
  return function useAdapter(): SettingStoreAdapter {
    const cfg = useSurfaceOwnConfig(surfaceId);
    const setSource = useGestureSurfaceStore((s) => s.setSource);
    const setEnabled = useGestureSurfaceStore((s) => s.setEnabled);
    const setThreshold = useGestureSurfaceStore((s) => s.setThreshold);
    const setEdgeInset = useGestureSurfaceStore((s) => s.setEdgeInset);
    const setCascadeStepPixels = useGestureSurfaceStore((s) => s.setCascadeStepPixels);
    const setCascadeActions = useGestureSurfaceStore((s) => s.setCascadeActions);
    return {
      get: (fieldId) => (cfg as Record<string, unknown>)[fieldId],
      set: (fieldId, value) => {
        switch (fieldId) {
          case 'source': setSource(surfaceId, value as GestureSurfaceSource); break;
          case 'enabled': setEnabled(surfaceId, Boolean(value)); break;
          case 'threshold': setThreshold(surfaceId, Number(value)); break;
          case 'edgeInset': setEdgeInset(surfaceId, Number(value)); break;
          case 'cascadeStepPixels': setCascadeStepPixels(surfaceId, Number(value)); break;
          case 'gestureUp': setCascadeActions(surfaceId, 'up', value as string[]); break;
          case 'gestureDown': setCascadeActions(surfaceId, 'down', value as string[]); break;
          case 'gestureLeft': setCascadeActions(surfaceId, 'left', value as string[]); break;
          case 'gestureRight': setCascadeActions(surfaceId, 'right', value as string[]); break;
        }
      },
      getAll: () => ({ ...cfg }),
    };
  };
}

export function categoryIdForSurface(surfaceId: string): string {
  return `gesture-surface:${surfaceId}`;
}

export function registerGestureSurfaceSettings(): () => void {
  const unregisters: Array<() => void> = [];
  for (const descriptor of getAllGestureSurfaces()) {
    const unregister = settingsSchemaRegistry.register({
      categoryId: categoryIdForSurface(descriptor.id),
      category: {
        label: descriptor.label,
        icon: descriptor.icon,
        order: descriptor.order,
      },
      groups: buildGroups(descriptor),
      useStore: makeAdapterHook(descriptor.id),
    });
    unregisters.push(unregister);
  }
  return () => {
    for (const fn of unregisters) fn();
  };
}
