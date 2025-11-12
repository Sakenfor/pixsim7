import { useControlCenterStore } from '../../../stores/controlCenterStore';
import clsx from 'clsx';
import { useProviderSpecs } from '../../../hooks/useProviderSpecs';
import { useMemo } from 'react';
import { ccSelectors } from '../../../stores/selectors';

type PresetItem = {
  id: string;
  name: string;
  description?: string;
  params: Record<string, any>;
};

// Build human-friendly preset names
function buildPresetName(params: Record<string, any>): string {
  const parts: string[] = [];

  // Quality first
  if (params.quality) parts.push(params.quality);

  // Aspect ratio
  if (params.aspect_ratio) parts.push(params.aspect_ratio);

  // Motion mode
  if (params.motion_mode) parts.push(params.motion_mode);

  // Model
  if (params.model) parts.push(params.model);

  // Other notable params
  const others = Object.entries(params)
    .filter(([k]) => !['quality', 'aspect_ratio', 'motion_mode', 'model'].includes(k))
    .map(([k, v]) => `${k}:${v}`);

  parts.push(...others);

  return parts.join(' • ') || 'Custom';
}

function buildDynamicPresets(specs: any, operationType: string): PresetItem[] {
  const op = specs?.operation_specs?.[operationType];
  if (!op || !Array.isArray(op.parameters)) return [];

  const params = op.parameters as Array<any>;
  const getEnum = (name: string) =>
    params.find(p => p.name === name && Array.isArray(p.enum))?.enum as string[] | undefined;

  const qualities = getEnum('quality') || [];
  const aspects = getEnum('aspect_ratio') || [];
  const motions = getEnum('motion_mode') || [];
  const models = getEnum('model') || [];

  const presets: PresetItem[] = [];

  // Strategy: Create combinations of common params
  // If we have quality and aspect, create combos
  if (qualities.length && aspects.length) {
    // Take first 2 qualities and first 2 aspects for variety
    const qPick = qualities.slice(0, 2);
    const aPick = aspects.slice(0, 2);

    for (const q of qPick) {
      for (const a of aPick) {
        const baseParams: Record<string, any> = { quality: q, aspect_ratio: a };

        // Add motion if available (first option only to avoid explosion)
        if (motions.length) {
          baseParams.motion_mode = motions[0];
        }

        // Add model if available (first option only)
        if (models.length) {
          baseParams.model = models[0];
        }

        const name = buildPresetName(baseParams);
        const description = `${q} quality, ${a} aspect${motions.length ? `, ${motions[0]}` : ''}`;

        presets.push({
          id: `preset_${presets.length + 1}`,
          name,
          description,
          params: baseParams,
        });
      }
    }
  } else if (qualities.length) {
    // Only quality available
    qualities.slice(0, 3).forEach((q, idx) => {
      presets.push({
        id: `preset_${idx + 1}`,
        name: q,
        description: `${q} quality`,
        params: { quality: q },
      });
    });
  } else if (aspects.length) {
    // Only aspect available
    aspects.slice(0, 3).forEach((a, idx) => {
      presets.push({
        id: `preset_${idx + 1}`,
        name: a,
        description: `${a} aspect ratio`,
        params: { aspect_ratio: a },
      });
    });
  }

  // If still no presets, create generic ones from first enum of each param
  if (!presets.length) {
    params
      .filter(p => Array.isArray(p.enum) && p.enum.length)
      .slice(0, 3)
      .forEach((p, idx) => {
        const val = p.enum[0];
        presets.push({
          id: `preset_${idx + 1}`,
          name: `${p.name}: ${val}`,
          description: p.description || '',
          params: { [p.name]: val },
        });
      });
  }

  return presets;
}

const FALLBACK_PRESETS: PresetItem[] = [
  {
    id: 'fast-draft',
    name: 'Fast Draft',
    params: { quality: '360p' },
    description: 'Quick preview generation',
  },
  {
    id: 'balanced',
    name: 'Balanced',
    params: { quality: '720p', aspect_ratio: '16:9' },
    description: 'Good quality, reasonable speed',
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    params: { quality: '1080p', aspect_ratio: '16:9' },
    description: 'High quality cinematic look',
  },
];

export function PresetsModule() {
  // Use stable selectors to reduce re-renders
  const providerId = useControlCenterStore(ccSelectors.providerId);
  const operationType = useControlCenterStore(ccSelectors.operationType);
  const presetId = useControlCenterStore(ccSelectors.presetId);

  const setPreset = useControlCenterStore(s => s.setPreset);
  const setPresetParams = useControlCenterStore(s => s.setPresetParams);
  const setActiveModule = useControlCenterStore(s => s.setActiveModule);

  const { specs, loading, error } = useProviderSpecs(providerId);

  const presets = useMemo<PresetItem[]>(() => {
    if (!providerId || !specs) return FALLBACK_PRESETS;
    const dynamic = buildDynamicPresets(specs, operationType);
    return dynamic.length ? dynamic : FALLBACK_PRESETS;
  }, [specs, operationType, providerId]);

  const isDynamic = providerId && specs && buildDynamicPresets(specs, operationType).length > 0;

  function selectPreset(p: PresetItem) {
    setPreset(p.id);
    setPresetParams(p.params);
    // Switch back to quick generate after short delay
    setTimeout(() => setActiveModule('quickGenerate'), 200);
  }

  return (
    <div className="p-4">
      <div className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
        {providerId
          ? `Select a preset for ${providerId} (${operationType})`
          : 'Select a provider in Generate tab to see dynamic presets'}
      </div>

      {loading && (
        <div className="text-xs text-neutral-500 italic">Loading provider specs…</div>
      )}

      {error && (
        <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded mb-3">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {presets.map(preset => {
          const isSelected = preset.id === presetId;
          return (
            <button
              key={preset.id}
              onClick={() => selectPreset(preset)}
              className={clsx(
                'flex flex-col items-start gap-2 p-3 rounded-lg text-left',
                'border transition-all duration-150',
                'focus:outline-none focus:ring-2 focus:ring-blue-500',
                isSelected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 shadow-sm'
                  : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-600'
              )}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {preset.name}
                </span>
                {isSelected && (
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                    ✓ Selected
                  </span>
                )}
              </div>

              {preset.description && (
                <span className="text-xs text-neutral-600 dark:text-neutral-400">
                  {preset.description}
                </span>
              )}

              {/* Parameter preview */}
              <div className="text-xs text-neutral-500 dark:text-neutral-500 font-mono">
                {Object.entries(preset.params)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(', ')}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 text-xs text-neutral-500">
        {isDynamic ? (
          <span>✓ Presets generated from provider operation_specs</span>
        ) : (
          <span>⚠ Using fallback presets (operation_specs unavailable)</span>
        )}
      </div>
    </div>
  );
}
