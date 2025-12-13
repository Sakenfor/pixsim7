import { useState, useEffect } from 'react';
import { ActionType, MatchMode, VariableType, type PresetVariable, type AppActionPreset } from '../types';
import { automationService } from '@features/automation/lib/core/automationService';

interface ActionParamsEditorProps {
  actionType: ActionType;
  params: Record<string, any>;
  onChange: (params: Record<string, any>) => void;
  variables?: PresetVariable[];
}

const MATCH_MODE_OPTIONS = [
  { value: MatchMode.EXACT, label: 'Exact match' },
  { value: MatchMode.CONTAINS, label: 'Contains' },
  { value: MatchMode.STARTS_WITH, label: 'Starts with' },
  { value: MatchMode.ENDS_WITH, label: 'Ends with' },
  { value: MatchMode.REGEX, label: 'Regex' },
];

// Reusable component for text field with match mode
function TextMatchField({
  label,
  value,
  matchMode,
  onValueChange,
  onMatchModeChange,
  placeholder,
  inputClass,
}: {
  label: string;
  value: string;
  matchMode: MatchMode;
  onValueChange: (value: string) => void;
  onMatchModeChange: (mode: MatchMode) => void;
  placeholder?: string;
  inputClass: string;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs text-gray-600 dark:text-gray-400">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={placeholder}
          className={`${inputClass} flex-1`}
        />
        <select
          value={matchMode}
          onChange={(e) => onMatchModeChange(e.target.value as MatchMode)}
          className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          title="Match mode"
        >
          {MATCH_MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// Variable selector for element-based actions
function ElementVariableSelector({
  variables,
  selectedVar,
  onSelect,
  onClear,
}: {
  variables: PresetVariable[];
  selectedVar?: string;
  onSelect: (variable: PresetVariable) => void;
  onClear: () => void;
}) {
  const elementVars = variables.filter((v) => v.type === VariableType.ELEMENT);

  if (elementVars.length === 0) return null;

  return (
    <div className="mb-3 p-2 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-purple-700 dark:text-purple-300">Use variable:</span>
        {elementVars.map((v) => (
          <button
            key={v.name}
            type="button"
            onClick={() => onSelect(v)}
            className={`px-2 py-0.5 text-xs rounded font-mono transition-colors ${
              selectedVar === v.name
                ? 'bg-purple-600 text-white'
                : 'bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-700'
            }`}
          >
            ${v.name}
          </button>
        ))}
        {selectedVar && (
          <button
            type="button"
            onClick={onClear}
            className="px-2 py-0.5 text-xs rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Clear
          </button>
        )}
      </div>
      {selectedVar && (
        <div className="mt-1 text-xs text-purple-600 dark:text-purple-400">
          Using <code className="font-mono">${selectedVar}</code> - manual fields below are ignored
        </div>
      )}
    </div>
  );
}

// Separate component for Call Preset to handle async preset loading
function CallPresetParams({
  params,
  onChange,
  inputClass,
}: {
  params: Record<string, any>;
  onChange: (params: Record<string, any>) => void;
  inputClass: string;
}) {
  const [presets, setPresets] = useState<AppActionPreset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    automationService.getPresets()
      .then(setPresets)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const updateParam = (key: string, value: any) => {
    onChange({ ...(params || {}), [key]: value });
  };

  // Filter to show snippets first, then other presets
  const sortedPresets = [...presets].sort((a, b) => {
    const aSnippet = a.category?.toLowerCase() === 'snippet' ? 0 : 1;
    const bSnippet = b.category?.toLowerCase() === 'snippet' ? 0 : 1;
    if (aSnippet !== bSnippet) return aSnippet - bSnippet;
    return a.name.localeCompare(b.name);
  });

  const selectedPreset = presets.find(p => p.id === params.preset_id);

  return (
    <div className="space-y-2">
      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          Preset to Call
        </label>
        <select
          value={params.preset_id ?? ''}
          onChange={(e) => updateParam('preset_id', e.target.value ? parseInt(e.target.value) : 0)}
          className={inputClass}
          disabled={loading}
        >
          <option value="">Select a preset...</option>
          {sortedPresets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.category?.toLowerCase() === 'snippet' ? '📦 ' : ''}
              {preset.name} (#{preset.id})
              {preset.category ? ` [${preset.category}]` : ''}
            </option>
          ))}
        </select>
        {selectedPreset && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {selectedPreset.actions.length} action(s)
            {selectedPreset.description && ` — ${selectedPreset.description}`}
          </p>
        )}
      </div>
      <div>
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={params.inherit_variables !== false}
            onChange={(e) => updateParam('inherit_variables', e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
          />
          Inherit variables
        </label>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 ml-6">
          Pass current variables (email, password, etc.) to the called preset
        </p>
      </div>
    </div>
  );
}

export function ActionParamsEditor({ actionType, params, onChange, variables = [] }: ActionParamsEditorProps) {
  const updateParam = (key: string, value: any) => {
    onChange({ ...(params || {}), [key]: value });
  };

  // Apply element variable to params
  const applyElementVariable = (variable: PresetVariable) => {
    const el = variable.element || {};
    onChange({
      ...params,
      _variable: variable.name,
      resource_id: el.resource_id || '',
      text: el.text || '',
      text_match_mode: el.text_match_mode || MatchMode.EXACT,
      content_desc: el.content_desc || '',
      content_desc_match_mode: el.content_desc_match_mode || MatchMode.EXACT,
    });
  };

  const clearVariable = () => {
    const { _variable, ...rest } = params;
    onChange(rest);
  };

  const inputClass = "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent";

  switch (actionType) {
    case ActionType.WAIT:
      return (
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            Seconds
          </label>
          <input
            type="number"
            value={params?.seconds ?? 1}
            onChange={(e) => updateParam('seconds', parseFloat(e.target.value))}
            step="0.1"
            min="0"
            className={inputClass}
          />
        </div>
      );

    case ActionType.LAUNCH_APP:
      return (
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            Package Name (optional)
          </label>
          <input
            type="text"
            value={params.package ?? ''}
            onChange={(e) => updateParam('package', e.target.value)}
            placeholder="com.example.app"
            className={inputClass}
          />
        </div>
      );

    case ActionType.OPEN_DEEPLINK:
      return (
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            Deep Link URI
          </label>
          <input
            type="text"
            value={params.uri ?? ''}
            onChange={(e) => updateParam('uri', e.target.value)}
            placeholder="myapp://login or https://app.com/screen"
            className={inputClass}
          />
        </div>
      );

    case ActionType.START_ACTIVITY:
      return (
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            Activity Component
          </label>
          <input
            type="text"
            value={params.component ?? ''}
            onChange={(e) => updateParam('component', e.target.value)}
            placeholder="com.example.app/.LoginActivity"
            className={inputClass}
          />
        </div>
      );

    case ActionType.CLICK_COORDS:
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">X (0-1 or px)</label>
            <input
              type="number"
              step="any"
              value={params.x ?? 0.5}
              onChange={(e) => updateParam('x', parseFloat(e.target.value) || 0)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Y (0-1 or px)</label>
            <input
              type="number"
              step="any"
              value={params.y ?? 0.5}
              onChange={(e) => updateParam('y', parseFloat(e.target.value) || 0)}
              className={inputClass}
            />
          </div>
        </div>
      );

    case ActionType.TYPE_TEXT:
      return (
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            Text
          </label>
          <input
            type="text"
            value={params.text ?? ''}
            onChange={(e) => updateParam('text', e.target.value)}
            placeholder="Text to type (supports {variables})"
            className={inputClass}
          />
        </div>
      );

    case ActionType.SWIPE:
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">X1 (0-1 or px)</label>
              <input
                type="number"
                step="any"
                value={params.x1 ?? 0.5}
                onChange={(e) => updateParam('x1', parseFloat(e.target.value) || 0)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Y1 (0-1 or px)</label>
              <input
                type="number"
                step="any"
                value={params.y1 ?? 0.7}
                onChange={(e) => updateParam('y1', parseFloat(e.target.value) || 0)}
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">X2 (0-1 or px)</label>
              <input
                type="number"
                step="any"
                value={params.x2 ?? 0.5}
                onChange={(e) => updateParam('x2', parseFloat(e.target.value) || 0)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Y2 (0-1 or px)</label>
              <input
                type="number"
                step="any"
                value={params.y2 ?? 0.3}
                onChange={(e) => updateParam('y2', parseFloat(e.target.value) || 0)}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              Duration (ms)
            </label>
            <input
              type="number"
              value={params.duration_ms ?? 300}
              onChange={(e) => updateParam('duration_ms', parseInt(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>
      );

    case ActionType.WAIT_FOR_ELEMENT:
      return (
        <div className="space-y-2">
          <ElementVariableSelector
            variables={variables}
            selectedVar={params._variable}
            onSelect={applyElementVariable}
            onClear={clearVariable}
          />
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              Resource ID (optional)
            </label>
            <input
              type="text"
              value={params.resource_id ?? ''}
              onChange={(e) => updateParam('resource_id', e.target.value)}
              placeholder="com.example:id/button"
              className={inputClass}
              disabled={!!params._variable}
            />
          </div>
          <TextMatchField
            label="Text (optional)"
            value={params.text ?? ''}
            matchMode={params.text_match_mode ?? MatchMode.EXACT}
            onValueChange={(v) => updateParam('text', v)}
            onMatchModeChange={(m) => updateParam('text_match_mode', m)}
            inputClass={inputClass}
          />
          <TextMatchField
            label="Content Description (optional)"
            value={params.content_desc ?? ''}
            matchMode={params.content_desc_match_mode ?? MatchMode.EXACT}
            onValueChange={(v) => updateParam('content_desc', v)}
            onMatchModeChange={(m) => updateParam('content_desc_match_mode', m)}
            inputClass={inputClass}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                Timeout (s)
              </label>
              <input
                type="number"
                value={params.timeout ?? 10}
                onChange={(e) => updateParam('timeout', parseInt(e.target.value))}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                Interval (s)
              </label>
              <input
                type="number"
                value={params.interval ?? 1}
                onChange={(e) => updateParam('interval', parseFloat(e.target.value))}
                step="0.1"
                className={inputClass}
              />
            </div>
          </div>
        </div>
      );

    case ActionType.CLICK_ELEMENT:
      return (
        <div className="space-y-2">
          <ElementVariableSelector
            variables={variables}
            selectedVar={params._variable}
            onSelect={applyElementVariable}
            onClear={clearVariable}
          />
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              Resource ID (optional)
            </label>
            <input
              type="text"
              value={params.resource_id ?? ''}
              onChange={(e) => updateParam('resource_id', e.target.value)}
              placeholder="com.example:id/button"
              className={inputClass}
              disabled={!!params._variable}
            />
          </div>
          <TextMatchField
            label="Text (optional)"
            value={params.text ?? ''}
            matchMode={params.text_match_mode ?? MatchMode.EXACT}
            onValueChange={(v) => updateParam('text', v)}
            onMatchModeChange={(m) => updateParam('text_match_mode', m)}
            inputClass={inputClass}
          />
          <TextMatchField
            label="Content Description (optional)"
            value={params.content_desc ?? ''}
            matchMode={params.content_desc_match_mode ?? MatchMode.EXACT}
            onValueChange={(v) => updateParam('content_desc', v)}
            onMatchModeChange={(m) => updateParam('content_desc_match_mode', m)}
            inputClass={inputClass}
          />
        </div>
      );

    case ActionType.REPEAT:
      return (
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            Count
          </label>
          <input
            type="number"
            value={params.count ?? 1}
            onChange={(e) => updateParam('count', parseInt(e.target.value))}
            min="1"
            className={inputClass}
          />
        </div>
      );

    case ActionType.CALL_PRESET:
      return <CallPresetParams params={params} onChange={onChange} inputClass={inputClass} />;

    case ActionType.PRESS_BACK:
    case ActionType.PRESS_HOME:
    case ActionType.EXIT_APP:
    case ActionType.SCREENSHOT:
      return (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          This action has no parameters.
        </div>
      );

    case ActionType.IF_ELEMENT_EXISTS:
    case ActionType.IF_ELEMENT_NOT_EXISTS:
      return (
        <div className="space-y-2">
          <ElementVariableSelector
            variables={variables}
            selectedVar={params._variable}
            onSelect={applyElementVariable}
            onClear={clearVariable}
          />
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              Resource ID (optional)
            </label>
            <input
              type="text"
              value={params.resource_id ?? ''}
              onChange={(e) => updateParam('resource_id', e.target.value)}
              placeholder="com.example:id/button"
              className={inputClass}
              disabled={!!params._variable}
            />
          </div>
          <TextMatchField
            label="Text (optional)"
            value={params.text ?? ''}
            matchMode={params.text_match_mode ?? MatchMode.EXACT}
            onValueChange={(v) => updateParam('text', v)}
            onMatchModeChange={(m) => updateParam('text_match_mode', m)}
            inputClass={inputClass}
          />
          <TextMatchField
            label="Content Description (optional)"
            value={params.content_desc ?? ''}
            matchMode={params.content_desc_match_mode ?? MatchMode.EXACT}
            onValueChange={(v) => updateParam('content_desc', v)}
            onMatchModeChange={(m) => updateParam('content_desc_match_mode', m)}
            inputClass={inputClass}
          />
        </div>
      );

    default:
      return (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Unknown action type
        </div>
      );
  }
}
