/**
 * Analyzers Settings Module
 *
 * Manage analyzer instances - configure LLM/vision analyzers with custom providers and models.
 * Analyzer instances are user-specific configurations that override default analyzer behavior.
 */
import { useState, useEffect, useCallback } from 'react';

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

import { settingsRegistry } from '../../lib/core/registry';

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

  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [formState, setFormState] = useState<FormState>(INITIAL_FORM_STATE);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [analyzersRes, instancesRes] = await Promise.all([
        listAnalyzers(),
        listAnalyzerInstances({ include_disabled: true }),
      ]);
      setAnalyzers([...analyzersRes.analyzers]);
      setInstances([...instancesRes.instances]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Analyzer Instances</h2>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
            Configure custom analyzer instances with your own providers and API keys.
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={showForm}
          className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white rounded text-xs transition-colors"
        >
          + New Instance
        </button>
      </div>

      {/* Error banner */}
      {error && instances.length > 0 && (
        <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-[11px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Create/Edit Form */}
      {showForm && (
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
      )}

      {/* Instances List */}
      {instances.length === 0 ? (
        <div className="p-4 bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-700 rounded text-center">
          <p className="text-neutral-600 dark:text-neutral-400 text-[11px]">
            No analyzer instances configured yet.
          </p>
          <p className="text-neutral-500 dark:text-neutral-500 text-[10px] mt-1">
            Create an instance to use custom providers or API keys for analyzers.
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

      {/* Info Section */}
      <section className="space-y-2 pt-4 border-t border-neutral-200 dark:border-neutral-700">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Available Analyzers
        </h3>
        <div className="grid gap-2">
          {analyzers.map(analyzer => (
            <div
              key={analyzer.id}
              className="p-2 bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-700 rounded text-[10px]"
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-neutral-800 dark:text-neutral-100">
                  {analyzer.name}
                </span>
                <span className={`px-1.5 py-0.5 rounded ${
                  analyzer.kind === 'llm'
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                    : analyzer.kind === 'vision'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                }`}>
                  {analyzer.kind}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400">
                  {analyzer.target}
                </span>
                {analyzer.is_default && (
                  <span className="px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
                    default
                  </span>
                )}
              </div>
              <div className="text-neutral-500 dark:text-neutral-400 mt-1">
                <span className="font-mono">{analyzer.id}</span>
                {analyzer.description && <> — {analyzer.description}</>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Help Section */}
      <section className="space-y-2 pt-4 border-t border-neutral-200 dark:border-neutral-700">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          About Analyzer Instances
        </h3>
        <div className="text-[10px] text-neutral-600 dark:text-neutral-400 space-y-2">
          <p>
            Analyzer instances let you configure custom providers, models, and API keys for analyzers.
            This is useful for using your own API credentials or switching between different models.
          </p>
          <p>
            Instances are checked in priority order (highest first). The first enabled instance
            that matches the analyzer type will be used.
          </p>
        </div>
      </section>
    </div>
  );
}

// Register this module
settingsRegistry.register({
  id: 'analyzers',
  label: 'Analyzers',
  icon: '🔬',
  component: AnalyzersSettings,
  order: 75,
});
