/**
 * Analysis Settings Module
 *
 * Manage default analyzer selection and advanced analyzer overrides.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

import {
  ASSET_ANALYZER_INTENT_KEYS,
  DEFAULT_ASSET_ANALYZER_ID,
  DEFAULT_PROMPT_ANALYZER_ID,
  useAnalyzerSettingsStore,
} from '@lib/analyzers';
import {
  listAnalyzers,
  listAnalyzerInstances,
  createAnalyzerInstance,
  updateAnalyzerInstance,
  deleteAnalyzerInstance,
  type AnalyzerInfo,
  type AnalyzerInstance,
  type CreateAnalyzerInstanceRequest,
  type UpdateAnalyzerInstanceRequest,
} from '@lib/api/analyzers';
import {
  getUserPreferences,
  updatePreferenceKey,
  type AnalyzerPreferences,
} from '@lib/api/userPreferences';
import { isAdminUser } from '@lib/auth/userRoles';

import { useMediaSettingsStore, type ServerMediaSettings } from '@features/assets';
import { usePromptSettingsStore } from '@features/prompts/stores/promptSettingsStore';

import { pixsimClient } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

import { settingsRegistry } from '../../lib/core/registry';

import { AnalyzerCatalog } from './AnalyzerCatalog';

type FormMode = 'create' | 'edit';

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
const DEFAULT_VISUAL_SIMILARITY_THRESHOLD = 0.3;

function normalizeAnalyzerSetting(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
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

export function AnalyzersSettings() {
  const [analyzers, setAnalyzers] = useState<AnalyzerInfo[]>([]);
  const [instances, setInstances] = useState<AnalyzerInstance[]>([]);
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
  const formRef = useRef<HTMLDivElement>(null);

  const defaultPromptAnalyzer = usePromptSettingsStore((s) => s.defaultAnalyzer);
  const setDefaultPromptAnalyzer = usePromptSettingsStore((s) => s.setDefaultAnalyzer);
  const defaultImageAnalyzer = useAnalyzerSettingsStore((s) => s.defaultImageAnalyzer);
  const setDefaultImageAnalyzer = useAnalyzerSettingsStore((s) => s.setDefaultImageAnalyzer);
  const defaultVideoAnalyzer = useAnalyzerSettingsStore((s) => s.defaultVideoAnalyzer);
  const setDefaultVideoAnalyzer = useAnalyzerSettingsStore((s) => s.setDefaultVideoAnalyzer);
  const intentAssetAnalyzers = useAnalyzerSettingsStore((s) => s.intentAssetAnalyzers);
  const setIntentAssetAnalyzer = useAnalyzerSettingsStore((s) => s.setIntentAssetAnalyzer);
  const clearIntentAssetAnalyzer = useAnalyzerSettingsStore((s) => s.clearIntentAssetAnalyzer);
  const visualSimilarityThreshold = useMediaSettingsStore((s) => s.visualSimilarityThreshold);
  const setVisualSimilarityThreshold = useMediaSettingsStore((s) => s.setVisualSimilarityThreshold);
  const serverSettings = useMediaSettingsStore((s) => s.serverSettings);
  const setServerSettings = useMediaSettingsStore((s) => s.setServerSettings);
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminUser(user);

  const promptAnalyzers = analyzers.filter((analyzer) => analyzer.target === 'prompt');
  const assetAnalyzers = analyzers.filter((analyzer) => analyzer.target === 'asset');
  const hasPromptDefaultOption = promptAnalyzers.some((analyzer) => analyzer.id === defaultPromptAnalyzer);
  const hasImageDefaultOption = assetAnalyzers.some((analyzer) => analyzer.id === defaultImageAnalyzer);
  const hasVideoDefaultOption = assetAnalyzers.some((analyzer) => analyzer.id === defaultVideoAnalyzer);
  const hasAnyIntentOverrides = ASSET_ANALYZER_INTENT_KEYS.some((key) => {
    const value = intentAssetAnalyzers?.[key];
    return typeof value === 'string' && value.trim().length > 0;
  });
  const isAtRecommendedDefaults =
    defaultPromptAnalyzer === DEFAULT_PROMPT_ANALYZER_ID &&
    defaultImageAnalyzer === DEFAULT_ASSET_ANALYZER_ID &&
    defaultVideoAnalyzer === DEFAULT_ASSET_ANALYZER_ID &&
    !hasAnyIntentOverrides &&
    Math.abs(visualSimilarityThreshold - DEFAULT_VISUAL_SIMILARITY_THRESHOLD) < 0.001;

  const intentOverrideRows: Array<{
    key: (typeof ASSET_ANALYZER_INTENT_KEYS)[number];
    label: string;
    description: string;
  }> = [
    {
      key: 'character_ingest_face',
      label: 'Character Ingest: Face',
      description: 'Used by Character Reference Ingest when Analyzer Mode = Face.',
    },
    {
      key: 'character_ingest_sheet',
      label: 'Character Ingest: Sheet / Composite',
      description: 'Used by Character Reference Ingest when Analyzer Mode = Sheet / Composite.',
    },
    {
      key: 'scene_prep_location',
      label: 'Scene Prep: Location',
      description: 'Reserved for Scene Prep location-reference analysis/import flows.',
    },
    {
      key: 'scene_prep_style',
      label: 'Scene Prep: Style',
      description: 'Reserved for Scene Prep style-reference analysis/import flows.',
    },
  ];

  // Fetch server media settings (for embedding controls)
  useEffect(() => {
    if (!serverSettings) {
      pixsimClient.get<ServerMediaSettings>('/media/settings')
        .then(setServerSettings)
        .catch((err) => console.error('Failed to fetch media settings:', err));
    }
  }, [serverSettings, setServerSettings]);

  const updateMediaSetting = useCallback(
    async (key: keyof ServerMediaSettings, value: ServerMediaSettings[keyof ServerMediaSettings]) => {
      if (!serverSettings) return;
      const prev = serverSettings;
      setServerSettings({ ...serverSettings, [key]: value });
      try {
        const updated = await pixsimClient.patch<ServerMediaSettings>('/media/settings', { [key]: value });
        setServerSettings(updated);
      } catch (err) {
        console.error('Failed to update media setting:', err);
        setServerSettings(prev);
      }
    },
    [serverSettings, setServerSettings]
  );

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [analyzersRes, instancesRes, preferences] = await Promise.all([
        listAnalyzers(),
        listAnalyzerInstances({ include_disabled: true }),
        getUserPreferences(),
      ]);
      setAnalyzers([...analyzersRes.analyzers]);
      setInstances([...instancesRes.instances]);

      const prefs = (preferences.analyzer as AnalyzerPreferences | undefined) ?? {};

      setDefaultPromptAnalyzer(
        normalizeAnalyzerSetting(prefs.prompt_default_id, DEFAULT_PROMPT_ANALYZER_ID)
      );
      setDefaultImageAnalyzer(
        normalizeAnalyzerSetting(prefs.asset_default_image_id, DEFAULT_ASSET_ANALYZER_ID)
      );
      setDefaultVideoAnalyzer(
        normalizeAnalyzerSetting(prefs.asset_default_video_id, DEFAULT_ASSET_ANALYZER_ID)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [setDefaultImageAnalyzer, setDefaultPromptAnalyzer, setDefaultVideoAnalyzer]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  const handlePromptDefaultChange = useCallback(
    (value: string) => {
      const nextValue = normalizeAnalyzerSetting(value, DEFAULT_PROMPT_ANALYZER_ID);
      setDefaultPromptAnalyzer(nextValue);
      void persistAnalyzerPreferences({ prompt_default_id: nextValue });
    },
    [persistAnalyzerPreferences, setDefaultPromptAnalyzer]
  );

  const handleImageDefaultChange = useCallback(
    (value: string) => {
      const nextValue = normalizeAnalyzerSetting(value, DEFAULT_ASSET_ANALYZER_ID);
      setDefaultImageAnalyzer(nextValue);
      void persistAnalyzerPreferences({ asset_default_image_id: nextValue });
    },
    [persistAnalyzerPreferences, setDefaultImageAnalyzer]
  );

  const handleVideoDefaultChange = useCallback(
    (value: string) => {
      const nextValue = normalizeAnalyzerSetting(value, DEFAULT_ASSET_ANALYZER_ID);
      setDefaultVideoAnalyzer(nextValue);
      void persistAnalyzerPreferences({ asset_default_video_id: nextValue });
    },
    [persistAnalyzerPreferences, setDefaultVideoAnalyzer]
  );

  const handleIntentAssetAnalyzerChange = useCallback(
    (intent: (typeof ASSET_ANALYZER_INTENT_KEYS)[number], value: string) => {
      const normalized = value.trim();
      if (!normalized) {
        clearIntentAssetAnalyzer(intent);
        return;
      }
      setIntentAssetAnalyzer(intent, normalized);
    },
    [clearIntentAssetAnalyzer, setIntentAssetAnalyzer]
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
    setDefaultPromptAnalyzer(DEFAULT_PROMPT_ANALYZER_ID);
    setDefaultImageAnalyzer(DEFAULT_ASSET_ANALYZER_ID);
    setDefaultVideoAnalyzer(DEFAULT_ASSET_ANALYZER_ID);
    for (const intentKey of ASSET_ANALYZER_INTENT_KEYS) {
      clearIntentAssetAnalyzer(intentKey);
    }
    setVisualSimilarityThreshold(DEFAULT_VISUAL_SIMILARITY_THRESHOLD);
    void persistAnalyzerPreferences({
      prompt_default_id: DEFAULT_PROMPT_ANALYZER_ID,
      asset_default_image_id: DEFAULT_ASSET_ANALYZER_ID,
      asset_default_video_id: DEFAULT_ASSET_ANALYZER_ID,
    });
  }, [
    persistAnalyzerPreferences,
    setDefaultImageAnalyzer,
    setDefaultPromptAnalyzer,
    setDefaultVideoAnalyzer,
    clearIntentAssetAnalyzer,
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

      {/* Status */}
      <section className="space-y-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Status
        </h3>
        <div className="grid gap-3 md:grid-cols-5 p-3 border border-neutral-200 dark:border-neutral-700 rounded bg-neutral-50/60 dark:bg-neutral-900/40">
          <div className="space-y-1">
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400">Prompt Default</div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px]">{defaultPromptAnalyzer}</span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] ${
                hasPromptDefaultOption
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                  : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
              }`}>
                {hasPromptDefaultOption ? 'valid' : 'missing'}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400">Image Default</div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px]">{defaultImageAnalyzer}</span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] ${
                hasImageDefaultOption
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                  : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
              }`}>
                {hasImageDefaultOption ? 'valid' : 'missing'}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400">Video Default</div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px]">{defaultVideoAnalyzer}</span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] ${
                hasVideoDefaultOption
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                  : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
              }`}>
                {hasVideoDefaultOption ? 'valid' : 'missing'}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400">Registered Analyzers</div>
            <div className="text-[11px] text-neutral-700 dark:text-neutral-300">
              {promptAnalyzers.length} prompt / {assetAnalyzers.length} asset
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400">Similarity Default</div>
            <div className="font-mono text-[11px] text-neutral-700 dark:text-neutral-300">
              {visualSimilarityThreshold.toFixed(2)}
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <button
            onClick={handleResetDefaults}
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

      {/* Runtime defaults */}
      <section className="space-y-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Default Analyzer Selection
        </h3>
        <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
          These defaults are saved in your account preferences and used by backend analysis flows when analyzer IDs are omitted.
        </p>
        <div className="grid gap-3 md:grid-cols-4 p-3 border border-neutral-200 dark:border-neutral-700 rounded bg-neutral-50/60 dark:bg-neutral-900/40">
          <div className="space-y-1">
            <label className="block text-[10px] font-semibold text-neutral-700 dark:text-neutral-300">
              Prompt Analyzer
            </label>
            <select
              value={defaultPromptAnalyzer}
              onChange={(e) => handlePromptDefaultChange(e.target.value)}
              disabled={isSavingDefaults}
              className="w-full px-2 py-1.5 text-[11px] border rounded bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600"
            >
              {!hasPromptDefaultOption && (
                <option value={defaultPromptAnalyzer}>Unavailable: {defaultPromptAnalyzer}</option>
              )}
              {promptAnalyzers.length === 0 && hasPromptDefaultOption && (
                <option value={defaultPromptAnalyzer}>{defaultPromptAnalyzer}</option>
              )}
              {promptAnalyzers.map((analyzer) => (
                <option key={analyzer.id} value={analyzer.id}>
                  {analyzer.name}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
              <span className="font-semibold">Used by:</span> Prompt parsing and tag extraction in generation workflows.
            </p>
            {!hasPromptDefaultOption && (
              <p className="text-[10px] text-amber-700 dark:text-amber-400">
                Selected analyzer is not currently registered.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-semibold text-neutral-700 dark:text-neutral-300">
              Image Analyzer
            </label>
            <select
              value={defaultImageAnalyzer}
              onChange={(e) => handleImageDefaultChange(e.target.value)}
              disabled={isSavingDefaults}
              className="w-full px-2 py-1.5 text-[11px] border rounded bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600"
            >
              {!hasImageDefaultOption && (
                <option value={defaultImageAnalyzer}>Unavailable: {defaultImageAnalyzer}</option>
              )}
              {assetAnalyzers.length === 0 && hasImageDefaultOption && (
                <option value={defaultImageAnalyzer}>{defaultImageAnalyzer}</option>
              )}
              {assetAnalyzers.map((analyzer) => (
                <option key={analyzer.id} value={analyzer.id}>
                  {analyzer.name}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
              <span className="font-semibold">Used by:</span> Image-focused asset-analysis tools (zone detection and similar flows).
            </p>
            {!hasImageDefaultOption && (
              <p className="text-[10px] text-amber-700 dark:text-amber-400">
                Selected analyzer is not currently registered.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-semibold text-neutral-700 dark:text-neutral-300">
              Video Analyzer
            </label>
            <select
              value={defaultVideoAnalyzer}
              onChange={(e) => handleVideoDefaultChange(e.target.value)}
              disabled={isSavingDefaults}
              className="w-full px-2 py-1.5 text-[11px] border rounded bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600"
            >
              {!hasVideoDefaultOption && (
                <option value={defaultVideoAnalyzer}>Unavailable: {defaultVideoAnalyzer}</option>
              )}
              {assetAnalyzers.length === 0 && hasVideoDefaultOption && (
                <option value={defaultVideoAnalyzer}>{defaultVideoAnalyzer}</option>
              )}
              {assetAnalyzers.map((analyzer) => (
                <option key={analyzer.id} value={analyzer.id}>
                  {analyzer.name}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
              <span className="font-semibold">Used by:</span> Video-focused asset-analysis workflows and future video tooling.
            </p>
            {!hasVideoDefaultOption && (
              <p className="text-[10px] text-amber-700 dark:text-amber-400">
                Selected analyzer is not currently registered.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-semibold text-neutral-700 dark:text-neutral-300">
              Default Similarity Threshold
            </label>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={visualSimilarityThreshold}
              onChange={(e) => setVisualSimilarityThreshold(parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="text-[11px] font-mono text-neutral-700 dark:text-neutral-300">
              {visualSimilarityThreshold.toFixed(2)}
            </div>
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
              <span className="font-semibold">Used by:</span> Similar Content search defaults (higher = stricter).
            </p>
          </div>
        </div>

        <div className="p-3 border border-neutral-200 dark:border-neutral-700 rounded bg-neutral-50/60 dark:bg-neutral-900/40 space-y-2">
          <div>
            <h4 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
              Intent Overrides (Local)
            </h4>
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
              Optional local overrides for specific workflows (e.g. Character Ingest Face/Sheet). These are stored in browser settings for now and fall back to the image default when empty.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {intentOverrideRows.map((row) => {
              const currentValue = (intentAssetAnalyzers?.[row.key] ?? '').trim();
              const hasCurrentOption = !currentValue || assetAnalyzers.some((analyzer) => analyzer.id === currentValue);
              return (
                <div key={row.key} className="space-y-1">
                  <label className="block text-[10px] font-semibold text-neutral-700 dark:text-neutral-300">
                    {row.label}
                  </label>
                  <select
                    value={currentValue}
                    onChange={(e) => handleIntentAssetAnalyzerChange(row.key, e.target.value)}
                    className="w-full px-2 py-1.5 text-[11px] border rounded bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600"
                  >
                    <option value="">Use Image Default ({defaultImageAnalyzer})</option>
                    {!hasCurrentOption && currentValue && (
                      <option value={currentValue}>Unavailable: {currentValue}</option>
                    )}
                    {assetAnalyzers.map((analyzer) => (
                      <option key={analyzer.id} value={analyzer.id}>
                        {analyzer.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    {row.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Visual Embeddings */}
      {isAdmin && (
        <section className="space-y-2 pt-4 border-t border-neutral-200 dark:border-neutral-700">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Visual Embeddings
          </h3>
          <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
            CLIP embeddings enable "Similar content" search. Embeddings are generated during ingestion for both images and videos (using their thumbnail frame).
          </p>
          <div className="grid gap-3 md:grid-cols-2 p-3 border border-neutral-200 dark:border-neutral-700 rounded bg-neutral-50/60 dark:bg-neutral-900/40">
            <div className="space-y-1">
              <label className="block text-[10px] font-semibold text-neutral-700 dark:text-neutral-300">
                Generate Embeddings
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={serverSettings?.generate_embeddings ?? false}
                  onChange={(e) => updateMediaSetting('generate_embeddings', e.target.checked)}
                  disabled={!serverSettings}
                  className="sr-only peer"
                />
                <div
                  className={`w-9 h-5 rounded-full peer peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all relative ${
                    serverSettings?.generate_embeddings ? 'bg-blue-500' : 'bg-neutral-300 dark:bg-neutral-700'
                  }`}
                />
                <span className="text-[11px] text-neutral-700 dark:text-neutral-300">
                  {serverSettings?.generate_embeddings ? 'Enabled' : 'Disabled'}
                </span>
              </label>
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                Generate CLIP embeddings during asset ingestion for "Similar content" searches.
              </p>
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-semibold text-neutral-700 dark:text-neutral-300">
                CLIP Embedding Command
              </label>
              <input
                type="text"
                value={serverSettings?.clip_embedding_command ?? ''}
                onChange={(e) => updateMediaSetting('clip_embedding_command', e.target.value)}
                disabled={!serverSettings?.generate_embeddings}
                placeholder="python tools/clip_embed.py"
                className="w-full px-2 py-1.5 text-[11px] font-mono border rounded bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600 disabled:opacity-50"
              />
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
