import { Button } from '@pixsim7/shared.ui';
import { useState } from 'react';

import { Icon } from '@lib/icons';

import {
  type PresetVariable,
  type ElementSelector,
  VariableType,
  MatchMode,
} from '../types';


interface VariablesEditorProps {
  variables: PresetVariable[];
  onChange: (variables: PresetVariable[]) => void;
}

const VARIABLE_TYPE_META: Record<VariableType, { icon: string; label: string }> = {
  [VariableType.ELEMENT]: { icon: '🎯', label: 'Element Selector' },
  [VariableType.TEXT]: { icon: '📝', label: 'Text' },
  [VariableType.NUMBER]: { icon: '🔢', label: 'Number' },
  [VariableType.COORDS]: { icon: '📍', label: 'Coordinates' },
};

const MATCH_MODE_OPTIONS = [
  { value: MatchMode.EXACT, label: 'Exact' },
  { value: MatchMode.CONTAINS, label: 'Contains' },
  { value: MatchMode.STARTS_WITH, label: 'Starts with' },
  { value: MatchMode.ENDS_WITH, label: 'Ends with' },
  { value: MatchMode.REGEX, label: 'Regex' },
];

function createDefaultVariable(type: VariableType): PresetVariable {
  const base = { name: '', type, description: '' };
  switch (type) {
    case VariableType.ELEMENT:
      return { ...base, element: {} };
    case VariableType.TEXT:
      return { ...base, text: '' };
    case VariableType.NUMBER:
      return { ...base, number: 0 };
    case VariableType.COORDS:
      return { ...base, coords: { x: 0, y: 0 } };
  }
}

