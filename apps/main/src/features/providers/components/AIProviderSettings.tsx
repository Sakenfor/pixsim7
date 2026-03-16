/**
 * AI Provider Settings — API keys, per-capability defaults, command instances.
 *
 * Three sections via sidebar nav:
 *   1. API Keys — OpenAI + Anthropic credentials
 *   2. Defaults — per-capability model + method selection
 *   3. Instances — cmd-llm command configurations
 */

import {
  Badge,
  Button,
  SectionHeader,
  SidebarContentLayout,
  type SidebarContentLayoutSection,
  useSidebarNav,
  useTheme,
} from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { pixsimClient } from '@lib/api/client';
import { Icon } from '@lib/icons';

// =============================================================================
// Types
// =============================================================================

export interface AIProviderSettingsData {
  openai_api_key?: string;
  anthropic_api_key?: string;
  llm_provider: string;
  llm_default_model?: string;
}

interface LlmProviderInfo {
  provider_id: string;
  name: string;
  description?: string;
  requires_credentials?: boolean;
}

interface LlmInstance {
  id: number;
  provider_id: string;
  label: string;
  description?: string;
  config: Record<string, unknown>;
  enabled: boolean;
  priority: number;
}

interface AiModelEntry {
  id: string;
  label: string;
  provider_id: string;
  capabilities: string[];
  supported_methods: string[];
  description?: string;
}

interface CapabilityDefault {
  model_id: string;
  method: string | null;
}

// Capability display metadata
const CAPABILITIES = [
  { id: 'assistant_chat', label: 'Assistant Chat', icon: 'messageSquare', desc: 'AI chat in the assistant panel' },
  { id: 'prompt_edit', label: 'Prompt Editing', icon: 'edit', desc: 'Refining generation prompts' },
  { id: 'tag_suggest', label: 'Tag Suggestion', icon: 'tag', desc: 'Auto-generating tags for content' },
] as const;

const METHOD_LABELS: Record<string, string> = {
  api: 'Direct API',
  remote: 'Bridge (MCP tools)',
  cmd: 'Command (CLI)',
  local: 'Local (llama-cpp)',
};

// =============================================================================
// Shared state hook
// =============================================================================

function useAISettings(autoLoad: boolean) {
  const [settings, setSettings] = useState<AIProviderSettingsData | null>(null);
  const [providers, setProviders] = useState<LlmProviderInfo[]>([]);
  const [instances, setInstances] = useState<LlmInstance[]>([]);
  const [models, setModels] = useState<AiModelEntry[]>([]);
  const [defaults, setDefaults] = useState<Record<string, CapabilityDefault>>({});
  const [loading, setLoading] = useState(autoLoad);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsData, providersData, instancesData, modelsData, defaultsData] = await Promise.all([
        pixsimClient.get<AIProviderSettingsData>('/providers/ai-providers/settings'),
        pixsimClient.get<{ providers: LlmProviderInfo[] }>('/ai/providers'),
        pixsimClient.get<{ instances: LlmInstance[] }>('/providers/llm-instances'),
        pixsimClient.get<{ models: AiModelEntry[] }>('/ai/models').catch(() => ({ models: [] })),
        pixsimClient.get<Record<string, CapabilityDefault>>('/ai/defaults').catch(() => ({})),
      ]);
      setSettings(settingsData);
      setProviders(providersData.providers || []);
      setInstances(instancesData.instances || []);
      setModels(modelsData.models || []);
      setDefaults(defaultsData || {});
    } catch (error) {
      console.error('Failed to load AI provider settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoLoad) void load();
  }, [autoLoad, load]);

  const saveSettings = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await pixsimClient.patch('/providers/ai-providers/settings', settings);
    } catch (error) {
      console.error('Failed to save AI provider settings:', error);
    } finally {
      setSaving(false);
    }
  }, [settings]);

  return { settings, setSettings, providers, instances, setInstances, models, defaults, setDefaults, loading, saving, saveSettings, reload: load };
}

// =============================================================================
// API Keys Section
// =============================================================================

