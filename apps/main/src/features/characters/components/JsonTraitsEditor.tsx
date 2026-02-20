import { Button, Input } from '@pixsim7/shared.ui';
import { useState } from 'react';

export interface JsonTraitsEditorProps {
  traits: Record<string, unknown>;
  onChange: (traits: Record<string, unknown>) => void;
  suggestedKeys?: string[];
}

export function JsonTraitsEditor({ traits, onChange, suggestedKeys }: JsonTraitsEditorProps) {
  const [newKey, setNewKey] = useState('');

  const entries = Object.entries(traits);

  const handleValueChange = (key: string, value: string) => {
    onChange({ ...traits, [key]: value });
  };

  const handleKeyRename = (oldKey: string, newKeyName: string) => {
    if (!newKeyName || newKeyName === oldKey) return;
    const updated = { ...traits };
    const val = updated[oldKey];
    delete updated[oldKey];
    updated[newKeyName] = val;
    onChange(updated);
  };

  const handleDelete = (key: string) => {
    const updated = { ...traits };
    delete updated[key];
    onChange(updated);
  };

  const handleAdd = (key?: string) => {
    const k = key || newKey.trim();
    if (!k || k in traits) return;
    onChange({ ...traits, [k]: '' });
    setNewKey('');
  };

  const unusedSuggestions = suggestedKeys?.filter((k) => !(k in traits)) ?? [];

  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-center gap-2">
          <Input
            size="sm"
            className="w-40 shrink-0"
            defaultValue={key}
            onBlur={(e) => handleKeyRename(key, e.target.value)}
          />
          <Input
            size="sm"
            className="flex-1"
            value={typeof value === 'string' ? value : JSON.stringify(value)}
            onChange={(e) => handleValueChange(key, e.target.value)}
          />
          <Button
            variant="ghost"
            size="xs"
            onClick={() => handleDelete(key)}
            className="text-red-400 hover:text-red-300 shrink-0"
          >
            &times;
          </Button>
        </div>
      ))}

      <div className="flex items-center gap-2 pt-1">
        <Input
          size="sm"
          className="w-40 shrink-0"
          placeholder="New key..."
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
          }}
        />
        <Button variant="ghost" size="xs" onClick={() => handleAdd()}>
          + Add field
        </Button>
      </div>

      {unusedSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          <span className="text-xs text-neutral-500">Suggested:</span>
          {unusedSuggestions.map((key) => (
            <button
              key={key}
              className="text-xs px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300"
              onClick={() => handleAdd(key)}
            >
              {key}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
