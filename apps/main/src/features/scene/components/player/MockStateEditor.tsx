import { useState, useCallback } from 'react';
import { Button, Input } from '@pixsim7/shared.ui';

export interface MockStateEditorProps {
  /** Current mock state */
  state: Record<string, any>;
  /** Callback when state changes */
  onChange: (newState: Record<string, any>) => void;
}

/**
 * Mock State Editor - Configure game state for testing
 *
 * Allows setting flags, variables, and other state values to test
 * different scene branches and conditions without playing through the game.
 */
export function MockStateEditor({ state, onChange }: MockStateEditorProps) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newValueType, setNewValueType] = useState<'string' | 'number' | 'boolean'>('string');

  /**
   * Add a new key-value pair to the mock state
   */
  const handleAdd = useCallback(() => {
    if (!newKey.trim()) return;

    let parsedValue: any = newValue;

    // Parse value based on type
    if (newValueType === 'number') {
      parsedValue = parseFloat(newValue) || 0;
    } else if (newValueType === 'boolean') {
      parsedValue = newValue.toLowerCase() === 'true' || newValue === '1';
    }

    onChange({
      ...state,
      [newKey.trim()]: parsedValue,
    });

    // Reset form
    setNewKey('');
    setNewValue('');
  }, [newKey, newValue, newValueType, state, onChange]);

  /**
   * Remove a key from the mock state
   */
  const handleRemove = useCallback(
    (key: string) => {
      const newState = { ...state };
      delete newState[key];
      onChange(newState);
    },
    [state, onChange]
  );

  /**
   * Update an existing key's value
   */
  const handleUpdate = useCallback(
    (key: string, value: string, valueType: 'string' | 'number' | 'boolean') => {
      let parsedValue: any = value;

      if (valueType === 'number') {
        parsedValue = parseFloat(value) || 0;
      } else if (valueType === 'boolean') {
        parsedValue = value.toLowerCase() === 'true' || value === '1';
      }

      onChange({
        ...state,
        [key]: parsedValue,
      });
    },
    [state, onChange]
  );

  /**
   * Clear all mock state
   */
  const handleClearAll = useCallback(() => {
    onChange({});
  }, [onChange]);

  /**
   * Load from JSON
   */
  const handleLoadJson = useCallback(() => {
    const jsonString = prompt('Paste mock state JSON:');
    if (!jsonString) return;

    try {
      const parsed = JSON.parse(jsonString);
      if (typeof parsed !== 'object' || parsed === null) {
        alert('Invalid JSON: must be an object');
        return;
      }
      onChange(parsed);
    } catch (error) {
      alert(`Invalid JSON: ${error instanceof Error ? error.message : 'Parse error'}`);
    }
  }, [onChange]);

  /**
   * Export as JSON
   */
  const handleExportJson = useCallback(() => {
    const jsonString = JSON.stringify(state, null, 2);
    navigator.clipboard
      .writeText(jsonString)
      .then(() => alert('Mock state copied to clipboard'))
      .catch(() => prompt('Copy this JSON:', jsonString));
  }, [state]);

  const stateEntries = Object.entries(state);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Mock State Configuration
        </h3>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={handleLoadJson} title="Load from JSON">
            📥 Load
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleExportJson}
            disabled={stateEntries.length === 0}
            title="Export to JSON"
          >
            📤 Export
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleClearAll}
            disabled={stateEntries.length === 0}
            title="Clear all"
          >
            🗑️ Clear
          </Button>
        </div>
      </div>

      <div className="text-xs text-neutral-600 dark:text-neutral-400 mb-4">
        Configure game state flags and variables to test different scene branches and conditions.
      </div>

      {/* Existing state entries */}
      {stateEntries.length > 0 ? (
        <div className="space-y-2 mb-4">
          {stateEntries.map(([key, value]) => (
            <div
              key={key}
              className="flex items-center gap-2 p-2 bg-neutral-100 dark:bg-neutral-800 rounded"
            >
              <span className="text-xs font-mono text-neutral-700 dark:text-neutral-300 flex-1">
                {key}
              </span>
              <span className="text-xs px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded">
                {typeof value}
              </span>
              <Input
                type="text"
                value={String(value)}
                onChange={(e) => handleUpdate(key, e.target.value, typeof value as any)}
                className="w-32 text-xs"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleRemove(key)}
                className="px-2"
                title="Remove"
              >
                ✕
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center text-neutral-500 dark:text-neutral-400 py-6 bg-neutral-50 dark:bg-neutral-900/50 rounded">
          <p className="text-sm">No mock state configured</p>
          <p className="text-xs mt-1">Add flags and variables below</p>
        </div>
      )}

      {/* Add new entry form */}
      <div className="border-t dark:border-neutral-700 pt-4">
        <h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
          Add New Entry
        </h4>
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Key (e.g., player_level)"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="flex-1 text-xs"
            onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
          />
          <select
            value={newValueType}
            onChange={(e) =>
              setNewValueType(e.target.value as 'string' | 'number' | 'boolean')
            }
            className="px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
          >
            <option value="string">String</option>
            <option value="number">Number</option>
            <option value="boolean">Boolean</option>
          </select>
          <Input
            type="text"
            placeholder="Value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="w-32 text-xs"
            onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
          />
          <Button
            size="sm"
            variant="primary"
            onClick={handleAdd}
            disabled={!newKey.trim()}
            title="Add entry"
          >
            ➕ Add
          </Button>
        </div>
      </div>

      {/* Common presets */}
      <div className="border-t dark:border-neutral-700 pt-4">
        <h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
          Quick Presets
        </h4>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              onChange({ ...state, relationship_level: 50, player_level: 10, has_quest: true })
            }
          >
            Relationship Test
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onChange({ ...state, debug_mode: true, skip_intro: true })}
          >
            Debug Mode
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              onChange({ ...state, quest_completed: true, has_key: true, door_unlocked: true })
            }
          >
            Quest Complete
          </Button>
        </div>
      </div>
    </div>
  );
}