function ApiKeysSection({
  settings,
  setSettings,
  saving,
  saveSettings,
  compact,
}: {
  settings: AIProviderSettingsData;
  setSettings: (s: AIProviderSettingsData) => void;
  saving: boolean;
  saveSettings: () => void;
  compact: boolean;
}) {
  const inputClass = compact
    ? 'w-full bg-black/40 border border-white/25 rounded px-2 py-1 text-[10px]'
    : 'w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100';
  const labelClass = compact ? 'text-[10px] font-semibold mb-1 block' : 'text-sm font-medium mb-1 block';

  return (
    <div className={`p-4 ${compact ? 'space-y-3' : 'space-y-5'}`}>
      <SectionHeader>API Keys</SectionHeader>
      <p className={`${compact ? 'text-[9px]' : 'text-xs'} text-neutral-500`}>
        API keys for direct API calls. Not needed if using the bridge for all capabilities.
      </p>

      {/* OpenAI */}
      <div className={`rounded-lg border border-neutral-200 dark:border-neutral-800 ${compact ? 'p-3' : 'p-4'} space-y-3`}>
        <div className="flex items-center gap-2">
          <span className={`${compact ? 'text-[11px]' : 'text-sm'} font-medium`}>OpenAI</span>
          {settings.openai_api_key && settings.openai_api_key.length > 4 && (
            <Badge color="green" className="text-[9px]">configured</Badge>
          )}
        </div>
        <div>
          <label className={labelClass}>API Key</label>
          <input
            type="password"
            value={settings.openai_api_key || ''}
            onChange={(e) => setSettings({ ...settings, openai_api_key: e.target.value })}
            placeholder="sk-..."
            className={inputClass}
            autoComplete="new-password"
            data-lpignore="true"
            data-form-type="other"
          />
          <p className={`mt-1 ${compact ? 'text-[9px]' : 'text-xs'} text-neutral-500`}>
            Get your API key from platform.openai.com
          </p>
        </div>
      </div>

      {/* Anthropic */}
      <div className={`rounded-lg border border-neutral-200 dark:border-neutral-800 ${compact ? 'p-3' : 'p-4'} space-y-3`}>
        <div className="flex items-center gap-2">
          <span className={`${compact ? 'text-[11px]' : 'text-sm'} font-medium`}>Anthropic</span>
          {settings.anthropic_api_key && settings.anthropic_api_key.length > 4 && (
            <Badge color="green" className="text-[9px]">configured</Badge>
          )}
        </div>
        <div>
          <label className={labelClass}>API Key</label>
          <input
            type="password"
            value={settings.anthropic_api_key || ''}
            onChange={(e) => setSettings({ ...settings, anthropic_api_key: e.target.value })}
            placeholder="sk-ant-..."
            className={inputClass}
            autoComplete="new-password"
            data-lpignore="true"
            data-form-type="other"
          />
          <p className={`mt-1 ${compact ? 'text-[9px]' : 'text-xs'} text-neutral-500`}>
            Get your API key from console.anthropic.com
          </p>
        </div>
      </div>

      {/* Hidden fields to trick browser autofill */}
      <input type="text" name="prevent_autofill" style={{ display: 'none' }} />
      <input type="password" name="prevent_autofill_pw" style={{ display: 'none' }} />

      <div className="flex justify-end pt-2">
        <Button onClick={saveSettings} disabled={saving} size="sm">
          {saving ? 'Saving...' : 'Save Keys'}
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Capability Defaults Section
// =============================================================================

function DefaultsSection({
  models,
  defaults,
  setDefaults,
  compact,
}: {
  models: AiModelEntry[];
  defaults: Record<string, CapabilityDefault>;
  setDefaults: (d: Record<string, CapabilityDefault>) => void;
  compact: boolean;
}) {
  const [saving, setSaving] = useState(false);

  const saveDefaults = useCallback(async () => {
    setSaving(true);
    try {
      await pixsimClient.patch('/ai/defaults', defaults);
    } catch (error) {
      console.error('Failed to save defaults:', error);
    } finally {
      setSaving(false);
    }
  }, [defaults]);

  const updateDefault = useCallback((capability: string, field: 'model_id' | 'method', value: string) => {
    const current = defaults[capability] || { model_id: '', method: null };
    const updated = { ...current, [field]: value || null };

    // When model changes, reset method to first supported
    if (field === 'model_id') {
      const model = models.find((m) => m.id === value);
      updated.method = model?.supported_methods?.[0] || null;
    }

    setDefaults({ ...defaults, [capability]: updated });
  }, [defaults, setDefaults, models]);

  return (
    <div className={`p-4 ${compact ? 'space-y-3' : 'space-y-5'}`}>
      <SectionHeader>Capability Defaults</SectionHeader>
      <p className={`${compact ? 'text-[9px]' : 'text-xs'} text-neutral-500`}>
        Choose which model and delivery method to use for each capability.
      </p>

      {CAPABILITIES.map((cap) => {
        const current = defaults[cap.id] || { model_id: '', method: null };
        const capableModels = models.filter((m) => m.capabilities.includes(cap.id));
        const selectedModel = models.find((m) => m.id === current.model_id);
        const availableMethods = selectedModel?.supported_methods || [];

        return (
          <div
            key={cap.id}
            className={`rounded-lg border border-neutral-200 dark:border-neutral-800 ${compact ? 'p-3' : 'p-4'} space-y-2.5`}
          >
            <div className="flex items-center gap-2">
              <Icon name={cap.icon as 'messageSquare'} size={14} className="text-neutral-400" />
              <span className={`${compact ? 'text-[11px]' : 'text-sm'} font-medium`}>{cap.label}</span>
            </div>
            <p className={`${compact ? 'text-[9px]' : 'text-xs'} text-neutral-500`}>{cap.desc}</p>

            <div className="grid grid-cols-2 gap-2">
              {/* Model picker */}
              <div>
                <label className={`${compact ? 'text-[9px]' : 'text-xs'} text-neutral-500 mb-1 block`}>Model</label>
                <select
                  value={current.model_id}
                  onChange={(e) => updateDefault(cap.id, 'model_id', e.target.value)}
                  className={`w-full ${compact ? 'text-[10px] px-1.5 py-1' : 'text-xs px-2 py-1.5'} rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100`}
                >
                  <option value="">System default</option>
                  {capableModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Method picker */}
              <div>
                <label className={`${compact ? 'text-[9px]' : 'text-xs'} text-neutral-500 mb-1 block`}>Method</label>
                <select
                  value={current.method || ''}
                  onChange={(e) => updateDefault(cap.id, 'method', e.target.value)}
                  disabled={availableMethods.length <= 1}
                  className={`w-full ${compact ? 'text-[10px] px-1.5 py-1' : 'text-xs px-2 py-1.5'} rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 disabled:opacity-50`}
                >
                  {availableMethods.length === 0 && <option value="">Auto</option>}
                  {availableMethods.map((m) => (
                    <option key={m} value={m}>
                      {METHOD_LABELS[m] || m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Bridge hint for remote method */}
            {current.method === 'remote' && (
              <p className={`${compact ? 'text-[9px]' : 'text-xs'} text-amber-600 dark:text-amber-400`}>
                Requires a running agent bridge with MCP tools
              </p>
            )}
          </div>
        );
      })}

      <div className="flex justify-end pt-2">
        <Button onClick={saveDefaults} disabled={saving} size="sm">
          {saving ? 'Saving...' : 'Save Defaults'}
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Instances Section (cmd-llm)
// =============================================================================

function InstancesSection({
  instances,
  setInstances,
  compact,
}: {
  instances: LlmInstance[];
  setInstances: (i: LlmInstance[]) => void;
  compact: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LlmInstance | null>(null);
  const [form, setForm] = useState({ label: '', description: '', command: '', args: '', timeout: '60' });

  const inputClass = compact
    ? 'w-full bg-black/40 border border-white/25 rounded px-2 py-1 text-[10px]'
    : 'w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100';
  const labelClass = compact ? 'text-[10px] font-semibold mb-1 block' : 'text-sm font-medium mb-1 block';
  const cmdInstances = instances.filter((i) => i.provider_id === 'cmd-llm' || i.provider_id === 'cmd');

  const resetForm = () => {
    setForm({ label: '', description: '', command: '', args: '', timeout: '60' });
    setEditing(null);
    setShowForm(false);
  };

  const startEdit = (instance: LlmInstance) => {
    const config = instance.config as { command?: string; args?: string; timeout?: number };
    setForm({
      label: instance.label,
      description: instance.description || '',
      command: config.command || '',
      args: config.args || '',
      timeout: String(config.timeout || 60),
    });
    setEditing(instance);
    setShowForm(true);
  };

  const saveInstance = async () => {
    const config = {
      command: form.command,
      args: form.args || undefined,
      timeout: parseInt(form.timeout, 10) || 60,
    };
    try {
      if (editing) {
        await pixsimClient.patch(`/providers/llm-instances/${editing.id}`, {
          label: form.label,
          description: form.description || undefined,
          config,
        });
      } else {
        await pixsimClient.post('/providers/llm-instances', {
          provider_id: 'cmd-llm',
          label: form.label,
          description: form.description || undefined,
          config,
        });
      }
      const data = await pixsimClient.get<{ instances: LlmInstance[] }>('/providers/llm-instances');
      setInstances(data.instances || []);
      resetForm();
    } catch (error) {
      console.error('Failed to save instance:', error);
    }
  };

  const deleteInstance = async (id: number) => {
    try {
      await pixsimClient.delete(`/providers/llm-instances/${id}`);
      setInstances(instances.filter((i) => i.id !== id));
    } catch (error) {
      console.error('Failed to delete instance:', error);
    }
  };

  const toggleEnabled = async (instance: LlmInstance) => {
    try {
      await pixsimClient.patch(`/providers/llm-instances/${instance.id}`, { enabled: !instance.enabled });
      setInstances(instances.map((i) => (i.id === instance.id ? { ...i, enabled: !i.enabled } : i)));
    } catch (error) {
      console.error('Failed to toggle instance:', error);
    }
  };

  return (
    <div className={`p-4 ${compact ? 'space-y-3' : 'space-y-4'}`}>
      <div className="flex items-center justify-between">
        <SectionHeader>Command Instances</SectionHeader>
        {!showForm && (
          <Button size="sm" variant="ghost" onClick={() => setShowForm(true)}>
            + Add
          </Button>
        )}
      </div>
      <p className={`${compact ? 'text-[9px]' : 'text-xs'} text-neutral-500`}>
        CLI commands that receive prompts via stdin JSON and return results via stdout.
        Used by the &quot;cmd&quot; delivery method.
      </p>

      {cmdInstances.length === 0 && !showForm && (
        <div className="p-3 rounded border border-dashed border-neutral-300 dark:border-neutral-600 text-center">
          <p className={`${compact ? 'text-[9px]' : 'text-xs'} text-neutral-500`}>
            No command instances configured.
          </p>
        </div>
      )}

      {/* Instance cards */}
      {cmdInstances.map((instance) => {
        const config = instance.config as { command?: string; args?: string; timeout?: number };
        return (
          <div
            key={instance.id}
            className={`p-3 rounded-lg border ${
              instance.enabled
                ? 'border-neutral-200 dark:border-neutral-700'
                : 'border-neutral-300/50 dark:border-neutral-700/50 opacity-60'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`${compact ? 'text-[10px]' : 'text-sm'} font-medium`}>{instance.label}</span>
                  {!instance.enabled && (
                    <Badge color="gray" className="text-[9px]">Disabled</Badge>
                  )}
                </div>
                {instance.description && (
                  <p className={`${compact ? 'text-[9px]' : 'text-xs'} text-neutral-500 mt-0.5`}>
                    {instance.description}
                  </p>
                )}
                <p className={`${compact ? 'text-[9px]' : 'text-xs'} text-neutral-400 mt-1 font-mono truncate`}>
                  {config.command} {config.args || ''}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <Button size="sm" variant="ghost" onClick={() => toggleEnabled(instance)}>
                  {instance.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => startEdit(instance)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => void deleteInstance(instance.id)} className="text-red-500">
                  Delete
                </Button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Instance form */}
      {showForm && (
        <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className={`${compact ? 'text-[10px]' : 'text-sm'} font-medium`}>
              {editing ? 'Edit Instance' : 'New Instance'}
            </span>
            <Button size="sm" variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>
          <div>
            <label className={labelClass}>Label *</label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Claude CLI, Ollama, etc."
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Command *</label>
            <input
              type="text"
              value={form.command}
              onChange={(e) => setForm({ ...form, command: e.target.value })}
              placeholder="/path/to/llm-cli or ollama"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Arguments</label>
              <input
                type="text"
                value={form.args}
                onChange={(e) => setForm({ ...form, args: e.target.value })}
                placeholder="--model claude-3-5"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Timeout (s)</label>
              <input
                type="number"
                value={form.timeout}
                onChange={(e) => setForm({ ...form, timeout: e.target.value })}
                className={inputClass}
                min="1"
                max="600"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={resetForm}>Cancel</Button>
            <Button size="sm" onClick={saveInstance} disabled={!form.label || !form.command}>
              {editing ? 'Update' : 'Create'}
            </Button>
          </div>
        </div>
      )}

      {/* Env var fallback info */}
      <div className={`p-3 rounded ${compact ? 'bg-neutral-500/10' : 'bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700'}`}>
        <p className={`${compact ? 'text-[9px]' : 'text-xs'} text-neutral-600 dark:text-neutral-400`}>
          <strong>Fallback:</strong> If no instances are configured, environment variables are used:
        </p>
        <p className={`mt-1 ${compact ? 'text-[9px]' : 'text-xs'} text-neutral-500 font-mono`}>
          CMD_LLM_COMMAND, CMD_LLM_ARGS, CMD_LLM_TIMEOUT
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

interface AIProviderSettingsProps {
  autoLoad?: boolean;
  onSaveSuccess?: () => void;
  onSaveError?: (error: unknown) => void;
  compact?: boolean;
}

export function AIProviderSettings({
  autoLoad = true,
  compact = false,
}: AIProviderSettingsProps) {
  const { theme: variant } = useTheme();
  const state = useAISettings(autoLoad);

  const sections = useMemo<SidebarContentLayoutSection[]>(() => [
    { id: 'keys', label: 'API Keys', icon: <Icon name="key" size={12} /> },
    { id: 'defaults', label: 'Defaults', icon: <Icon name="settings" size={12} /> },
    { id: 'instances', label: 'Instances', icon: <Icon name="terminal" size={12} /> },
  ], []);

  const nav = useSidebarNav({
    sections,
    initial: 'defaults',
    storageKey: 'ai-provider-settings:nav',
  });

  if (state.loading) {
    return (
      <div className={`flex items-center justify-center ${compact ? 'py-2' : 'py-8'}`}>
        <span className={`text-neutral-500 ${compact ? 'text-[10px]' : 'text-sm'}`}>
          Loading AI settings...
        </span>
      </div>
    );
  }

  if (!state.settings) {
    return (
      <div className={`flex items-center justify-center ${compact ? 'py-2' : 'py-8'}`}>
        <span className={`text-neutral-500 ${compact ? 'text-[10px]' : 'text-sm'}`}>
          Failed to load settings
        </span>
      </div>
    );
  }

  let content: React.ReactNode;
  switch (nav.activeId) {
    case 'keys':
      content = (
        <ApiKeysSection
          settings={state.settings}
          setSettings={(s) => state.setSettings(s)}
          saving={state.saving}
          saveSettings={state.saveSettings}
          compact={compact}
        />
      );
      break;
    case 'defaults':
      content = (
        <DefaultsSection
          models={state.models}
          defaults={state.defaults}
          setDefaults={state.setDefaults}
          compact={compact}
        />
      );
      break;
    case 'instances':
      content = (
        <InstancesSection
          instances={state.instances}
          setInstances={state.setInstances}
          compact={compact}
        />
      );
      break;
    default:
      content = null;
  }

  return (
    <SidebarContentLayout
      sections={sections}
      activeSectionId={nav.activeSectionId}
      onSelectSection={nav.selectSection}
      variant={variant}
      collapsible
      expandedWidth={140}
      persistKey="ai-provider-settings-sidebar"
      contentClassName="overflow-y-auto"
    >
      {content}
    </SidebarContentLayout>
  );
}
