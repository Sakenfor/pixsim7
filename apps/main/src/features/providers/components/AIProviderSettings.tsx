import { useState, useEffect } from 'react';
import { Button, FormField, Input } from '@pixsim7/shared.ui';
import { pixsimClient } from '@lib/api/client';

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

interface AIProviderSettingsProps {
  /** Whether to auto-load settings on mount (default: true) */
  autoLoad?: boolean;
  /** Callback when settings are successfully saved */
  onSaveSuccess?: () => void;
  /** Callback when save fails */
  onSaveError?: (error: unknown) => void;
  /** Whether to show as compact version (smaller text, tighter spacing) */
  compact?: boolean;
}

/**
 * Shared AI provider settings component with tabbed provider interface
 * Used across multiple interfaces:
 * - Main ProviderSettingsPanel
 * - Control Center Cube Settings
 * - Control Center Providers Module
 */
export function AIProviderSettings({
  autoLoad = true,
  onSaveSuccess,
  onSaveError,
  compact = false,
}: AIProviderSettingsProps) {
  const [settings, setSettings] = useState<AIProviderSettingsData | null>(null);
  const [providers, setProviders] = useState<LlmProviderInfo[]>([]);
  const [instances, setInstances] = useState<LlmInstance[]>([]);
  const [activeTab, setActiveTab] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(autoLoad);

  // Instance form state for cmd-llm
  const [showInstanceForm, setShowInstanceForm] = useState(false);
  const [editingInstance, setEditingInstance] = useState<LlmInstance | null>(null);
  const [instanceForm, setInstanceForm] = useState({
    label: '',
    description: '',
    command: '',
    args: '',
    timeout: '60',
  });

  // Load AI settings and available providers
  const loadSettings = async () => {
    setLoading(true);
    try {
      const [settingsData, providersData, instancesData] = await Promise.all([
        pixsimClient.get<AIProviderSettingsData>('/providers/ai-providers/settings'),
        pixsimClient.get<{ providers: LlmProviderInfo[] }>('/ai/providers'),
        pixsimClient.get<{ instances: LlmInstance[] }>('/providers/llm-instances'),
      ]);
      setSettings(settingsData);
      const providerList = providersData.providers || [];
      setProviders(providerList);
      setInstances(instancesData.instances || []);
      // Set initial active tab to current provider or first available
      const currentProvider = settingsResponse.data.llm_provider;
      if (providerList.find(p => p.provider_id === currentProvider)) {
        setActiveTab(currentProvider);
      } else if (providerList.length > 0) {
        setActiveTab(providerList[0].provider_id);
      }
    } catch (error) {
      console.error('Failed to load AI provider settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-load on mount if enabled
  useEffect(() => {
    if (autoLoad) {
      loadSettings();
    }
  }, [autoLoad]);

  // Save settings
  const saveSettings = async () => {
    if (!settings) return;

    setSaving(true);
    try {
      await pixsimClient.patch('/providers/ai-providers/settings', settings);
      onSaveSuccess?.();
    } catch (error) {
      console.error('Failed to save AI provider settings:', error);
      onSaveError?.(error);
    } finally {
      setSaving(false);
    }
  };

  // Set provider as default
  const setAsDefault = (providerId: string) => {
    if (settings) {
      setSettings({ ...settings, llm_provider: providerId });
    }
  };

  // Instance management for cmd-llm
  const resetInstanceForm = () => {
    setInstanceForm({ label: '', description: '', command: '', args: '', timeout: '60' });
    setEditingInstance(null);
    setShowInstanceForm(false);
  };

  const startEditInstance = (instance: LlmInstance) => {
    const config = instance.config as { command?: string; args?: string; timeout?: number };
    setInstanceForm({
      label: instance.label,
      description: instance.description || '',
      command: config.command || '',
      args: config.args || '',
      timeout: String(config.timeout || 60),
    });
    setEditingInstance(instance);
    setShowInstanceForm(true);
  };

  const saveInstance = async () => {
    const config = {
      command: instanceForm.command,
      args: instanceForm.args || undefined,
      timeout: parseInt(instanceForm.timeout, 10) || 60,
    };

    try {
      if (editingInstance) {
        await pixsimClient.patch(`/providers/llm-instances/${editingInstance.id}`, {
          label: instanceForm.label,
          description: instanceForm.description || undefined,
          config,
        });
      } else {
        await pixsimClient.post('/providers/llm-instances', {
          provider_id: 'cmd-llm',
          label: instanceForm.label,
          description: instanceForm.description || undefined,
          config,
        });
      }
      // Reload instances
      const instancesData = await pixsimClient.get<{ instances: LlmInstance[] }>('/providers/llm-instances');
      setInstances(instancesData.instances || []);
      resetInstanceForm();
    } catch (error) {
      console.error('Failed to save instance:', error);
    }
  };

  const deleteInstance = async (instanceId: number) => {
    try {
      await pixsimClient.delete(`/providers/llm-instances/${instanceId}`);
      setInstances(instances.filter(i => i.id !== instanceId));
    } catch (error) {
      console.error('Failed to delete instance:', error);
    }
  };

  const toggleInstanceEnabled = async (instance: LlmInstance) => {
    try {
      await pixsimClient.patch(`/providers/llm-instances/${instance.id}`, {
        enabled: !instance.enabled,
      });
      setInstances(instances.map(i =>
        i.id === instance.id ? { ...i, enabled: !i.enabled } : i
      ));
    } catch (error) {
      console.error('Failed to toggle instance:', error);
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center ${compact ? 'py-2' : 'py-4'}`}>
        <span className={`text-neutral-500 ${compact ? 'text-[10px]' : 'text-sm'}`}>
          Loading AI settings...
        </span>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className={`flex items-center justify-center ${compact ? 'py-2' : 'py-4'}`}>
        <span className={`text-neutral-500 ${compact ? 'text-[10px]' : 'text-sm'}`}>
          Failed to load settings
        </span>
      </div>
    );
  }

  const activeProvider = providers.find(p => p.provider_id === activeTab);
  const isDefault = settings.llm_provider === activeTab;

  // Render provider-specific configuration
  const renderProviderConfig = () => {
    if (!activeProvider) return null;

    const inputClass = compact
      ? 'w-full bg-black/40 border border-white/25 rounded px-2 py-1 text-[10px]'
      : 'w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100';
    const labelClass = compact ? 'text-[10px] font-semibold mb-1 block' : 'text-sm font-medium mb-1 block';

    switch (activeTab) {
      case 'openai-llm':
        return (
          <div className="space-y-3">
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
            <div>
              <label className={labelClass}>Model</label>
              <input
                type="text"
                value={isDefault ? (settings.llm_default_model || '') : ''}
                onChange={(e) => setSettings({ ...settings, llm_default_model: e.target.value })}
                placeholder="gpt-4o-mini, gpt-4, gpt-4-turbo"
                className={inputClass}
                disabled={!isDefault}
              />
              {!isDefault && (
                <p className={`mt-1 ${compact ? 'text-[9px]' : 'text-xs'} text-neutral-500`}>
                  Set as default to configure model
                </p>
              )}
            </div>
          </div>
        );

      case 'anthropic-llm':
        return (
          <div className="space-y-3">
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
            <div>
              <label className={labelClass}>Model</label>
              <input
                type="text"
                value={isDefault ? (settings.llm_default_model || '') : ''}
                onChange={(e) => setSettings({ ...settings, llm_default_model: e.target.value })}
                placeholder="claude-3-5-sonnet-20241022"
                className={inputClass}
                disabled={!isDefault}
              />
              {!isDefault && (
                <p className={`mt-1 ${compact ? 'text-[9px]' : 'text-xs'} text-neutral-500`}>
                  Set as default to configure model
                </p>
              )}
            </div>
          </div>
        );

      case 'cmd-llm': {
        const cmdInstances = instances.filter(i => i.provider_id === 'cmd-llm');
        return (
          <div className="space-y-4">
            {/* Instances list */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={labelClass}>Command Instances</label>
                {!showInstanceForm && (
                  <button
                    onClick={() => setShowInstanceForm(true)}
                    className={`${compact ? 'text-[9px] px-2 py-0.5' : 'text-xs px-2 py-1'} rounded bg-blue-600 hover:bg-blue-500 text-white`}
                  >
                    + Add Instance
                  </button>
                )}
              </div>

              {cmdInstances.length === 0 && !showInstanceForm && (
                <div className={`p-3 rounded border border-dashed border-neutral-300 dark:border-neutral-600 text-center`}>
                  <p className={`${compact ? 'text-[9px]' : 'text-xs'} text-neutral-500`}>
                    No command instances configured. Add one to use CLI-based LLMs like Claude CLI or Ollama.
                  </p>
                </div>
              )}

              {/* Instance cards */}
              {cmdInstances.map((instance) => {
                const config = instance.config as { command?: string; args?: string; timeout?: number };
                return (
                  <div
                    key={instance.id}
                    className={`p-3 rounded border ${instance.enabled ? 'border-neutral-200 dark:border-neutral-700' : 'border-neutral-300/50 dark:border-neutral-700/50 opacity-60'} mb-2`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`${compact ? 'text-[10px]' : 'text-sm'} font-medium`}>
                            {instance.label}
                          </span>
                          {!instance.enabled && (
                            <span className={`${compact ? 'text-[8px]' : 'text-[10px]'} px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-500`}>
                              Disabled
                            </span>
                          )}
                        </div>
                        {instance.description && (
                          <p className={`${compact ? 'text-[9px]' : 'text-xs'} text-neutral-500 mt-0.5`}>
                            {instance.description}
                          </p>
                        )}
                        <p className={`${compact ? 'text-[9px]' : 'text-xs'} text-neutral-400 mt-1 font-mono`}>
                          {config.command} {config.args || ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleInstanceEnabled(instance)}
                          className={`${compact ? 'text-[9px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} rounded border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800`}
                        >
                          {instance.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => startEditInstance(instance)}
                          className={`${compact ? 'text-[9px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} rounded border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800`}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteInstance(instance.id)}
                          className={`${compact ? 'text-[9px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} rounded border border-red-300 dark:border-red-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20`}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Instance form */}
              {showInstanceForm && (
                <div className={`p-3 rounded border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 space-y-3`}>
                  <div className="flex items-center justify-between">
                    <span className={`${compact ? 'text-[10px]' : 'text-sm'} font-medium`}>
                      {editingInstance ? 'Edit Instance' : 'New Instance'}
                    </span>
                    <button
                      onClick={resetInstanceForm}
                      className={`${compact ? 'text-[9px]' : 'text-xs'} text-neutral-500 hover:text-neutral-700`}
                    >
                      Cancel
                    </button>
                  </div>
                  <div>
                    <label className={labelClass}>Label *</label>
                    <input
                      type="text"
                      value={instanceForm.label}
                      onChange={(e) => setInstanceForm({ ...instanceForm, label: e.target.value })}
                      placeholder="Claude CLI, Ollama, etc."
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Description</label>
                    <input
                      type="text"
                      value={instanceForm.description}
                      onChange={(e) => setInstanceForm({ ...instanceForm, description: e.target.value })}
                      placeholder="Optional description"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Command *</label>
                    <input
                      type="text"
                      value={instanceForm.command}
                      onChange={(e) => setInstanceForm({ ...instanceForm, command: e.target.value })}
                      placeholder="/path/to/llm-cli or ollama"
                      className={inputClass}
                    />
                    <p className={`mt-1 ${compact ? 'text-[9px]' : 'text-xs'} text-neutral-500`}>
                      The command to execute (receives JSON on stdin)
                    </p>
                  </div>
                  <div>
                    <label className={labelClass}>Arguments</label>
                    <input
                      type="text"
                      value={instanceForm.args}
                      onChange={(e) => setInstanceForm({ ...instanceForm, args: e.target.value })}
                      placeholder="--model claude-3-5-sonnet"
                      className={inputClass}
                    />
                    <p className={`mt-1 ${compact ? 'text-[9px]' : 'text-xs'} text-neutral-500`}>
                      Additional command-line arguments (shell-style quoting supported)
                    </p>
                  </div>
                  <div>
                    <label className={labelClass}>Timeout (seconds)</label>
                    <input
                      type="number"
                      value={instanceForm.timeout}
                      onChange={(e) => setInstanceForm({ ...instanceForm, timeout: e.target.value })}
                      placeholder="60"
                      className={inputClass}
                      min="1"
                      max="600"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={resetInstanceForm}
                      className={`${compact ? 'text-[9px] px-2 py-1' : 'text-xs px-3 py-1.5'} rounded border border-neutral-300 dark:border-neutral-600`}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveInstance}
                      disabled={!instanceForm.label || !instanceForm.command}
                      className={`${compact ? 'text-[9px] px-2 py-1' : 'text-xs px-3 py-1.5'} rounded bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white`}
                    >
                      {editingInstance ? 'Update' : 'Create'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Info box about env var fallback */}
            <div className={`p-3 rounded ${compact ? 'bg-neutral-500/10' : 'bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700'}`}>
              <p className={`${compact ? 'text-[9px]' : 'text-xs'} text-neutral-600 dark:text-neutral-400`}>
                <strong>Fallback:</strong> If no instances are configured, environment variables are used:
              </p>
              <ul className={`mt-1.5 space-y-0.5 ${compact ? 'text-[9px]' : 'text-xs'} text-neutral-500 font-mono`}>
                <li><span className="text-blue-500">CMD_LLM_COMMAND</span>, <span className="text-blue-500">CMD_LLM_ARGS</span>, <span className="text-blue-500">CMD_LLM_TIMEOUT</span></li>
              </ul>
            </div>

            {/* Model ID */}
            <div>
              <label className={labelClass}>Model ID</label>
              <input
                type="text"
                value={isDefault ? (settings.llm_default_model || '') : ''}
                onChange={(e) => setSettings({ ...settings, llm_default_model: e.target.value })}
                placeholder="cmd:default or custom model id"
                className={inputClass}
                disabled={!isDefault}
              />
              <p className={`mt-1 ${compact ? 'text-[9px]' : 'text-xs'} text-neutral-500`}>
                Model ID passed to your command in the JSON payload
              </p>
            </div>
          </div>
        );
      }

      default:
        // Generic provider config
        return (
          <div className="space-y-3">
            {activeProvider.requires_credentials !== false && (
              <div className={`p-3 rounded bg-neutral-100 dark:bg-neutral-800`}>
                <p className={`${compact ? 'text-[10px]' : 'text-sm'} text-neutral-600 dark:text-neutral-400`}>
                  {activeProvider.description || 'Configure this provider in your environment or settings.'}
                </p>
              </div>
            )}
            <div>
              <label className={labelClass}>Model</label>
              <input
                type="text"
                value={isDefault ? (settings.llm_default_model || '') : ''}
                onChange={(e) => setSettings({ ...settings, llm_default_model: e.target.value })}
                placeholder="Model identifier"
                className={inputClass}
                disabled={!isDefault}
              />
            </div>
          </div>
        );
    }
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-4'}>
      {/* Hidden fields to trick browser autofill */}
      <input type="text" name="prevent_autofill" style={{ display: 'none' }} />
      <input type="password" name="prevent_autofill_pw" style={{ display: 'none' }} />

      {/* Provider tabs */}
      <div className={`flex ${compact ? 'gap-1' : 'gap-2'} border-b border-neutral-200 dark:border-neutral-700`}>
        {providers.map((provider) => {
          const isActive = activeTab === provider.provider_id;
          const isProviderDefault = settings.llm_provider === provider.provider_id;

          return (
            <button
              key={provider.provider_id}
              onClick={() => setActiveTab(provider.provider_id)}
              className={`
                relative px-3 py-2 ${compact ? 'text-[10px]' : 'text-sm'} font-medium
                border-b-2 -mb-px transition-colors
                ${isActive
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                }
              `}
            >
              {provider.name}
              {isProviderDefault && (
                <span className={`
                  ml-1.5 px-1.5 py-0.5 rounded-full
                  ${compact ? 'text-[8px]' : 'text-[10px]'}
                  bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400
                `}>
                  Default
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active provider content */}
      {activeProvider && (
        <div className={compact ? 'space-y-2' : 'space-y-4'}>
          {/* Provider description */}
          {activeProvider.description && !compact && (
            <p className="text-xs text-neutral-500">
              {activeProvider.description}
            </p>
          )}

          {/* Set as default button */}
          {!isDefault && (
            <button
              onClick={() => setAsDefault(activeTab)}
              className={`
                ${compact ? 'text-[10px] px-2 py-1' : 'text-sm px-3 py-1.5'}
                rounded border border-blue-500 text-blue-600 dark:text-blue-400
                hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors
              `}
            >
              Set as Default Provider
            </button>
          )}

          {/* Provider-specific configuration */}
          {renderProviderConfig()}
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end pt-2">
        {compact ? (
          <button
            onClick={saveSettings}
            disabled={saving}
            className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded text-[10px] font-semibold"
          >
            {saving ? 'Saving...' : 'Save AI Settings'}
          </button>
        ) : (
          <Button onClick={saveSettings} disabled={saving} size="sm">
            {saving ? 'Saving...' : 'Save AI Settings'}
          </Button>
        )}
      </div>
    </div>
  );
}
