import { useState } from 'react';

interface SavePresetDialogProps {
  onSave: (name: string) => void;
  onCancel: () => void;
}

export function SavePresetDialog({ onSave, onCancel }: SavePresetDialogProps) {
  const [presetName, setPresetName] = useState('');

  const handleSave = () => {
    if (presetName.trim()) {
      onSave(presetName);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
      <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-xl p-4 w-80">
        <h3 className="text-sm font-semibold mb-2">Save Workspace Preset</h3>
        <input
          type="text"
          className="w-full px-2 py-1 text-sm border rounded dark:bg-neutral-900 dark:border-neutral-700"
          placeholder="Preset name..."
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          autoFocus
        />
        <div className="flex gap-2 mt-3 justify-end">
          <button
            className="text-xs px-3 py-1 border rounded hover:bg-neutral-100 dark:hover:bg-neutral-700"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={handleSave}
            disabled={!presetName.trim()}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
