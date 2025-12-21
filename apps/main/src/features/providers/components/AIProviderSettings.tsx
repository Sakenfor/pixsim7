import { useState, useEffect } from 'react';
import { Button, FormField, Input } from '@pixsim7/shared.ui';
import { apiClient } from '@lib/api/client';

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
  const [activeTab, setActiveTab] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(autoLoad);

  // Load AI settings and available providers
  const loadSettings = async () => {
    setLoading(true);
    try {
      const [settingsResponse, providersResponse] = await Promise.all([
        apiClient.get<AIProviderSettingsData>('/providers/ai-providers/settings'),
        apiClient.get<{ providers: LlmProviderInfo[] }>('/ai/providers'),
      ]);
      setSettings(settingsResponse.data);
      const providerList = providersResponse.data.providers || [];
      setProviders(providerList);
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
      await apiClient.patch('/providers/ai-providers/settings', settings);
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

      case 'cmd-llm':
        return (
          <div className="space-y-3">
            <div className={`p-3 rounded ${compact ? 'bg-amber-500/10' : 'bg-amber-500/10 border border-amber-500/20'}`}>
              <p className={`${compact ? 'text-[10px]' : 'text-sm'} text-amber-600 dark:text-amber-400 font-medium mb-2`}>
                Environment Variable Configuration
              </p>
              <p className={`${compact ? 'text-[9px]' : 'text-xs'} text-neutral-600 dark:text-neutral-400`}>
                This provider runs a local command for LLM operations. Configure via environment variables:
              </p>
              <ul className={`mt-2 space-y-1 ${compact ? 'text-[9px]' : 'text-xs'} text-neutral-500 font-mono`}>
                <li><span className="text-blue-500">CMD_LLM_COMMAND</span> - Command to execute (required)</li>
                <li><span className="text-blue-500">CMD_LLM_ARGS</span> - Additional arguments (optional)</li>
                <li><span className="text-blue-500">CMD_LLM_TIMEOUT</span> - Timeout in seconds (default: 60)</li>
              </ul>
            </div>
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
