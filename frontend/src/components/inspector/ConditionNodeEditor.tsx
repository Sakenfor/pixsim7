import { useState, useEffect } from 'react';
import { Button } from '@pixsim7/ui';
import type { DraftSceneNode } from '../../modules/scene-builder';

interface ConditionNodeEditorProps {
  node: DraftSceneNode;
  onUpdate: (patch: Partial<DraftSceneNode>) => void;
}

interface Condition {
  variable: string;
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=';
  value: string;
}

export function ConditionNodeEditor({ node, onUpdate }: ConditionNodeEditorProps) {
  const [conditions, setConditions] = useState<Condition[]>([
    { variable: '', operator: '==', value: '' }
  ]);
  const [logicMode, setLogicMode] = useState<'AND' | 'OR'>('AND');

  useEffect(() => {
    // Load conditions from node metadata
    const savedConditions = (node.metadata as any)?.conditions;
    const savedLogicMode = (node.metadata as any)?.logicMode;

    if (savedConditions && Array.isArray(savedConditions) && savedConditions.length > 0) {
      setConditions(savedConditions);
    }
    if (savedLogicMode) {
      setLogicMode(savedLogicMode);
    }
  }, [node]);

  function handleAddCondition() {
    setConditions([...conditions, { variable: '', operator: '==', value: '' }]);
  }

  function handleUpdateCondition(index: number, field: keyof Condition, value: string) {
    const updated = [...conditions];
    updated[index][field] = value as any;
    setConditions(updated);
  }

  function handleRemoveCondition(index: number) {
    setConditions(conditions.filter((_, i) => i !== index));
  }

  function handleApply() {
    onUpdate({
      metadata: {
        ...node.metadata,
        conditions: conditions,
        logicMode: logicMode,
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-neutral-600 dark:text-neutral-400">
        Branch based on game state variables
      </div>

      {/* Logic Mode */}
      <div>
        <label className="block text-sm font-medium mb-1">Logic Mode</label>
        <select
          value={logicMode}
          onChange={(e) => setLogicMode(e.target.value as 'AND' | 'OR')}
          className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
        >
          <option value="AND">AND (all conditions must be true)</option>
          <option value="OR">OR (any condition can be true)</option>
        </select>
      </div>

      {/* Conditions */}
      <div className="border-t pt-3 dark:border-neutral-700">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium">Conditions</label>
          <Button size="sm" variant="secondary" onClick={handleAddCondition}>
            + Add Condition
          </Button>
        </div>

        <div className="space-y-2">
          {conditions.map((condition, index) => (
            <div key={index} className="p-3 border rounded bg-neutral-50 dark:bg-neutral-800/50 dark:border-neutral-700">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={condition.variable}
                    onChange={(e) => handleUpdateCondition(index, 'variable', e.target.value)}
                    className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                    placeholder="Variable name (e.g., 'score', 'hasKey')"
                  />
                  <div className="flex gap-2">
                    <select
                      value={condition.operator}
                      onChange={(e) => handleUpdateCondition(index, 'operator', e.target.value)}
                      className="px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                    >
                      <option value="==">==</option>
                      <option value="!=">!=</option>
                      <option value=">">&gt;</option>
                      <option value="<">&lt;</option>
                      <option value=">=">&gt;=</option>
                      <option value="<=">&lt;=</option>
                    </select>
                    <input
                      type="text"
                      value={condition.value}
                      onChange={(e) => handleUpdateCondition(index, 'value', e.target.value)}
                      className="flex-1 px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                      placeholder="Value"
                    />
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveCondition(index)}
                  className="text-red-600 hover:text-red-700 text-xs px-2 py-1"
                  disabled={conditions.length === 1}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-xs text-neutral-500 dark:text-neutral-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-2">
        💡 Use success handle for condition true, failure handle for condition false
      </div>

      <Button variant="primary" onClick={handleApply} className="w-full">
        Apply Changes
      </Button>
    </div>
  );
}

// Default export for dynamic loading via nodeEditorRegistry
export default ConditionNodeEditor;
