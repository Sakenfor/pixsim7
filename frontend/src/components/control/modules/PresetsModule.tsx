import { useControlCenterStore } from '../../../stores/controlCenterStore';
import clsx from 'clsx';

// TODO: Replace with dynamic presets from provider operation_specs
const STUB_PRESETS = [
  {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'High quality, dramatic lighting, professional look',
    providerId: 'pixverse',
  },
  {
    id: 'fast-draft',
    name: 'Fast Draft',
    description: 'Quick generation for previews',
    providerId: 'pixverse',
  },
  {
    id: 'anime-style',
    name: 'Anime Style',
    description: 'Anime aesthetic and character design',
    providerId: 'pixverse',
  },
  {
    id: 'realistic',
    name: 'Photorealistic',
    description: 'Natural, lifelike rendering',
    providerId: 'pixverse',
  },
];

export function PresetsModule() {
  const { presetId, setPreset, setActiveModule } = useControlCenterStore(s => ({
    presetId: s.presetId,
    setPreset: s.setPreset,
    setActiveModule: s.setActiveModule,
  }));

  function selectPreset(id: string) {
    setPreset(id);
    // Switch back to quick generate module after selection
    setTimeout(() => setActiveModule('quickGenerate'), 200);
  }

  return (
    <div className="p-4">
      <div className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
        Select a preset to configure your generation settings
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {STUB_PRESETS.map(preset => (
          <button
            key={preset.id}
            onClick={() => selectPreset(preset.id)}
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
            <span className="text-xs text-neutral-600 dark:text-neutral-400">
              {preset.description}
            </span>
            <span className="text-xs text-neutral-500 dark:text-neutral-500">
              Provider: {preset.providerId}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-3 text-xs text-neutral-500">
        TODO: Load presets dynamically from provider operation_specs
      </div>
    </div>
  );
}
