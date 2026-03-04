/**
 * Analysis Settings Module
 *
 * Manage default analyzer selection and advanced analyzer overrides.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ASSET_ANALYZER_INTENT_KEYS,
  DEFAULT_ASSET_ANALYZER_ID,
  DEFAULT_PROMPT_ANALYZER_ID,
  useAnalyzerSettingsStore,
} from '@lib/analyzers';
import {
  createAnalysisBackfill,
  listAnalysisBackfills,
  pauseAnalysisBackfill,
  resumeAnalysisBackfill,
  cancelAnalysisBackfill,
  type AnalysisBackfillResponse,
  type AnalysisBackfillStatus,
  type CreateAnalysisBackfillRequest,
} from '@lib/api/analyses';
import {
  listAnalyzers,
  listAnalysisPoints,
  listAnalyzerInstances,
  createAnalyzerInstance,
  updateAnalyzerInstance,
  deleteAnalyzerInstance,
  type AnalyzerInfo,
  type AnalyzerInstance,
  type AnalysisPointInfo,
  type CreateAnalyzerInstanceRequest,
  type UpdateAnalyzerInstanceRequest,
} from '@lib/api/analyzers';
import {
  getUserPreferences,
  updatePreferenceKey,
  type AnalyzerPreferences,
} from '@lib/api/userPreferences';
import { isAdminUser } from '@lib/auth/userRoles';

import { useMediaSettingsStore } from '@features/assets';
import { usePromptSettingsStore } from '@features/prompts/stores/promptSettingsStore';

import { useAuthStore } from '@/stores/authStore';

import { settingsRegistry } from '../../lib/core/registry';

import {
  AnalyzerCatalog,
  type AnalysisPointSelection,
  type CatalogAnalysisPointDefinition,
} from './AnalyzerCatalog';

type FormMode = 'create' | 'edit';
type AssetIntentKey = (typeof ASSET_ANALYZER_INTENT_KEYS)[number];

interface FormState {
  label: string;
  analyzer_id: string;
  provider_id: string;
  model_id: string;
  description: string;
  enabled: boolean;
  priority: number;
  config: string; // JSON string
}

interface BackfillFormState {
  media_type: '' | 'image' | 'video' | 'audio' | '3d_model';
  analyzer_id: string;
  analyzer_intent: '' | AssetIntentKey;
  analysis_point: string;
  batch_size: number;
  priority: number;
}

const INITIAL_FORM_STATE: FormState = {
  label: '',
  analyzer_id: '',
  provider_id: '',
  model_id: '',
  description: '',
  enabled: true,
  priority: 0,
  config: '{}',
};
const INITIAL_BACKFILL_FORM_STATE: BackfillFormState = {
  media_type: '',
  analyzer_id: '',
  analyzer_intent: '',
  analysis_point: '',
  batch_size: 100,
  priority: 5,
};
const DEFAULT_VISUAL_SIMILARITY_THRESHOLD = 0.3;
const EMBEDDING_ANALYZER_ID = 'asset:embedding';
const DEFAULT_EMBEDDING_PROVIDER_ID = 'cmd-embedding';
const DEFAULT_EMBEDDING_MODEL_ID = 'clip-default';
const DEFAULT_EMBEDDING_LABEL = 'Visual Embeddings';

const ACTIVE_BACKFILL_STATUSES: AnalysisBackfillStatus[] = ['pending', 'running'];

function extractEmbeddingCommand(config: Record<string, unknown>): string {
  const command = config.command;
  return typeof command === 'string' ? command : '';
}

function normalizeAnalyzerChainPreference(
  listValue: unknown,
  fallback: string
): string[] {
  const chain: string[] = [];

  if (Array.isArray(listValue)) {
    for (const item of listValue) {
      if (typeof item !== 'string') continue;
      const value = item.trim();
      if (value && !chain.includes(value)) {
        chain.push(value);
      }
    }
  }

  if (chain.length === 0) {
    chain.push(fallback);
  }

  return chain;
}

function normalizeAnalyzerChainInput(values: string[], fallback: string): string[] {
  const chain = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const deduped = Array.from(new Set(chain));
  return deduped.length > 0 ? deduped : [fallback];
}

function normalizeOptionalAnalyzerChainInput(values: string[]): string[] {
  const chain = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return Array.from(new Set(chain));
}

function backfillStatusClasses(status: AnalysisBackfillStatus): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400';
    case 'failed':
      return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
    case 'cancelled':
      return 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300';
    case 'paused':
      return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400';
    default:
      return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
  }
}

function isBackfillActive(status: AnalysisBackfillStatus): boolean {
  return ACTIVE_BACKFILL_STATUSES.includes(status);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

/** Mask sensitive config values for display */
function maskConfigValue(key: string, value: unknown): string {
  const sensitiveKeys = ['api_key', 'secret', 'token', 'password', 'key', 'credential'];
  const isSensitive = sensitiveKeys.some(k => key.toLowerCase().includes(k));

  if (isSensitive && typeof value === 'string' && value.length > 0) {
    return value.length > 8
      ? `${value.slice(0, 4)}${'*'.repeat(Math.min(value.length - 4, 12))}`
      : '*'.repeat(value.length);
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

/** Display config as masked key-value pairs */
function MaskedConfig({ config }: { config: Record<string, unknown> }) {
  const entries = Object.entries(config);

  if (entries.length === 0) {
    return <span className="text-neutral-400 dark:text-neutral-500 italic">No config</span>;
  }

  return (
    <div className="space-y-0.5">
      {entries.slice(0, 3).map(([key, value]) => (
        <div key={key} className="flex gap-2 text-[10px]">
          <span className="text-neutral-500 dark:text-neutral-400 font-mono">{key}:</span>
          <span className="text-neutral-600 dark:text-neutral-300 font-mono truncate">
            {maskConfigValue(key, value)}
          </span>
        </div>
      ))}
      {entries.length > 3 && (
        <div className="text-[10px] text-neutral-400 dark:text-neutral-500">
          +{entries.length - 3} more...
        </div>
      )}
    </div>
  );
}

/** Analyzer instance card */
function InstanceCard({
  instance,
  analyzers,
  onEdit,
  onDelete,
  onToggle,
  isDeleting,
}: {
  instance: AnalyzerInstance;
  analyzers: AnalyzerInfo[];
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  isDeleting: boolean;
}) {
  const analyzer = analyzers.find(a => a.id === instance.analyzer_id);

  return (
    <div
      className={`p-3 rounded-md border transition-all ${
        isDeleting
          ? 'border-red-300 dark:border-red-700 bg-red-50/60 dark:bg-red-900/20 opacity-50'
          : instance.enabled
          ? 'border-neutral-200 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-900/40'
          : 'border-neutral-200 dark:border-neutral-700 bg-neutral-100/60 dark:bg-neutral-800/40 opacity-60'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-100">
              {instance.label}
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400">
              Priority: {instance.priority}
            </span>
            {analyzer && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                analyzer.kind === 'llm'
                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                  : analyzer.kind === 'vision'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
              }`}>
                {analyzer.kind}
              </span>
            )}
          </div>

          <div className="text-[10px] text-neutral-600 dark:text-neutral-400 mt-1">
            Analyzer: <span className="font-mono">{instance.analyzer_id}</span>
          </div>

          {instance.provider_id && (
            <div className="text-[10px] text-neutral-600 dark:text-neutral-400">
              Provider: <span className="font-mono">{instance.provider_id}</span>
              {instance.model_id && <> / Model: <span className="font-mono">{instance.model_id}</span></>}
            </div>
          )}

          {instance.description && (
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1 italic">
              {instance.description}
            </div>
          )}

          <div className="mt-2">
            <MaskedConfig config={instance.config} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="px-2 py-1 text-[10px] rounded bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-300 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="px-2 py-1 text-[10px] rounded bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 transition-colors disabled:opacity-50"
          >
            Delete
          </button>
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={instance.enabled}
              onChange={onToggle}
              className="sr-only peer"
            />
            <div
              className={`w-9 h-5 rounded-full peer peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all relative ${
                instance.enabled ? 'bg-blue-500' : 'bg-neutral-300 dark:bg-neutral-700'
              }`}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

/** Form for creating/editing analyzer instances */
function InstanceForm({
  mode,
  formState,
  analyzers,
  isSubmitting,
  error,
  onChange,
  onSubmit,
  onCancel,
}: {
  mode: FormMode;
  formState: FormState;
  analyzers: AnalyzerInfo[];
  isSubmitting: boolean;
  error: string | null;
  onChange: (updates: Partial<FormState>) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const [configError, setConfigError] = useState<string | null>(null);

  const handleConfigChange = (value: string) => {
    onChange({ config: value });
    try {
      JSON.parse(value);
      setConfigError(null);
    } catch {
      setConfigError('Invalid JSON');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (configError) return;
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
      <h3 className="text-sm font-semibold mb-4">
        {mode === 'create' ? 'Create New Analyzer Instance' : 'Edit Analyzer Instance'}
      </h3>

      {error && (
        <div className="mb-4 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-[11px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Label */}
        <div>
          <label className="block text-[11px] text-neutral-600 dark:text-neutral-400 mb-1">
            Label <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formState.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="My Custom Analyzer"
            className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600"
            required
          />
        </div>

        {/* Analyzer */}
        <div>
          <label className="block text-[11px] text-neutral-600 dark:text-neutral-400 mb-1">
            Analyzer <span className="text-red-500">*</span>
          </label>
          <select
            value={formState.analyzer_id}
            onChange={(e) => onChange({ analyzer_id: e.target.value })}
            className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600"
            required
            disabled={mode === 'edit'}
          >
            <option value="">Select an analyzer...</option>
            {analyzers.map(analyzer => (
              <option key={analyzer.id} value={analyzer.id}>
                {analyzer.name} ({analyzer.kind} / {analyzer.target})
              </option>
            ))}
          </select>
          {mode === 'edit' && (
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
              Analyzer cannot be changed after creation
            </p>
          )}
        </div>

        {/* Provider ID */}
        <div>
          <label className="block text-[11px] text-neutral-600 dark:text-neutral-400 mb-1">
            Provider ID
          </label>
          <input
            type="text"
            value={formState.provider_id}
            onChange={(e) => onChange({ provider_id: e.target.value })}
            placeholder="openai, anthropic, etc."
            className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600"
          />
        </div>

        {/* Model ID */}
        <div>
          <label className="block text-[11px] text-neutral-600 dark:text-neutral-400 mb-1">
            Model ID
          </label>
          <input
            type="text"
            value={formState.model_id}
            onChange={(e) => onChange({ model_id: e.target.value })}
            placeholder="gpt-4, claude-3-sonnet, etc."
            className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-[11px] text-neutral-600 dark:text-neutral-400 mb-1">
            Description
          </label>
          <input
            type="text"
            value={formState.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Optional description..."
            className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600"
          />
        </div>

        {/* Priority & Enabled */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] text-neutral-600 dark:text-neutral-400 mb-1">
              Priority
            </label>
            <input
              type="number"
              value={formState.priority}
              onChange={(e) => onChange({ priority: parseInt(e.target.value, 10) || 0 })}
              className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600"
            />
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
              Higher priority = checked first
            </p>
          </div>
          <div>
            <label className="block text-[11px] text-neutral-600 dark:text-neutral-400 mb-1">
              Enabled
            </label>
            <div className="flex items-center h-10">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState.enabled}
                  onChange={(e) => onChange({ enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div
                  className={`w-11 h-6 rounded-full peer peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all relative ${
                    formState.enabled ? 'bg-blue-500' : 'bg-neutral-300 dark:bg-neutral-700'
                  }`}
                />
                <span className="ml-2 text-sm text-neutral-700 dark:text-neutral-300">
                  {formState.enabled ? 'Active' : 'Disabled'}
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Config (JSON) */}
        <div>
          <label className="block text-[11px] text-neutral-600 dark:text-neutral-400 mb-1">
            Config (JSON)
          </label>
          <textarea
            value={formState.config}
            onChange={(e) => handleConfigChange(e.target.value)}
            rows={4}
            placeholder='{"api_key": "sk-...", "temperature": 0.7}'
            className={`w-full px-3 py-2 border rounded text-sm font-mono bg-white dark:bg-neutral-900 ${
              configError
                ? 'border-red-400 dark:border-red-600'
                : 'border-neutral-300 dark:border-neutral-600'
            }`}
          />
          {configError && (
            <p className="text-[10px] text-red-600 dark:text-red-400 mt-1">{configError}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-4">
        <button
          type="submit"
          disabled={isSubmitting || !!configError || !formState.label || !formState.analyzer_id}
          className="flex-1 px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white rounded text-sm transition-colors"
        >
          {isSubmitting ? 'Saving...' : mode === 'create' ? 'Create Instance' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-3 py-2 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-300 rounded text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function AnalyzerChainEditor({
  chain,
  analyzers,
  allowEmpty = false,
  fallbackLabel,
  disabled = false,
  onChange,
}: {
  chain: string[];
  analyzers: AnalyzerInfo[];
  allowEmpty?: boolean;
  fallbackLabel?: string;
  disabled?: boolean;
  onChange: (next: string[]) => void;
}) {
  const options = analyzers.map((analyzer) => ({
    value: analyzer.id,
    label: analyzer.name,
  }));

  const addEntry = () => {
    if (disabled) return;
    const firstOption = options[0]?.value;
    if (!firstOption) return;
    onChange([...chain, firstOption]);
  };

  const updateEntry = (index: number, value: string) => {
    const next = [...chain];
    next[index] = value;
    onChange(next);
  };

  const moveEntry = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= chain.length) return;
    const next = [...chain];
    const current = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = current;
    onChange(next);
  };

  const removeEntry = (index: number) => {
    const next = chain.filter((_, i) => i !== index);
    if (next.length === 0 && !allowEmpty) {
      return;
    }
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {chain.length === 0 ? (
        <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
          {fallbackLabel ?? 'No analyzer configured.'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {chain.map((value, index) => {
            const exists = analyzers.some((analyzer) => analyzer.id === value);
            return (
              <div
                key={`${value}-${index}`}
                className="flex items-center gap-1.5"
              >
                <span className="text-[10px] w-4 text-neutral-500 dark:text-neutral-400 text-right">
                  {index + 1}.
                </span>
                <select
                  value={value}
                  disabled={disabled}
                  onChange={(e) => updateEntry(index, e.target.value)}
                  className="flex-1 max-w-xl px-2 py-1.5 text-[11px] border rounded bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600"
                >
                  {!exists && (
                    <option value={value}>Unavailable: {value}</option>
                  )}
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={disabled || index === 0}
                  onClick={() => moveEntry(index, -1)}
                  className="px-2 py-1 text-[10px] rounded bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 disabled:opacity-50"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={disabled || index === chain.length - 1}
                  onClick={() => moveEntry(index, 1)}
                  className="px-2 py-1 text-[10px] rounded bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 disabled:opacity-50"
                >
                  ↓
                </button>
                <button
                  type="button"
                  disabled={disabled || (!allowEmpty && chain.length <= 1)}
                  onClick={() => removeEntry(index)}
                  className="px-2 py-1 text-[10px] rounded bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || options.length === 0}
          onClick={addEntry}
          className="px-2 py-1 text-[10px] rounded bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white"
        >
          + Add Fallback
        </button>
        {fallbackLabel && (
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
            {fallbackLabel}
          </span>
        )}
      </div>
    </div>
  );
}

type RoutingControl =
  | 'prompt_default'
  | 'image_default'
  | 'video_default'
  | 'intent_override'
  | 'similarity_threshold';

interface RoutingEntry {
  id: string;
  group: 'prompt' | 'asset' | 'system';
  label: string;
  description: string;
  control: RoutingControl;
  target: 'prompt' | 'asset' | null;
  intentKey?: string;
  mediaType?: 'image' | 'video' | null;
  supportsChain: boolean;
}

const FALLBACK_ROUTING_ENTRIES: RoutingEntry[] = [
  {
    id: 'prompt_parsing',
    group: 'prompt',
    label: 'Prompt parsing',
    description: 'Tag extraction and parser analysis during prompt editing.',
    target: 'prompt',
    control: 'prompt_default',
    supportsChain: true,
  },
  {
    id: 'prompt_generation',
    group: 'prompt',
    label: 'Generation workflow',
    description: 'Prompt analysis before generation execution.',
    target: 'prompt',
    control: 'prompt_default',
    supportsChain: true,
  },
  {
    id: 'asset_ingest_on_ingest',
    group: 'asset',
    label: 'Asset ingestion (on_ingest fallback)',
    description: 'Default route when ingestion does not specify an analyzer.',
    target: 'asset',
    control: 'image_default',
    mediaType: 'image',
    supportsChain: true,
  },
  {
    id: 'character_ingest_face',
    group: 'asset',
    label: 'Character ingest: Face',
    description: 'Face-mode character reference analysis.',
    target: 'asset',
    control: 'intent_override',
    intentKey: 'character_ingest_face',
    supportsChain: true,
  },
  {
    id: 'character_ingest_sheet',
    group: 'asset',
    label: 'Character ingest: Sheet / Composite',
    description: 'Sheet/composite character reference analysis.',
    target: 'asset',
    control: 'intent_override',
    intentKey: 'character_ingest_sheet',
    supportsChain: true,
  },
  {
    id: 'scene_prep_location',
    group: 'asset',
    label: 'Scene prep: Location',
    description: 'Scene prep location-reference analysis.',
    target: 'asset',
    control: 'intent_override',
    intentKey: 'scene_prep_location',
    supportsChain: true,
  },
  {
    id: 'scene_prep_style',
    group: 'asset',
    label: 'Scene prep: Style',
    description: 'Scene prep style-reference analysis.',
    target: 'asset',
    control: 'intent_override',
    intentKey: 'scene_prep_style',
    supportsChain: true,
  },
  {
    id: 'manual_analysis_image',
    group: 'asset',
    label: 'Manual analysis: Image',
    description: 'Image analysis calls when analyzer_id is omitted.',
    target: 'asset',
    control: 'image_default',
    mediaType: 'image',
    supportsChain: true,
  },
  {
    id: 'manual_analysis_video',
    group: 'asset',
    label: 'Manual analysis: Video',
    description: 'Video analysis calls when analyzer_id is omitted.',
    target: 'asset',
    control: 'video_default',
    mediaType: 'video',
    supportsChain: true,
  },
  {
    id: 'similarity_threshold',
    group: 'system',
    label: 'Visual similarity threshold',
    description: 'Default threshold for similar-content search.',
    target: null,
    control: 'similarity_threshold',
    supportsChain: false,
  },
];

function mapAnalysisPointToRoutingEntry(point: AnalysisPointInfo): RoutingEntry {
  return {
    id: point.id,
    group: point.group,
    label: point.label,
    description: point.description,
    control: point.control,
    target: point.target,
    intentKey: point.intent_key ?? undefined,
    mediaType: point.media_type ?? null,
    supportsChain: point.supports_chain,
  };
}

interface AnalysisRoutingCatalogProps {
  routingEntries: RoutingEntry[];
  promptAnalyzers: AnalyzerInfo[];
  assetAnalyzers: AnalyzerInfo[];
  promptDefaultChain: string[];
  imageDefaultChain: string[];
  videoDefaultChain: string[];
  intentAnalyzerChains: Partial<Record<AssetIntentKey, string[]>>;
  analysisPointChains: Record<string, string[]>;
  visualSimilarityThreshold: number;
  isSavingDefaults: boolean;
  defaultsError: string | null;
  isAtRecommendedDefaults: boolean;
  pointSelections: Record<string, AnalysisPointSelection>;
  onPromptChainChange: (values: string[]) => void;
  onImageChainChange: (values: string[]) => void;
  onVideoChainChange: (values: string[]) => void;
  onIntentChainChange: (intent: AssetIntentKey, values: string[]) => void;
  onAnalysisPointChainChange: (pointId: string, values: string[]) => void;
  onSimilarityChange: (value: number) => void;
  onReset: () => void;
}

function AnalysisRoutingCatalog({
  routingEntries,
  promptAnalyzers,
  assetAnalyzers,
  promptDefaultChain,
  imageDefaultChain,
  videoDefaultChain,
  intentAnalyzerChains,
  analysisPointChains,
  visualSimilarityThreshold,
  isSavingDefaults,
  defaultsError,
  isAtRecommendedDefaults,
  pointSelections,
  onPromptChainChange,
  onImageChainChange,
  onVideoChainChange,
  onIntentChainChange,
  onAnalysisPointChainChange,
  onSimilarityChange,
  onReset,
}: AnalysisRoutingCatalogProps) {
  const [selectedRoutingId, setSelectedRoutingId] = useState<string>(routingEntries[0]?.id ?? '');

  const selectedEntry = useMemo(() => {
    if (routingEntries.length === 0) return null;
    return routingEntries.find((entry) => entry.id === selectedRoutingId) ?? routingEntries[0];
  }, [routingEntries, selectedRoutingId]);

  useEffect(() => {
    if (routingEntries.length === 0) {
      if (selectedRoutingId !== '') {
        setSelectedRoutingId('');
      }
      return;
    }
    const hasSelected = routingEntries.some((entry) => entry.id === selectedRoutingId);
    if (!hasSelected) {
      setSelectedRoutingId(routingEntries[0]?.id ?? '');
    }
  }, [routingEntries, selectedRoutingId]);

  const groupedEntries = useMemo(() => {
    return {
      prompt: routingEntries.filter((entry) => entry.group === 'prompt'),
      asset: routingEntries.filter((entry) => entry.group === 'asset'),
      system: routingEntries.filter((entry) => entry.group === 'system'),
    };
  }, [routingEntries]);

  const getSidebarValue = useCallback(
    (entry: RoutingEntry): string => {
      if (entry.control === 'similarity_threshold') {
        return visualSimilarityThreshold.toFixed(2);
      }
      const selection = pointSelections[entry.id];
      const chain = Array.isArray(selection?.analyzerIds) && selection.analyzerIds.length > 0
        ? selection.analyzerIds
        : selection?.analyzerId
          ? [selection.analyzerId]
          : [];
      if (chain.length === 0) return 'unresolved';
      if (chain.length <= 2) return chain.join(' -> ');
      return `${chain[0]} -> ${chain[1]} (+${chain.length - 2})`;
    },
    [pointSelections, visualSimilarityThreshold]
  );

  const defaultImageAnalyzer = imageDefaultChain[0] ?? DEFAULT_ASSET_ANALYZER_ID;
  const selectedIntentKey = selectedEntry?.intentKey;
  const isKnownIntentKey = Boolean(
    selectedIntentKey &&
    ASSET_ANALYZER_INTENT_KEYS.includes(selectedIntentKey as AssetIntentKey)
  );
  const currentIntentChain =
    selectedEntry?.control === 'intent_override' && selectedIntentKey && isKnownIntentKey
      ? (intentAnalyzerChains[selectedIntentKey as AssetIntentKey] ?? [])
      : [];
  const currentPointSelection = selectedEntry ? pointSelections[selectedEntry.id] : undefined;
  const currentPointChain =
    Array.isArray(currentPointSelection?.analyzerIds) && currentPointSelection.analyzerIds.length > 0
      ? currentPointSelection.analyzerIds
      : currentPointSelection?.analyzerId
        ? [currentPointSelection.analyzerId]
        : [];
  const currentPointOverrideChain = analysisPointChains[selectedEntry.id] ?? [];

  if (!selectedEntry) {
    return (
      <section className="space-y-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Analysis Point Routing
        </h3>
        <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
          No analysis points are currently defined by the backend.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Analysis Point Routing
      </h3>
      <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
        Catalog view of runtime routing. Pick an analysis point from the left to inspect or change its analyzer chain.
      </p>

      <div className="flex border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden" style={{ height: 460 }}>
        <div className="w-72 border-r border-neutral-200 dark:border-neutral-700 bg-neutral-50/70 dark:bg-neutral-900/50 shrink-0 overflow-auto">
          <div className="p-2 space-y-2">
            {([
              ['PROMPT', groupedEntries.prompt],
              ['ASSET', groupedEntries.asset],
              ['SYSTEM', groupedEntries.system],
            ] as const).map(([groupLabel, entries]) => (
              <div key={groupLabel}>
                <div className="text-[9px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 px-2 py-1">
                  {groupLabel}
                </div>
                <div className="space-y-1">
                  {entries.map((entry) => {
                    const isSelected = entry.id === selectedEntry.id;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => setSelectedRoutingId(entry.id)}
                        className={`w-full text-left px-2 py-1.5 rounded transition-colors ${
                          isSelected
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100'
                            : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                        }`}
                      >
                        <div className="text-[11px] font-medium truncate">{entry.label}</div>
                        <div className="text-[9px] font-mono text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                          {getSidebarValue(entry)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 bg-white dark:bg-neutral-900 p-4 overflow-auto min-w-0">
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                {selectedEntry.label}
              </h4>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                {selectedEntry.description}
              </p>
            </div>

            {selectedEntry.control !== 'similarity_threshold' && (
              <div className="p-2.5 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50/70 dark:bg-neutral-800/40">
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400">Current routed analyzer chain</div>
                {currentPointChain.length > 0 ? (
                  <div className="space-y-1 mt-1">
                    {currentPointChain.map((analyzerId, index) => (
                      <div key={`${analyzerId}-${index}`} className="text-[11px] font-mono text-neutral-800 dark:text-neutral-100">
                        {index + 1}. {analyzerId}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] font-mono text-neutral-800 dark:text-neutral-100 mt-0.5">
                    unresolved
                  </div>
                )}
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
                  Source: {currentPointSelection?.source ?? 'unavailable'}
                </div>
              </div>
            )}

            {(selectedEntry.control === 'prompt_default') && (
              <div className="space-y-2">
                <label className="block text-[10px] font-semibold text-neutral-700 dark:text-neutral-300">
                  Prompt analyzer chain
                </label>
                <AnalyzerChainEditor
                  chain={promptDefaultChain}
                  analyzers={promptAnalyzers}
                  disabled={isSavingDefaults}
                  onChange={onPromptChainChange}
                />
              </div>
            )}

            {(selectedEntry.control === 'image_default') && (
              <div className="space-y-2">
                <label className="block text-[10px] font-semibold text-neutral-700 dark:text-neutral-300">
                  Image analyzer chain
                </label>
                <AnalyzerChainEditor
                  chain={imageDefaultChain}
                  analyzers={assetAnalyzers}
                  disabled={isSavingDefaults}
                  onChange={onImageChainChange}
                />
              </div>
            )}

            {(selectedEntry.control === 'video_default') && (
              <div className="space-y-2">
                <label className="block text-[10px] font-semibold text-neutral-700 dark:text-neutral-300">
                  Video analyzer chain
                </label>
                <AnalyzerChainEditor
                  chain={videoDefaultChain}
                  analyzers={assetAnalyzers}
                  disabled={isSavingDefaults}
                  onChange={onVideoChainChange}
                />
              </div>
            )}

            {(selectedEntry.control === 'intent_override' && selectedEntry.intentKey) && (
              <div className="space-y-2">
                <label className="block text-[10px] font-semibold text-neutral-700 dark:text-neutral-300">
                  Intent override chain
                </label>
                {isKnownIntentKey ? (
                  <AnalyzerChainEditor
                    chain={currentIntentChain}
                    analyzers={assetAnalyzers}
                    allowEmpty
                    fallbackLabel={`If empty, falls back to Image chain (${defaultImageAnalyzer}).`}
                    disabled={isSavingDefaults}
                    onChange={(next) => {
                      if (selectedEntry.intentKey) {
                        onIntentChainChange(selectedEntry.intentKey as AssetIntentKey, next);
                      }
                    }}
                  />
                ) : (
                  <div className="p-2 rounded border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/20 text-[10px] text-amber-700 dark:text-amber-300">
                    Intent key <span className="font-mono">{selectedEntry.intentKey}</span> is not recognized by this client yet.
                    Update the frontend intent schema to make this point editable.
                  </div>
                )}
              </div>
            )}

            {(selectedEntry.control === 'similarity_threshold') && (
              <div className="space-y-2 max-w-xl">
                <label className="block text-[10px] font-semibold text-neutral-700 dark:text-neutral-300">
                  Default similarity threshold
                </label>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={visualSimilarityThreshold}
                  onChange={(e) => onSimilarityChange(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="text-[11px] font-mono text-neutral-700 dark:text-neutral-300">
                  {visualSimilarityThreshold.toFixed(2)}
                </div>
              </div>
            )}

            {selectedEntry.control !== 'similarity_threshold' && (
              <div className="space-y-2 pt-2 border-t border-neutral-200 dark:border-neutral-700">
                <label className="block text-[10px] font-semibold text-neutral-700 dark:text-neutral-300">
                  Point-specific chain override (optional)
                </label>
                <AnalyzerChainEditor
                  chain={currentPointOverrideChain}
                  analyzers={selectedEntry.target === 'prompt' ? promptAnalyzers : assetAnalyzers}
                  allowEmpty
                  fallbackLabel="If empty, this point uses its control fallback chain."
                  disabled={isSavingDefaults}
                  onChange={(next) => onAnalysisPointChainChange(selectedEntry.id, next)}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
          {promptAnalyzers.length} text analyzers / {assetAnalyzers.length} media analyzers
        </div>
        <button
          onClick={onReset}
          disabled={isAtRecommendedDefaults || isSavingDefaults}
          className="px-3 py-1.5 text-[11px] rounded bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-700 dark:text-neutral-300 transition-colors"
        >
          Reset to Recommended
        </button>
      </div>

      {isSavingDefaults && (
        <p className="text-[10px] text-neutral-500 dark:text-neutral-400 text-right">
          Saving analyzer defaults...
        </p>
      )}
      {defaultsError && (
        <p className="text-[10px] text-red-700 dark:text-red-400 text-right">
          Failed to save analyzer defaults: {defaultsError}
        </p>
      )}
    </section>
  );
}

interface AnalyzerBackfillPanelProps {
  assetAnalyzers: AnalyzerInfo[];
  runs: AnalysisBackfillResponse[];
  isLoading: boolean;
  error: string | null;
  formState: BackfillFormState;
  isCreating: boolean;
  activeRunActionId: number | null;
  onFormChange: (updates: Partial<BackfillFormState>) => void;
  onCreate: () => void;
  onRefresh: () => void;
  onPause: (runId: number) => void;
  onResume: (runId: number) => void;
  onCancel: (runId: number) => void;
}

function AnalyzerBackfillPanel({
  assetAnalyzers,
  runs,
  isLoading,
  error,
  formState,
  isCreating,
  activeRunActionId,
  onFormChange,
  onCreate,
  onRefresh,
  onPause,
  onResume,
  onCancel,
}: AnalyzerBackfillPanelProps) {
  const sortedRuns = useMemo(
    () => [...runs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [runs]
  );

  return (
    <section className="space-y-3 pt-4 border-t border-neutral-200 dark:border-neutral-700">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Analysis Backfill Runs
          </h3>
          <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
            Queue analysis across existing assets. Dedupe prevents rerunning identical analyzer+input combinations.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="px-3 py-1.5 text-[11px] rounded bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 disabled:opacity-50 text-neutral-700 dark:text-neutral-300 transition-colors"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="p-3 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-900/40 space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="block text-[10px] font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Media type
            </label>
            <select
              value={formState.media_type}
              onChange={(e) =>
                onFormChange({
                  media_type: e.target.value as BackfillFormState['media_type'],
                })
              }
              className="w-full px-2 py-1.5 text-[11px] border rounded bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600"
            >
              <option value="">Any media</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="audio">Audio</option>
              <option value="3d_model">3D model</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Analyzer (optional)
            </label>
            <select
              value={formState.analyzer_id}
              onChange={(e) => onFormChange({ analyzer_id: e.target.value })}
              className="w-full px-2 py-1.5 text-[11px] border rounded bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600"
            >
              <option value="">Auto-resolve from defaults</option>
              {assetAnalyzers.map((analyzer) => (
                <option key={analyzer.id} value={analyzer.id}>
                  {analyzer.name} ({analyzer.id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Intent (optional)
            </label>
            <select
              value={formState.analyzer_intent}
              onChange={(e) =>
                onFormChange({
                  analyzer_intent: e.target.value as BackfillFormState['analyzer_intent'],
                })
              }
              className="w-full px-2 py-1.5 text-[11px] border rounded bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600"
            >
              <option value="">None</option>
              {ASSET_ANALYZER_INTENT_KEYS.map((intent) => (
                <option key={intent} value={intent}>
                  {intent}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Analysis point (optional)
            </label>
            <input
              type="text"
              value={formState.analysis_point}
              onChange={(e) => onFormChange({ analysis_point: e.target.value })}
              placeholder="manual_batch_images"
              className="w-full px-2 py-1.5 text-[11px] border rounded bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Batch size
            </label>
            <input
              type="number"
              min={1}
              max={1000}
              value={formState.batch_size}
              onChange={(e) => onFormChange({ batch_size: Number(e.target.value) || 100 })}
              className="w-full px-2 py-1.5 text-[11px] border rounded bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Priority
            </label>
            <input
              type="number"
              min={0}
              max={10}
              value={formState.priority}
              onChange={(e) => onFormChange({ priority: Number(e.target.value) || 5 })}
              className="w-full px-2 py-1.5 text-[11px] border rounded bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
            Backfill processes assets in ID order and stores checkpoints for resume.
          </p>
          <button
            type="button"
            onClick={onCreate}
            disabled={isCreating}
            className="px-3 py-1.5 text-[11px] rounded bg-blue-500 hover:bg-blue-600 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white transition-colors"
          >
            {isCreating ? 'Creating...' : 'Start Backfill Run'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-[11px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {sortedRuns.length === 0 ? (
        <div className="p-3 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-900/40 text-[11px] text-neutral-500 dark:text-neutral-400">
          No backfill runs yet.
        </div>
      ) : (
        <div className="space-y-2">
          {sortedRuns.map((run) => {
            const progress =
              run.total_assets > 0
                ? Math.min(100, Math.round((run.processed_assets / run.total_assets) * 100))
                : 0;
            const canPause = run.status === 'pending' || run.status === 'running';
            const canResume = run.status === 'paused';
            const canCancel = !['completed', 'failed', 'cancelled'].includes(run.status);
            const actionBusy = activeRunActionId === run.id;

            return (
              <div
                key={run.id}
                className="p-3 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-900/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-100">
                        Run #{run.id}
                      </span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${backfillStatusClasses(run.status)}`}>
                        {run.status}
                      </span>
                      {isBackfillActive(run.status) && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                          active
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">
                      media={run.media_type ?? 'any'} analyzer={run.analyzer_id ?? 'auto'} intent={run.analyzer_intent ?? '-'} point={run.analysis_point ?? '-'}
                    </div>
                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                      created {formatDateTime(run.created_at)} • updated {formatDateTime(run.updated_at)}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {canPause && (
                      <button
                        type="button"
                        onClick={() => onPause(run.id)}
                        disabled={actionBusy}
                        className="px-2 py-1 text-[10px] rounded bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 disabled:opacity-50"
                      >
                        Pause
                      </button>
                    )}
                    {canResume && (
                      <button
                        type="button"
                        onClick={() => onResume(run.id)}
                        disabled={actionBusy}
                        className="px-2 py-1 text-[10px] rounded bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 disabled:opacity-50"
                      >
                        Resume
                      </button>
                    )}
                    {canCancel && (
                      <button
                        type="button"
                        onClick={() => onCancel(run.id)}
                        disabled={actionBusy}
                        className="px-2 py-1 text-[10px] rounded bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-2">
                  <div className="flex items-center justify-between text-[10px] text-neutral-500 dark:text-neutral-400">
                    <span>
                      Processed {run.processed_assets}/{run.total_assets} • Created {run.created_analyses} • Deduped {run.deduped_assets} • Failed {run.failed_assets}
                    </span>
                    <span className="font-mono">{progress}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {run.last_error && (
                  <div className="mt-2 text-[10px] text-red-700 dark:text-red-300">
                    Last error: {run.last_error}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function AnalyzersSettings() {
  const [analyzers, setAnalyzers] = useState<AnalyzerInfo[]>([]);
  const [instances, setInstances] = useState<AnalyzerInstance[]>([]);
  const [routingEntries, setRoutingEntries] = useState<RoutingEntry[]>(FALLBACK_ROUTING_ENTRIES);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [formState, setFormState] = useState<FormState>(INITIAL_FORM_STATE);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);
  const [defaultsError, setDefaultsError] = useState<string | null>(null);
  const [promptDefaultChain, setPromptDefaultChain] = useState<string[]>([DEFAULT_PROMPT_ANALYZER_ID]);
  const [imageDefaultChain, setImageDefaultChain] = useState<string[]>([DEFAULT_ASSET_ANALYZER_ID]);
  const [videoDefaultChain, setVideoDefaultChain] = useState<string[]>([DEFAULT_ASSET_ANALYZER_ID]);
  const [intentAnalyzerChains, setIntentAnalyzerChains] = useState<Partial<Record<AssetIntentKey, string[]>>>({});
  const [analysisPointChains, setAnalysisPointChains] = useState<Record<string, string[]>>({});
  const [backfillRuns, setBackfillRuns] = useState<AnalysisBackfillResponse[]>([]);
  const [backfillForm, setBackfillForm] = useState<BackfillFormState>(INITIAL_BACKFILL_FORM_STATE);
  const [isLoadingBackfills, setIsLoadingBackfills] = useState(false);
  const [isCreatingBackfill, setIsCreatingBackfill] = useState(false);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [activeBackfillActionId, setActiveBackfillActionId] = useState<number | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const setDefaultPromptAnalyzer = usePromptSettingsStore((s) => s.setDefaultAnalyzer);
  const setDefaultImageAnalyzers = useAnalyzerSettingsStore((s) => s.setDefaultImageAnalyzers);
  const setDefaultImageAnalyzer = useAnalyzerSettingsStore((s) => s.setDefaultImageAnalyzer);
  const setDefaultVideoAnalyzers = useAnalyzerSettingsStore((s) => s.setDefaultVideoAnalyzers);
  const setDefaultVideoAnalyzer = useAnalyzerSettingsStore((s) => s.setDefaultVideoAnalyzer);
  const setIntentAssetAnalyzerChain = useAnalyzerSettingsStore((s) => s.setIntentAssetAnalyzerChain);
  const clearIntentAssetAnalyzer = useAnalyzerSettingsStore((s) => s.clearIntentAssetAnalyzer);
  const visualSimilarityThreshold = useMediaSettingsStore((s) => s.visualSimilarityThreshold);
  const setVisualSimilarityThreshold = useMediaSettingsStore((s) => s.setVisualSimilarityThreshold);
  const [isSavingEmbedding, setIsSavingEmbedding] = useState(false);
  const [embeddingError, setEmbeddingError] = useState<string | null>(null);
  const [embeddingCommandDraft, setEmbeddingCommandDraft] = useState('');
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminUser(user);

  const defaultPromptAnalyzer = promptDefaultChain[0] ?? DEFAULT_PROMPT_ANALYZER_ID;
  const defaultImageAnalyzer = imageDefaultChain[0] ?? DEFAULT_ASSET_ANALYZER_ID;
  const defaultVideoAnalyzer = videoDefaultChain[0] ?? DEFAULT_ASSET_ANALYZER_ID;

  const promptAnalyzers = analyzers.filter((analyzer) => analyzer.target === 'prompt');
  const assetAnalyzers = analyzers.filter((analyzer) => analyzer.target === 'asset');
  const hasAnyIntentOverrides = ASSET_ANALYZER_INTENT_KEYS.some((key) => {
    const chain = intentAnalyzerChains?.[key];
    return Array.isArray(chain) && chain.length > 0;
  });
  const hasAnyAnalysisPointOverrides = Object.values(analysisPointChains).some(
    (chain) => Array.isArray(chain) && chain.length > 0
  );
  const isAtRecommendedDefaults =
    defaultPromptAnalyzer === DEFAULT_PROMPT_ANALYZER_ID &&
    defaultImageAnalyzer === DEFAULT_ASSET_ANALYZER_ID &&
    defaultVideoAnalyzer === DEFAULT_ASSET_ANALYZER_ID &&
    promptDefaultChain.length <= 1 &&
    imageDefaultChain.length <= 1 &&
    videoDefaultChain.length <= 1 &&
    !hasAnyIntentOverrides &&
    !hasAnyAnalysisPointOverrides &&
    Math.abs(visualSimilarityThreshold - DEFAULT_VISUAL_SIMILARITY_THRESHOLD) < 0.001;

  const fetchBackfillRuns = useCallback(async () => {
    try {
      setIsLoadingBackfills(true);
      const response = await listAnalysisBackfills({ limit: 50 });
      setBackfillRuns(response.items ?? []);
      setBackfillError(null);
    } catch (err) {
      setBackfillError(err instanceof Error ? err.message : 'Failed to load backfill runs');
    } finally {
      setIsLoadingBackfills(false);
    }
  }, []);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [analyzersRes, instancesRes, preferences, pointsRes] = await Promise.all([
        listAnalyzers(),
        listAnalyzerInstances({ include_disabled: true }),
        getUserPreferences(),
        listAnalysisPoints().catch(() => ({ analysis_points: [] })),
      ]);
      setAnalyzers([...analyzersRes.analyzers]);
      setInstances([...instancesRes.instances]);
      const points = Array.isArray(pointsRes.analysis_points) && pointsRes.analysis_points.length > 0
        ? pointsRes.analysis_points.map(mapAnalysisPointToRoutingEntry)
        : FALLBACK_ROUTING_ENTRIES;
      setRoutingEntries(points);

      const prefs = (preferences.analyzer as AnalyzerPreferences | undefined) ?? {};
      const promptChain = normalizeAnalyzerChainPreference(
        prefs.prompt_default_ids,
        DEFAULT_PROMPT_ANALYZER_ID
      );
      const imageChain = normalizeAnalyzerChainPreference(
        prefs.asset_default_image_ids,
        DEFAULT_ASSET_ANALYZER_ID
      );
      const videoChain = normalizeAnalyzerChainPreference(
        prefs.asset_default_video_ids,
        DEFAULT_ASSET_ANALYZER_ID
      );

      const rawIntentChains = (prefs.asset_intent_default_ids ?? {}) as Record<string, unknown>;
      const nextIntentChains: Partial<Record<AssetIntentKey, string[]>> = {};
      for (const intentKey of ASSET_ANALYZER_INTENT_KEYS) {
        const fromList = Array.isArray(rawIntentChains[intentKey])
          ? (rawIntentChains[intentKey] as unknown[]).filter((item): item is string => typeof item === 'string')
          : [];
        const chain = normalizeOptionalAnalyzerChainInput(fromList);
        if (chain.length > 0) {
          nextIntentChains[intentKey] = chain;
        }
      }

      const rawPointChains = (prefs.analysis_point_default_ids ?? {}) as Record<string, unknown>;
      const nextAnalysisPointChains: Record<string, string[]> = {};
      const pointIds = new Set<string>(Object.keys(rawPointChains));
      for (const pointId of pointIds) {
        const fromList = Array.isArray(rawPointChains[pointId])
          ? (rawPointChains[pointId] as unknown[]).filter((item): item is string => typeof item === 'string')
          : [];
        const chain = normalizeOptionalAnalyzerChainInput(fromList);
        if (chain.length > 0) {
          nextAnalysisPointChains[pointId] = chain;
        }
      }

      setPromptDefaultChain(promptChain);
      setImageDefaultChain(imageChain);
      setVideoDefaultChain(videoChain);
      setIntentAnalyzerChains(nextIntentChains);
      setAnalysisPointChains(nextAnalysisPointChains);

      setDefaultPromptAnalyzer(promptChain[0]);
      setDefaultImageAnalyzers(imageChain);
      setDefaultImageAnalyzer(imageChain[0]);
      setDefaultVideoAnalyzers(videoChain);
      setDefaultVideoAnalyzer(videoChain[0]);
      for (const intentKey of ASSET_ANALYZER_INTENT_KEYS) {
        const chain = nextIntentChains[intentKey];
        if (Array.isArray(chain) && chain.length > 0) {
          setIntentAssetAnalyzerChain(intentKey, chain);
        } else {
          clearIntentAssetAnalyzer(intentKey);
        }
      }

      void fetchBackfillRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [
    clearIntentAssetAnalyzer,
    setDefaultImageAnalyzer,
    setDefaultImageAnalyzers,
    setDefaultPromptAnalyzer,
    setDefaultVideoAnalyzer,
    setDefaultVideoAnalyzers,
    setIntentAssetAnalyzerChain,
    fetchBackfillRuns,
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const embeddingInstances = useMemo(() => {
    return instances
      .filter((instance) => instance.analyzer_id === EMBEDDING_ANALYZER_ID)
      .slice()
      .sort((a, b) => b.priority - a.priority || b.id - a.id);
  }, [instances]);

  const activeEmbeddingInstance = useMemo(() => {
    return embeddingInstances.find((instance) => instance.on_ingest) ?? embeddingInstances[0] ?? null;
  }, [embeddingInstances]);

  const activeEmbeddingCommand = useMemo(() => {
    if (!activeEmbeddingInstance) return '';
    return extractEmbeddingCommand(activeEmbeddingInstance.config as Record<string, unknown>);
  }, [activeEmbeddingInstance]);

  const embeddingEnabled = Boolean(activeEmbeddingInstance?.enabled && activeEmbeddingInstance?.on_ingest);

  useEffect(() => {
    setEmbeddingCommandDraft(activeEmbeddingCommand);
  }, [activeEmbeddingCommand]);

  const persistEmbeddingControls = useCallback(
    async (updates: { enabled?: boolean; command?: string }) => {
      const requestedEnabled = updates.enabled;
      const requestedCommand = updates.command;
      setEmbeddingError(null);
      setIsSavingEmbedding(true);

      try {
        if (activeEmbeddingInstance) {
          const currentConfig = (activeEmbeddingInstance.config ?? {}) as Record<string, unknown>;
          const nextConfig = requestedCommand === undefined
            ? currentConfig
            : { ...currentConfig, command: requestedCommand.trim() };

          await updateAnalyzerInstance(activeEmbeddingInstance.id, {
            enabled: requestedEnabled ?? activeEmbeddingInstance.enabled,
            on_ingest: requestedEnabled ?? activeEmbeddingInstance.on_ingest,
            config: nextConfig,
          });
        } else {
          const shouldEnable = requestedEnabled ?? false;
          const hasCommand = typeof requestedCommand === 'string' && requestedCommand.trim().length > 0;
          if (!shouldEnable && !hasCommand) {
            return;
          }

          const payload: CreateAnalyzerInstanceRequest = {
            analyzer_id: EMBEDDING_ANALYZER_ID,
            label: DEFAULT_EMBEDDING_LABEL,
            provider_id: DEFAULT_EMBEDDING_PROVIDER_ID,
            model_id: DEFAULT_EMBEDDING_MODEL_ID,
            enabled: shouldEnable,
            on_ingest: shouldEnable,
            priority: 0,
            config: hasCommand ? { command: requestedCommand?.trim() ?? '' } : {},
          };
          await createAnalyzerInstance(payload);
        }

        await fetchData();
      } catch (err) {
        setEmbeddingError(err instanceof Error ? err.message : 'Failed to update embedding controls');
      } finally {
        setIsSavingEmbedding(false);
      }
    },
    [activeEmbeddingInstance, fetchData]
  );

  const handleEmbeddingEnabledChange = useCallback(
    (enabled: boolean) => {
      void persistEmbeddingControls({ enabled });
    },
    [persistEmbeddingControls]
  );

  const handleEmbeddingCommandSave = useCallback(() => {
    if (embeddingCommandDraft === activeEmbeddingCommand) return;
    void persistEmbeddingControls({ command: embeddingCommandDraft });
  }, [activeEmbeddingCommand, embeddingCommandDraft, persistEmbeddingControls]);

  const hasActiveBackfillRuns = useMemo(
    () => backfillRuns.some((run) => isBackfillActive(run.status)),
    [backfillRuns]
  );

  useEffect(() => {
    if (!hasActiveBackfillRuns) return undefined;
    const timer = window.setInterval(() => {
      void fetchBackfillRuns();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [fetchBackfillRuns, hasActiveBackfillRuns]);

  const persistAnalyzerPreferences = useCallback(
    async (updates: Partial<AnalyzerPreferences>) => {
      setDefaultsError(null);
      setIsSavingDefaults(true);
      try {
        const currentPreferences = await getUserPreferences();
        const currentAnalyzerPreferences =
          (currentPreferences.analyzer as AnalyzerPreferences | undefined) ?? {};
        const nextPreferences: AnalyzerPreferences = {
          ...currentAnalyzerPreferences,
          ...updates,
        };
        await updatePreferenceKey('analyzer', nextPreferences);
      } catch (err) {
        setDefaultsError(err instanceof Error ? err.message : 'Failed to save analyzer defaults');
      } finally {
        setIsSavingDefaults(false);
      }
    },
    []
  );

  const handlePromptDefaultChainChange = useCallback(
    (values: string[]) => {
      const chain = normalizeAnalyzerChainInput(values, DEFAULT_PROMPT_ANALYZER_ID);
      setPromptDefaultChain(chain);
      setDefaultPromptAnalyzer(chain[0]);
      void persistAnalyzerPreferences({
        prompt_default_ids: chain,
      });
    },
    [persistAnalyzerPreferences, setDefaultPromptAnalyzer]
  );

  const handleImageDefaultChainChange = useCallback(
    (values: string[]) => {
      const chain = normalizeAnalyzerChainInput(values, DEFAULT_ASSET_ANALYZER_ID);
      setImageDefaultChain(chain);
      setDefaultImageAnalyzers(chain);
      setDefaultImageAnalyzer(chain[0]);
      void persistAnalyzerPreferences({
        asset_default_image_ids: chain,
      });
    },
    [persistAnalyzerPreferences, setDefaultImageAnalyzer, setDefaultImageAnalyzers]
  );

  const handleVideoDefaultChainChange = useCallback(
    (values: string[]) => {
      const chain = normalizeAnalyzerChainInput(values, DEFAULT_ASSET_ANALYZER_ID);
      setVideoDefaultChain(chain);
      setDefaultVideoAnalyzers(chain);
      setDefaultVideoAnalyzer(chain[0]);
      void persistAnalyzerPreferences({
        asset_default_video_ids: chain,
      });
    },
    [persistAnalyzerPreferences, setDefaultVideoAnalyzer, setDefaultVideoAnalyzers]
  );

  const handleIntentAssetAnalyzerChainChange = useCallback(
    (intent: AssetIntentKey, values: string[]) => {
      const chain = normalizeOptionalAnalyzerChainInput(values);
      setIntentAnalyzerChains((prev) => {
        const next: Partial<Record<AssetIntentKey, string[]>> = { ...prev };
        if (chain.length > 0) {
          next[intent] = chain;
          setIntentAssetAnalyzerChain(intent, chain);
        } else {
          delete next[intent];
          clearIntentAssetAnalyzer(intent);
        }

        void persistAnalyzerPreferences({
          asset_intent_default_ids: next,
        });

        return next;
      });
    },
    [clearIntentAssetAnalyzer, persistAnalyzerPreferences, setIntentAssetAnalyzerChain]
  );

  const handleAnalysisPointChainChange = useCallback(
    (pointId: string, values: string[]) => {
      const chain = normalizeOptionalAnalyzerChainInput(values);
      setAnalysisPointChains((prev) => {
        const next = { ...prev };
        if (chain.length > 0) {
          next[pointId] = chain;
        } else {
          delete next[pointId];
        }

        void persistAnalyzerPreferences({
          analysis_point_default_ids: next,
        });

        return next;
      });
    },
    [persistAnalyzerPreferences]
  );

  const handleBackfillFormChange = useCallback((updates: Partial<BackfillFormState>) => {
    setBackfillForm((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleCreateBackfill = useCallback(async () => {
    try {
      setIsCreatingBackfill(true);
      setBackfillError(null);

      const payload: CreateAnalysisBackfillRequest = {
        batch_size: Math.max(1, Math.min(1000, Math.trunc(backfillForm.batch_size || 100))),
        priority: Math.max(0, Math.min(10, Math.trunc(backfillForm.priority || 5))),
      };

      if (backfillForm.media_type) payload.media_type = backfillForm.media_type;
      if (backfillForm.analyzer_id.trim()) payload.analyzer_id = backfillForm.analyzer_id.trim();
      if (backfillForm.analyzer_intent) payload.analyzer_intent = backfillForm.analyzer_intent;
      if (backfillForm.analysis_point.trim()) payload.analysis_point = backfillForm.analysis_point.trim();

      await createAnalysisBackfill(payload);
      setBackfillForm((prev) => ({
        ...prev,
        analysis_point: '',
      }));
      await fetchBackfillRuns();
    } catch (err) {
      setBackfillError(err instanceof Error ? err.message : 'Failed to create backfill run');
    } finally {
      setIsCreatingBackfill(false);
    }
  }, [backfillForm, fetchBackfillRuns]);

  const runBackfillAction = useCallback(
    async (runId: number, action: 'pause' | 'resume' | 'cancel') => {
      try {
        setActiveBackfillActionId(runId);
        setBackfillError(null);

        if (action === 'pause') {
          await pauseAnalysisBackfill(runId);
        } else if (action === 'resume') {
          await resumeAnalysisBackfill(runId);
        } else {
          await cancelAnalysisBackfill(runId);
        }
        await fetchBackfillRuns();
      } catch (err) {
        setBackfillError(err instanceof Error ? err.message : `Failed to ${action} backfill run`);
      } finally {
        setActiveBackfillActionId(null);
      }
    },
    [fetchBackfillRuns]
  );

  const handlePauseBackfillRun = useCallback(
    (runId: number) => {
      void runBackfillAction(runId, 'pause');
    },
    [runBackfillAction]
  );

  const handleResumeBackfillRun = useCallback(
    (runId: number) => {
      void runBackfillAction(runId, 'resume');
    },
    [runBackfillAction]
  );

  const handleCancelBackfillRun = useCallback(
    (runId: number) => {
      if (!confirm(`Cancel backfill run #${runId}?`)) return;
      void runBackfillAction(runId, 'cancel');
    },
    [runBackfillAction]
  );

  // Form handlers
  const handleFormChange = useCallback((updates: Partial<FormState>) => {
    setFormState(prev => ({ ...prev, ...updates }));
  }, []);

  const handleCreate = () => {
    setFormMode('create');
    setFormState(INITIAL_FORM_STATE);
    setEditingId(null);
    setFormError(null);
    setShowForm(true);
  };

  const handleAddInstanceFromCatalog = (analyzerId: string) => {
    setFormMode('create');
    setFormState({ ...INITIAL_FORM_STATE, analyzer_id: analyzerId });
    setEditingId(null);
    setFormError(null);
    setShowAdvanced(true);
    setShowForm(true);
    // Scroll the form into view after it renders
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const handleEdit = (instance: AnalyzerInstance) => {
    setFormMode('edit');
    setFormState({
      label: instance.label,
      analyzer_id: instance.analyzer_id,
      provider_id: instance.provider_id || '',
      model_id: instance.model_id || '',
      description: instance.description || '',
      enabled: instance.enabled,
      priority: instance.priority,
      config: JSON.stringify(instance.config, null, 2),
    });
    setEditingId(instance.id);
    setFormError(null);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setFormState(INITIAL_FORM_STATE);
    setEditingId(null);
    setFormError(null);
  };

  const handleResetDefaults = useCallback(() => {
    const promptChain = [DEFAULT_PROMPT_ANALYZER_ID];
    const imageChain = [DEFAULT_ASSET_ANALYZER_ID];
    const videoChain = [DEFAULT_ASSET_ANALYZER_ID];

    setPromptDefaultChain(promptChain);
    setImageDefaultChain(imageChain);
    setVideoDefaultChain(videoChain);
    setIntentAnalyzerChains({});
    setAnalysisPointChains({});

    setDefaultPromptAnalyzer(promptChain[0]);
    setDefaultImageAnalyzers(imageChain);
    setDefaultImageAnalyzer(imageChain[0]);
    setDefaultVideoAnalyzers(videoChain);
    setDefaultVideoAnalyzer(videoChain[0]);
    for (const intentKey of ASSET_ANALYZER_INTENT_KEYS) {
      clearIntentAssetAnalyzer(intentKey);
    }
    setVisualSimilarityThreshold(DEFAULT_VISUAL_SIMILARITY_THRESHOLD);
    void persistAnalyzerPreferences({
      prompt_default_ids: promptChain,
      asset_default_image_ids: imageChain,
      asset_default_video_ids: videoChain,
      asset_intent_default_ids: {},
      analysis_point_default_ids: {},
    });
  }, [
    persistAnalyzerPreferences,
    setDefaultImageAnalyzer,
    setDefaultImageAnalyzers,
    setDefaultPromptAnalyzer,
    setDefaultVideoAnalyzer,
    setDefaultVideoAnalyzers,
    clearIntentAssetAnalyzer,
    setAnalysisPointChains,
    setVisualSimilarityThreshold,
  ]);

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      setFormError(null);

      let config: Record<string, unknown>;
      try {
        config = JSON.parse(formState.config);
      } catch {
        setFormError('Invalid JSON in config');
        return;
      }

      if (formMode === 'create') {
        const payload: CreateAnalyzerInstanceRequest = {
          label: formState.label,
          analyzer_id: formState.analyzer_id,
          provider_id: formState.provider_id || undefined,
          model_id: formState.model_id || undefined,
          description: formState.description || undefined,
          enabled: formState.enabled,
          priority: formState.priority,
          config,
        };
        await createAnalyzerInstance(payload);
      } else if (editingId !== null) {
        const payload: UpdateAnalyzerInstanceRequest = {
          label: formState.label,
          provider_id: formState.provider_id || undefined,
          model_id: formState.model_id || undefined,
          description: formState.description || undefined,
          enabled: formState.enabled,
          priority: formState.priority,
          config,
        };
        await updateAnalyzerInstance(editingId, payload);
      }

      await fetchData();
      handleCancel();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (instance: AnalyzerInstance) => {
    if (!confirm(`Delete analyzer instance "${instance.label}"?`)) return;

    try {
      setDeletingIds(prev => new Set([...prev, instance.id]));
      await deleteAnalyzerInstance(instance.id);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(instance.id);
        return next;
      });
    }
  };

  const handleToggle = async (instance: AnalyzerInstance) => {
    try {
      await updateAnalyzerInstance(instance.id, { enabled: !instance.enabled });
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle');
    }
  };

  const analysisPointSelections = useMemo<Record<string, AnalysisPointSelection>>(() => {
    const resolveIntentSelection = (intentKey?: string): AnalysisPointSelection => {
      const isKnownIntent = Boolean(
        intentKey && ASSET_ANALYZER_INTENT_KEYS.includes(intentKey as AssetIntentKey)
      );
      if (!intentKey || !isKnownIntent) {
        return {
          analyzerId: defaultImageAnalyzer,
          analyzerIds: imageDefaultChain,
          source: `Image chain fallback (${imageDefaultChain.join(' -> ')})`,
        };
      }
      const overrideChain = intentAnalyzerChains?.[intentKey as AssetIntentKey] ?? [];
      const chain = overrideChain.length > 0 ? overrideChain : imageDefaultChain;
      return {
        analyzerId: chain[0] ?? defaultImageAnalyzer,
        analyzerIds: chain,
        source:
          overrideChain.length > 0
            ? `Intent override chain (${overrideChain.join(' -> ')})`
            : `Image chain fallback (${imageDefaultChain.join(' -> ')})`,
      };
    };

    const selections: Record<string, AnalysisPointSelection> = {};
    for (const entry of routingEntries) {
      if (entry.control === 'similarity_threshold') continue;

      const pointOverride = analysisPointChains[entry.id] ?? [];
      if (pointOverride.length > 0) {
        selections[entry.id] = {
          analyzerId: pointOverride[0],
          analyzerIds: pointOverride,
          source: `Point override chain (${pointOverride.join(' -> ')})`,
        };
        continue;
      }

      if (entry.control === 'prompt_default') {
        selections[entry.id] = {
          analyzerId: defaultPromptAnalyzer,
          analyzerIds: promptDefaultChain,
          source: `Prompt chain (${promptDefaultChain.join(' -> ')})`,
        };
        continue;
      }

      if (entry.control === 'video_default') {
        selections[entry.id] = {
          analyzerId: defaultVideoAnalyzer,
          analyzerIds: videoDefaultChain,
          source: `Video chain (${videoDefaultChain.join(' -> ')})`,
        };
        continue;
      }

      if (entry.control === 'image_default') {
        selections[entry.id] = {
          analyzerId: defaultImageAnalyzer,
          analyzerIds: imageDefaultChain,
          source: `Image chain (${imageDefaultChain.join(' -> ')})`,
        };
        continue;
      }

      selections[entry.id] = resolveIntentSelection(entry.intentKey);
    }

    return selections;
  }, [
    analysisPointChains,
    defaultImageAnalyzer,
    defaultPromptAnalyzer,
    defaultVideoAnalyzer,
    imageDefaultChain,
    intentAnalyzerChains,
    promptDefaultChain,
    routingEntries,
    videoDefaultChain,
  ]);

  const catalogAnalysisPoints = useMemo<CatalogAnalysisPointDefinition[]>(() => {
    return routingEntries
      .filter((entry): entry is RoutingEntry & { target: 'prompt' | 'asset' } => entry.target === 'prompt' || entry.target === 'asset')
      .map((entry) => ({
        id: entry.id,
        label: entry.label,
        description: entry.description,
        target: entry.target,
      }));
  }, [routingEntries]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto p-4 text-xs text-neutral-500 dark:text-neutral-400">
        Loading analyzers...
      </div>
    );
  }

  // Error state
  if (error && instances.length === 0) {
    return (
      <div className="flex-1 overflow-auto p-4">
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-[11px] text-red-700 dark:text-red-300">
          <strong>Error:</strong> {error}
        </div>
        <button
          onClick={fetchData}
          className="mt-3 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4 text-xs text-neutral-800 dark:text-neutral-100">
      {/* Header */}
      <div>
        <div>
          <h2 className="text-sm font-semibold">Analysis Settings</h2>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
            Choose defaults for analysis workflows. Advanced per-provider/model overrides are optional.
          </p>
        </div>
      </div>

      {/* Credential bridge info */}
      <div className="p-2.5 bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-800/50 rounded text-[10px] text-blue-700 dark:text-blue-300">
        <strong>Note:</strong> LLM analyzers (Claude, OpenAI) automatically use API keys
        from your <strong>Provider Settings</strong>. You only need analyzer instances here
        for custom overrides (different model, base URL, or provider-specific config).
      </div>

      <AnalysisRoutingCatalog
        routingEntries={routingEntries}
        promptAnalyzers={promptAnalyzers}
        assetAnalyzers={assetAnalyzers}
        promptDefaultChain={promptDefaultChain}
        imageDefaultChain={imageDefaultChain}
        videoDefaultChain={videoDefaultChain}
        intentAnalyzerChains={intentAnalyzerChains}
        analysisPointChains={analysisPointChains}
        visualSimilarityThreshold={visualSimilarityThreshold}
        isSavingDefaults={isSavingDefaults}
        defaultsError={defaultsError}
        isAtRecommendedDefaults={isAtRecommendedDefaults}
        pointSelections={analysisPointSelections}
        onPromptChainChange={handlePromptDefaultChainChange}
        onImageChainChange={handleImageDefaultChainChange}
        onVideoChainChange={handleVideoDefaultChainChange}
        onIntentChainChange={handleIntentAssetAnalyzerChainChange}
        onAnalysisPointChainChange={handleAnalysisPointChainChange}
        onSimilarityChange={setVisualSimilarityThreshold}
        onReset={handleResetDefaults}
      />

      <AnalyzerBackfillPanel
        assetAnalyzers={assetAnalyzers}
        runs={backfillRuns}
        isLoading={isLoadingBackfills}
        error={backfillError}
        formState={backfillForm}
        isCreating={isCreatingBackfill}
        activeRunActionId={activeBackfillActionId}
        onFormChange={handleBackfillFormChange}
        onCreate={() => void handleCreateBackfill()}
        onRefresh={() => void fetchBackfillRuns()}
        onPause={handlePauseBackfillRun}
        onResume={handleResumeBackfillRun}
        onCancel={handleCancelBackfillRun}
      />

      {/* Visual Embeddings */}
      {isAdmin && (
        <section className="space-y-2 pt-4 border-t border-neutral-200 dark:border-neutral-700">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Visual Embeddings
          </h3>
          <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
            CLIP embeddings enable "Similar content" search. This control now maps to your
            <span className="font-mono"> asset:embedding </span>
            analyzer instance with
            <span className="font-mono"> on_ingest=true</span>.
          </p>
          {embeddingError && (
            <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-[10px] text-red-700 dark:text-red-300">
              {embeddingError}
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2 p-3 border border-neutral-200 dark:border-neutral-700 rounded bg-neutral-50/60 dark:bg-neutral-900/40">
            <div className="space-y-1">
              <label className="block text-[10px] font-semibold text-neutral-700 dark:text-neutral-300">
                Generate Embeddings
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={embeddingEnabled}
                  onChange={(e) => handleEmbeddingEnabledChange(e.target.checked)}
                  disabled={isSavingEmbedding}
                  className="sr-only peer"
                />
                <div
                  className={`w-9 h-5 rounded-full peer peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all relative ${
                    embeddingEnabled ? 'bg-blue-500' : 'bg-neutral-300 dark:bg-neutral-700'
                  }`}
                />
                <span className="text-[11px] text-neutral-700 dark:text-neutral-300">
                  {embeddingEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </label>
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                Generate CLIP embeddings during asset ingestion for "Similar content" searches.
              </p>
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                Active instance: {activeEmbeddingInstance ? (
                  <>
                    <span className="font-mono">{activeEmbeddingInstance.label}</span>
                    {' '}
                    (<span className="font-mono">#{activeEmbeddingInstance.id}</span>)
                  </>
                ) : 'none (will be created when enabled)'}
              </p>
              {embeddingInstances.length > 1 && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                  {embeddingInstances.length} embedding instances detected. This toggle controls the active one.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-semibold text-neutral-700 dark:text-neutral-300">
                CLIP Embedding Command
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={embeddingCommandDraft}
                  onChange={(e) => setEmbeddingCommandDraft(e.target.value)}
                  onBlur={handleEmbeddingCommandSave}
                  placeholder="python tools/clip_embed.py"
                  className="flex-1 px-2 py-1.5 text-[11px] font-mono border rounded bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600"
                />
                <button
                  type="button"
                  onClick={handleEmbeddingCommandSave}
                  disabled={isSavingEmbedding || embeddingCommandDraft === activeEmbeddingCommand}
                  className="px-2 py-1.5 text-[10px] rounded bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 disabled:opacity-50 text-neutral-700 dark:text-neutral-300 transition-colors"
                >
                  Save
                </button>
              </div>
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                Command that accepts JSON on stdin and returns embeddings on stdout.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Advanced overrides */}
      <section className="space-y-3 pt-4 border-t border-neutral-200 dark:border-neutral-700">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Advanced Overrides (Provider/Model)
            </h3>
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
              Optional per-provider/per-model analyzer instances. Most users can leave this collapsed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {showAdvanced && (
              <button
                onClick={handleCreate}
                disabled={showForm}
                className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white rounded text-xs transition-colors"
              >
                + New Instance
              </button>
            )}
            <button
              onClick={() => {
                if (showAdvanced) {
                  handleCancel();
                }
                setShowAdvanced((prev) => !prev);
              }}
              className="px-3 py-1.5 text-[11px] rounded bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-300 transition-colors"
            >
              {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
            </button>
          </div>
        </div>

        {showAdvanced && (
          <>
            {error && instances.length > 0 && (
              <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-[11px] text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            {showForm && (
              <div ref={formRef}>
                <InstanceForm
                  mode={formMode}
                  formState={formState}
                  analyzers={analyzers}
                  isSubmitting={isSubmitting}
                  error={formError}
                  onChange={handleFormChange}
                  onSubmit={handleSubmit}
                  onCancel={handleCancel}
                />
              </div>
            )}

            {instances.length === 0 ? (
              <div className="p-4 bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-700 rounded text-center">
                <p className="text-neutral-600 dark:text-neutral-400 text-[11px]">
                  No analyzer instances configured.
                </p>
                <p className="text-neutral-500 dark:text-neutral-500 text-[10px] mt-1">
                  LLM analyzers use your Provider Settings credentials by default.
                  Create an instance only if you need custom overrides.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {instances
                  .sort((a, b) => b.priority - a.priority)
                  .map(instance => (
                    <InstanceCard
                      key={instance.id}
                      instance={instance}
                      analyzers={analyzers}
                      onEdit={() => handleEdit(instance)}
                      onDelete={() => handleDelete(instance)}
                      onToggle={() => handleToggle(instance)}
                      isDeleting={deletingIds.has(instance.id)}
                    />
                  ))}
              </div>
            )}

            <section className="space-y-2 pt-2">
              <h4 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                About Advanced Overrides
              </h4>
              <div className="text-[10px] text-neutral-600 dark:text-neutral-400 space-y-2">
                <p>
                  Analyzer instances let you configure custom providers, models, and API keys for analyzers.
                  This is useful for using your own API credentials or switching between models.
                </p>
                <p>
                  Instances are checked in priority order (highest first). The first enabled instance
                  that matches the analyzer type will be used.
                </p>
              </div>
            </section>
          </>
        )}
      </section>

      {/* Analyzer Catalog — master-detail view */}
      <section className="space-y-2 pt-4 border-t border-neutral-200 dark:border-neutral-700">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Analyzer Catalog
        </h3>
        <AnalyzerCatalog
          analyzers={analyzers}
          instances={instances}
          deletingIds={deletingIds}
          analysisPoints={catalogAnalysisPoints}
          analysisPointSelections={analysisPointSelections}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onToggle={handleToggle}
          onAddInstance={handleAddInstanceFromCatalog}
        />
      </section>

    </div>
  );
}

// Register this module
settingsRegistry.register({
  id: 'analysis',
  label: 'Analysis',
  icon: '🔬',
  component: AnalyzersSettings,
  order: 75,
  subSections: [
    {
      id: 'instances',
      label: 'Defaults & Overrides',
      component: AnalyzersSettings,
    },
  ],
});