export function VariablesEditor({ variables, onChange }: VariablesEditorProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const addVariable = (type: VariableType) => {
    const newVar = createDefaultVariable(type);
    newVar.name = `var${variables.length + 1}`;
    onChange([...variables, newVar]);
    setExpandedIndex(variables.length);
  };

  const updateVariable = (index: number, variable: PresetVariable) => {
    const updated = [...variables];
    updated[index] = variable;
    onChange(updated);
  };

  const deleteVariable = (index: number) => {
    onChange(variables.filter((_, i) => i !== index));
    if (expandedIndex === index) setExpandedIndex(null);
  };

  const inputClass =
    'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const smallInputClass =
    'px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Variables ({variables.length})
        </h4>
        <div className="flex gap-1">
          {Object.entries(VARIABLE_TYPE_META).map(([type, meta]) => (
            <Button
              key={type}
              type="button"
              size="xs"
              variant="secondary"
              onClick={() => addVariable(type as VariableType)}
              title={`Add ${meta.label}`}
            >
              <Icon name={meta.icon} size={14} />
            </Button>
          ))}
        </div>
      </div>

      {variables.length === 0 ? (
        <div className="text-center py-4 text-xs text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
          No variables defined. Click icons above to add.
        </div>
      ) : (
        <div className="space-y-2">
          {variables.map((variable, index) => {
            const meta = VARIABLE_TYPE_META[variable.type];
            const isExpanded = expandedIndex === index;

            return (
              <div
                key={index}
                className={`border rounded-lg bg-white dark:bg-gray-900 ${
                  isExpanded
                    ? 'border-blue-500 shadow-md'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                {/* Header */}
                <div className="flex items-center gap-2 p-2">
                  <Icon name={meta.icon} size={14} />
                  <code className="flex-1 text-sm font-mono text-purple-600 dark:text-purple-400">
                    ${variable.name}
                  </code>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {getVariableSummary(variable)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setExpandedIndex(isExpanded ? null : index)}
                    className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    {isExpanded ? '▲' : '▼'}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteVariable(index)}
                    className="p-1 text-red-500 hover:text-red-700"
                  >
                    ✕
                  </button>
                </div>

                {/* Expanded editor */}
                {isExpanded && (
                  <div className="border-t border-gray-200 dark:border-gray-700 p-3 space-y-3 bg-gray-50 dark:bg-gray-800/50">
                    {/* Name */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                          Variable Name
                        </label>
                        <div className="flex items-center">
                          <span className="text-gray-400 mr-1">$</span>
                          <input
                            type="text"
                            value={variable.name}
                            onChange={(e) =>
                              updateVariable(index, {
                                ...variable,
                                name: e.target.value.replace(/[^a-zA-Z0-9_]/g, ''),
                              })
                            }
                            placeholder="variableName"
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                          Description (optional)
                        </label>
                        <input
                          type="text"
                          value={variable.description || ''}
                          onChange={(e) =>
                            updateVariable(index, { ...variable, description: e.target.value })
                          }
                          placeholder="What this variable is for"
                          className={inputClass}
                        />
                      </div>
                    </div>

                    {/* Type-specific editor */}
                    {variable.type === VariableType.ELEMENT && (
                      <ElementSelectorEditor
                        value={variable.element || {}}
                        onChange={(element) => updateVariable(index, { ...variable, element })}
                        inputClass={inputClass}
                        smallInputClass={smallInputClass}
                      />
                    )}

                    {variable.type === VariableType.TEXT && (
                      <div>
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                          Text Value
                        </label>
                        <input
                          type="text"
                          value={variable.text || ''}
                          onChange={(e) =>
                            updateVariable(index, { ...variable, text: e.target.value })
                          }
                          placeholder="Text value (supports {context.variables})"
                          className={inputClass}
                        />
                      </div>
                    )}

                    {variable.type === VariableType.NUMBER && (
                      <div>
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                          Number Value
                        </label>
                        <input
                          type="number"
                          value={variable.number ?? 0}
                          onChange={(e) =>
                            updateVariable(index, {
                              ...variable,
                              number: parseFloat(e.target.value) || 0,
                            })
                          }
                          className={inputClass}
                        />
                      </div>
                    )}

                    {variable.type === VariableType.COORDS && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                            X
                          </label>
                          <input
                            type="number"
                            value={variable.coords?.x ?? 0}
                            onChange={(e) =>
                              updateVariable(index, {
                                ...variable,
                                coords: {
                                  x: parseInt(e.target.value) || 0,
                                  y: variable.coords?.y ?? 0,
                                },
                              })
                            }
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                            Y
                          </label>
                          <input
                            type="number"
                            value={variable.coords?.y ?? 0}
                            onChange={(e) =>
                              updateVariable(index, {
                                ...variable,
                                coords: {
                                  x: variable.coords?.x ?? 0,
                                  y: parseInt(e.target.value) || 0,
                                },
                              })
                            }
                            className={inputClass}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Element selector sub-editor
function ElementSelectorEditor({
  value,
  onChange,
  inputClass,
  smallInputClass,
}: {
  value: ElementSelector;
  onChange: (value: ElementSelector) => void;
  inputClass: string;
  smallInputClass: string;
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          Resource ID
        </label>
        <input
          type="text"
          value={value.resource_id || ''}
          onChange={(e) => onChange({ ...value, resource_id: e.target.value })}
          placeholder="com.example:id/button"
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Text</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={value.text || ''}
            onChange={(e) => onChange({ ...value, text: e.target.value })}
            placeholder="Button text"
            className={`${inputClass} flex-1`}
          />
          <select
            value={value.text_match_mode || MatchMode.EXACT}
            onChange={(e) => onChange({ ...value, text_match_mode: e.target.value as MatchMode })}
            className={smallInputClass}
          >
            {MATCH_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          Content Description
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={value.content_desc || ''}
            onChange={(e) => onChange({ ...value, content_desc: e.target.value })}
            placeholder="Content description"
            className={`${inputClass} flex-1`}
          />
          <select
            value={value.content_desc_match_mode || MatchMode.EXACT}
            onChange={(e) =>
              onChange({ ...value, content_desc_match_mode: e.target.value as MatchMode })
            }
            className={smallInputClass}
          >
            {MATCH_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

// Get a brief summary of the variable value
function getVariableSummary(variable: PresetVariable): string {
  switch (variable.type) {
    case VariableType.ELEMENT: {
      const el = variable.element;
      if (!el) return 'empty';
      if (el.resource_id) return `id:${el.resource_id.split('/').pop()}`;
      if (el.text) return `"${el.text.slice(0, 15)}"`;
      if (el.content_desc) return `desc:${el.content_desc.slice(0, 15)}`;
      return 'empty';
    }
    case VariableType.TEXT:
      return variable.text ? `"${variable.text.slice(0, 20)}"` : 'empty';
    case VariableType.NUMBER:
      return String(variable.number ?? 0);
    case VariableType.COORDS:
      return `(${variable.coords?.x ?? 0}, ${variable.coords?.y ?? 0})`;
    default:
      return '';
  }
}
