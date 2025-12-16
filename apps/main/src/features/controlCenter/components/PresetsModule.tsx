import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';
import clsx from 'clsx';
import { useProviderSpecs } from '@features/providers';
import { useMemo, useState } from 'react';
import { ccSelectors } from '@/stores/selectors';
import { Settings2 } from 'lucide-react';
import { PresetOperator, type TimelineAsset } from './PresetOperator';

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
  const presetParams = useControlCenterStore(ccSelectors.presetParams);

  const setPreset = useControlCenterStore(s => s.setPreset);
  const setPresetParams = useControlCenterStore(s => s.setPresetParams);
  const setAssets = useControlCenterStore(s => s.setAssets);
  const setActiveModule = useControlCenterStore(s => s.setActiveModule);

  const { specs, loading, error } = useProviderSpecs(providerId);

  // Operator popup state
  const [operatorOpen, setOperatorOpen] = useState(false);
  const [selectedPresetForOperator, setSelectedPresetForOperator] = useState<PresetItem | null>(null);

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

  function openOperator(p: PresetItem) {
    setSelectedPresetForOperator(p);
    setOperatorOpen(true);
  }

  function handleOperatorApply(assets: TimelineAsset[], params: Record<string, any>) {
    // Update preset params with operator-configured values
    setPresetParams({
      ...presetParams,
      ...params,
    });
    // Store assets separately
    setAssets(assets);
    // Switch back to quick generate
    setActiveModule('quickGenerate');
  }

  // Determine if operation supports multi-input operator
  // Provider must be selected for operator to work (needs provider-specific constraints)
  const supportsOperator = providerId &&
                           (['video_transition', 'fusion', 'image_to_video'].includes(operationType) ||
                            providerId === 'sora');

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

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
        {presets.map(preset => {
          const isSelected = preset.id === presetId;
          return (
            <div
              key={preset.id}
              className={clsx(
                'flex flex-col gap-1.5 p-2 rounded-lg cursor-pointer',
                'border transition-all duration-150',
                isSelected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 shadow-sm'
                  : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-blue-300'
              )}
              onClick={() => selectPreset(preset)}
            >
              {/* Operation Type Badge */}
              <div className="text-[9px] font-bold uppercase tracking-wide text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded self-start">
                {operationType.replace('_', '→')}
              </div>

              <div className="flex items-start justify-between gap-1">
                <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100 leading-tight">
                  {preset.name}
                </span>
                {isSelected && (
                  <span className="text-[10px] text-blue-600 dark:text-blue-400">✓</span>
                )}
              </div>

              {/* Compact params */}
              <div className="text-[10px] text-neutral-500 dark:text-neutral-500 font-mono line-clamp-2">
                {Object.entries(preset.params)
                  .map(([k, v]) => `${k}:${v}`)
                  .join(' ')}
              </div>

              {/* Compact action */}
              {supportsOperator && (
                <button
                  onClick={(e) => { e.stopPropagation(); openOperator(preset); }}
                  className="mt-1 py-0.5 px-1.5 text-[10px] rounded bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-0.5 self-start"
                  title="Open advanced operator"
                >
                  <Settings2 className="w-2.5 h-2.5" />
                  Op
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Operator Popup */}
      {selectedPresetForOperator && (
        <PresetOperator
          isOpen={operatorOpen}
          onClose={() => setOperatorOpen(false)}
          providerId={providerId}
          operationType={operationType}
          presetId={selectedPresetForOperator.id}
          presetParams={selectedPresetForOperator.params}
          onApply={handleOperatorApply}
        />
      )}

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
