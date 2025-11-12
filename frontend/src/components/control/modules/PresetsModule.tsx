import { useControlCenterStore } from '../../../stores/controlCenterStore';
import clsx from 'clsx';
import { useProviderSpecs } from '../../../hooks/useProviderSpecs';

type PresetItem = { id: string; name: string; description?: string; params: Record<string, any> };

function buildDynamicPresets(specs: any, operationType: string): PresetItem[] {
  const op = specs?.operation_specs?.[operationType];
  if (!op || !Array.isArray(op.parameters)) return [];
  const params = op.parameters as Array<any>;
  const getEnum = (name: string) => params.find(p => p.name === name && Array.isArray(p.enum))?.enum as string[] | undefined;
  const qualities = getEnum('quality') || [];
  const aspects = getEnum('aspect_ratio') || [];
  const motions = getEnum('motion_mode') || [];

  const presets: PresetItem[] = [];
  const qPick = qualities.slice(0, 2).length ? qualities.slice(0, 2) : ['720p'];
  const aPick = aspects.slice(0, 2).length ? aspects.slice(0, 2) : ['16:9'];
  const mPick = motions.slice(0, 1).length ? motions.slice(0, 1) : [];

  let idx = 0;
  for (const q of qPick) {
    for (const a of aPick) {
      if (mPick.length) {
        for (const m of mPick) {
          presets.push({ id: `p_${idx++}`, name: `${q} • ${a} • ${m}`, params: { quality: q, aspect_ratio: a, motion_mode: m } });
        }
      } else {
        presets.push({ id: `p_${idx++}`, name: `${q} • ${a}`, params: { quality: q, aspect_ratio: a } });
      }
    }
  }
  return presets;
}

export function PresetsModule() {
  const { providerId, operationType, presetId, setPreset, setPresetParams, setActiveModule } = useControlCenterStore(s => ({
    providerId: s.providerId,
    operationType: s.operationType,
    presetId: s.presetId,
    setPreset: s.setPreset,
    setPresetParams: s.setPresetParams,
    setActiveModule: s.setActiveModule,
  }));

  const { specs, loading, error } = useProviderSpecs(providerId);

  const dynamicPresets = specs ? buildDynamicPresets(specs, operationType) : [];
  const presets: PresetItem[] = dynamicPresets.length ? dynamicPresets : [
    { id: 'fast-draft', name: 'Fast Draft', params: { quality: '360p' }, description: 'Quick preview' },
    { id: 'cinematic', name: 'Cinematic', params: { quality: '1080p', aspect_ratio: '16:9' }, description: 'High quality cinematic' },
  ];

  function selectPreset(p: PresetItem) {
    setPreset(p.id);
    setPresetParams(p.params);
    setTimeout(() => setActiveModule('quickGenerate'), 200);
  }

  return (
    <div className="p-4">
      <div className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
        {providerId ? 'Select a preset to configure your generation settings' : 'Select a provider in Generate tab to see presets'}
      </div>
      {loading && <div className="text-xs text-neutral-500">Loading presets…</div>}
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {presets.map(preset => (
          <button
            key={preset.id}
            onClick={() => selectPreset(preset)}
            className={clsx(
              'flex flex-col items-start gap-1 p-3 rounded-lg text-left',
              'border',
              'transition-all duration-150',
              'focus:outline-none focus:ring-2 focus:ring-blue-500',
              preset.id === presetId
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800'
            )}
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {preset.name}
              </span>
              {preset.id === presetId && (
                <span className="text-xs text-blue-600 dark:text-blue-400">✓ Selected</span>
              )}
            </div>
            {preset.description && (
              <span className="text-xs text-neutral-600 dark:text-neutral-400">
                {preset.description}
              </span>
            )}
            <span className="text-xs text-neutral-500 dark:text-neutral-500">
              {/* Show params preview */}
              {Object.entries(preset.params).map(([k, v]) => `${k}: ${v}`).join(', ')}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-3 text-xs text-neutral-500">
        {dynamicPresets.length ? 'Presets derived from provider operation_specs.' : 'Using fallback presets. Operation specs unavailable.'}
      </div>
    </div>
  );
}
