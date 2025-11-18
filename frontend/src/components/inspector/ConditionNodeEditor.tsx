import { Button } from '@pixsim7/ui';
import { useNodeEditor } from './useNodeEditor';
import type { NodeEditorProps, Condition, ConditionConfig } from './editorTypes';
import { validateConditionConfig, isValidConditionArray, logValidationError } from './editorValidation';

export function ConditionNodeEditor({ node, onUpdate }: NodeEditorProps) {
  const { formState, setFormState, handleApply } = useNodeEditor<ConditionConfig>({
    node,
    onUpdate,
    initialState: {
      conditions: [{ variable: '', operator: '==', value: '' }],
      logicMode: 'AND'
    },
    loadFromNode: (node) => {
      const metadata = node.metadata as Record<string, unknown> | undefined;

      // Try new standardized field first
      const savedConfig = metadata?.conditionConfig as ConditionConfig | undefined;
      if (savedConfig) {
        const result: Partial<ConditionConfig> = {};

        if (savedConfig.conditions && isValidConditionArray(savedConfig.conditions)) {
          result.conditions = savedConfig.conditions;
        }

        if (savedConfig.logicMode === 'AND' || savedConfig.logicMode === 'OR') {
          result.logicMode = savedConfig.logicMode;
        }

        if (Object.keys(result).length > 0) {
          return result;
        }
      }

      // Fallback to old fields for backward compatibility
      const legacyConditions = metadata?.conditions;
      const legacyLogicMode = metadata?.logicMode;
      const result: Partial<ConditionConfig> = {};

      if (Array.isArray(legacyConditions) && legacyConditions.length > 0) {
        if (isValidConditionArray(legacyConditions)) {
          result.conditions = legacyConditions;
        } else {
          logValidationError('ConditionNodeEditor', 'Saved conditions have invalid structure, using defaults');
        }
      }

      if (legacyLogicMode === 'AND' || legacyLogicMode === 'OR') {
        result.logicMode = legacyLogicMode;
      }

      return result;
    },
    saveToNode: (formState, node) => ({
      metadata: {
        ...node.metadata,
        conditionConfig: formState,
      }
    })
  });

  const validOperators: Condition['operator'][] = ['==', '!=', '>', '<', '>=', '<='];

  function handleAddCondition() {
    setFormState({
      ...formState,
      conditions: [...formState.conditions, { variable: '', operator: '==', value: '' }]
    });
  }

  function handleUpdateCondition(index: number, field: keyof Condition, value: string) {
    const updated = [...formState.conditions];
    if (field === 'operator' && validOperators.includes(value as Condition['operator'])) {
      updated[index][field] = value as Condition['operator'];
    } else if (field !== 'operator') {
      updated[index][field] = value;
    }
    setFormState({ ...formState, conditions: updated });
  }

  function handleRemoveCondition(index: number) {
    setFormState({
      ...formState,
      conditions: formState.conditions.filter((_, i) => i !== index)
    });
  }

  function handleApplyWithValidation() {
    const validation = validateConditionConfig(formState);
    if (!validation.isValid) {
      validation.errors.forEach(error => logValidationError('ConditionNodeEditor', error));
      return;
    }
    handleApply();
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
          value={formState.logicMode}
          onChange={(e) => {
            const value = e.target.value;
            if (value === 'AND' || value === 'OR') {
              setFormState({ ...formState, logicMode: value });
            }
          }}
          className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
        >
          <option value="AND">AND (all must be true)</option>
          <option value="OR">OR (any can be true)</option>
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
          {formState.conditions.map((condition, index) => (
            <div key={index} className="p-3 border rounded bg-neutral-50 dark:bg-neutral-800/50 dark:border-neutral-700">
              <div className="flex items-start gap-2">
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={condition.variable}
                    onChange={(e) => handleUpdateCondition(index, 'variable', e.target.value)}
                    className="px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                    placeholder="Variable"
                  />
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
                    className="px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                    placeholder="Value"
                  />
                </div>
                <button
                  onClick={() => handleRemoveCondition(index)}
                  className="text-red-600 hover:text-red-700 text-xs px-2 py-1"
                  disabled={formState.conditions.length === 1}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-xs text-neutral-500 dark:text-neutral-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-2">
        💡 Two output ports: "true" if condition(s) pass, "false" otherwise
      </div>

      <Button variant="primary" onClick={handleApplyWithValidation} className="w-full">
        Apply Changes
      </Button>
    </div>
  );
}

// Default export for dynamic loading via nodeEditorRegistry
export default ConditionNodeEditor;
