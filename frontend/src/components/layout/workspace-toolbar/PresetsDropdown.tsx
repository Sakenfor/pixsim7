import type { WorkspacePreset } from '../../../stores/workspaceStore';

interface PresetsDropdownProps {
  presets: WorkspacePreset[];
  onLoadPreset: (presetId: string) => void;
  onDeletePreset: (presetId: string) => void;
  onSaveClick: () => void;
  onClose: () => void;
}

export function PresetsDropdown({
  presets,
  onLoadPreset,
  onDeletePreset,
  onSaveClick,
  onClose,
}: PresetsDropdownProps) {
  return (
    <div className="absolute top-full left-0 mt-1 bg-white dark:bg-neutral-800 border dark:border-neutral-700 rounded shadow-lg z-50 min-w-[200px]">
      <div className="p-2 space-y-1">
        {presets.map((preset) => (
          <div key={preset.id} className="flex items-center gap-1">
            <button
              className="flex-1 text-left text-xs px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
              onClick={() => {
                onLoadPreset(preset.id);
                onClose();
              }}
            >
              {preset.name}
            </button>
            {!['default', 'minimal', 'creative'].includes(preset.id) && (
              <button
                className="text-xs px-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                onClick={() => onDeletePreset(preset.id)}
                title="Delete preset"
              >
                ×
              </button>
            )}
          </div>
        ))}
        <div className="border-t dark:border-neutral-700 my-1" />
        <button
          className="w-full text-left text-xs px-2 py-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded text-blue-600 dark:text-blue-400"
          onClick={() => {
            onClose();
            onSaveClick();
          }}
        >
          💾 Save Current Layout
        </button>
      </div>
    </div>
  );
}
