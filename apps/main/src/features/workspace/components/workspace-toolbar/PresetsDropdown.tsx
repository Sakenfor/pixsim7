import { Dropdown, DropdownItem, DropdownDivider } from "@pixsim7/shared.ui";
import type { WorkspacePreset } from "../../stores/workspaceStore";

interface PresetsDropdownProps {
  isOpen: boolean;
  presets: WorkspacePreset[];
  onLoadPreset: (presetId: string) => void;
  onDeletePreset: (presetId: string) => void;
  onSaveClick: () => void;
  onClose: () => void;
}

export function PresetsDropdown({
  isOpen,
  presets,
  onLoadPreset,
  onDeletePreset,
  onSaveClick,
  onClose,
}: PresetsDropdownProps) {
  return (
    <Dropdown isOpen={isOpen} onClose={onClose} minWidth="200px">
      {presets.map((preset) => (
        <div key={preset.id} className="flex items-center gap-1">
          <DropdownItem
            onClick={() => {
              onLoadPreset(preset.id);
              onClose();
            }}
            className="flex-1"
          >
            {preset.name}
          </DropdownItem>
          {!preset.isDefault && (
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

      <DropdownDivider />

      <DropdownItem
        variant="primary"
        onClick={() => {
          onClose();
          onSaveClick();
        }}
      >
        💾 Save Current Layout
      </DropdownItem>
    </Dropdown>
  );
}
