import { useState } from "react";
import { Modal, Button, Input, FormField } from "@pixsim7/shared.ui";

interface SavePresetDialogProps {
  onSave: (name: string) => void;
  onCancel: () => void;
}

export function SavePresetDialog({ onSave, onCancel }: SavePresetDialogProps) {
  const [presetName, setPresetName] = useState("");

  const handleSave = () => {
    if (presetName.trim()) {
      onSave(presetName);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onCancel}
      title="Save Workspace Preset"
      size="sm"
    >
      <FormField label="Preset Name" required>
        <Input
          type="text"
          placeholder="Preset name..."
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          autoFocus
        />
      </FormField>

      <div className="flex gap-2 mt-4 justify-end">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={!presetName.trim()}
        >
          Save
        </Button>
      </div>
    </Modal>
  );
}
