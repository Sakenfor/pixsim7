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
 * Shared AI provider settings component
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
      setProviders(providersResponse.data.providers || []);
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

  const labelClass = compact ? 'text-[10px] font-semibold mb-1 block' : '';
  const inputClass = compact
    ? 'w-full bg-black/40 border border-white/25 rounded px-2 py-1 text-[10px]'
    : '';
  const descClass = compact ? 'text-[10px] text-neutral-600 dark:text-neutral-400' : 'text-xs text-neutral-600 dark:text-neutral-400';

  return (
    <form
      className={`space-y-${compact ? '2' : '4'}`}
      autoComplete="off"
      onSubmit={(e) => e.preventDefault()}
    >
      {/* Hidden fields to trick browser autofill */}
      <input type="text" name="prevent_autofill" style={{ display: 'none' }} />
      <input type="password" name="prevent_autofill_pw" style={{ display: 'none' }} />

      <p className={descClass}>
        Configure AI providers for prompt editing, suggestions, and other AI-powered features.
      </p>

      <div className={`grid grid-cols-1 ${!compact && 'md:grid-cols-2'} gap-${compact ? '2' : '4'}`}>
        {compact ? (
          <>
            <div>
              <label className={labelClass}>OpenAI API Key</label>
              <input
                type="password"
                value={settings.openai_api_key || ''}
                onChange={(e) => setSettings({ ...settings, openai_api_key: e.target.value })}
                placeholder="sk-..."
                className={inputClass}
                autoComplete="new-password"
                data-lpignore="true"
                data-form-type="other"
                name="openai_api_key_field"
              />
            </div>

            <div>
              <label className={labelClass}>Anthropic API Key</label>
              <input
                type="password"
                value={settings.anthropic_api_key || ''}
                onChange={(e) => setSettings({ ...settings, anthropic_api_key: e.target.value })}
                placeholder="sk-ant-..."
                className={inputClass}
                autoComplete="new-password"
                data-lpignore="true"
                data-form-type="other"
                name="anthropic_api_key_field"
              />
            </div>

            <div>
              <label className={labelClass}>Default Provider</label>
              <select
                value={settings.llm_provider}
                onChange={(e) => setSettings({ ...settings, llm_provider: e.target.value })}
                className={inputClass}
              >
                {providers.map((p) => (
                  <option key={p.provider_id} value={p.provider_id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {settings.llm_provider === 'cmd-llm' && (
                <p className="text-[9px] text-amber-500 mt-1">
                  Configure via CMD_LLM_COMMAND environment variable
                </p>
              )}
            </div>

            <div>
              <label className={labelClass}>Default Model (optional)</label>
              <input
                type="text"
                value={settings.llm_default_model || ''}
                onChange={(e) => setSettings({ ...settings, llm_default_model: e.target.value })}
                placeholder="gpt-4o-mini or claude-3-5-sonnet"
                className={inputClass}
              />
            </div>
          </>
        ) : (
          <>
            <FormField
              label="OpenAI API Key"
              helpText="For GPT models (prompt editing, suggestions)"
              size="sm"
            >
              <Input
                type="password"
                value={settings.openai_api_key || ''}
                onChange={(e) => setSettings({ ...settings, openai_api_key: e.target.value })}
                placeholder="sk-..."
                size="sm"
                autoComplete="new-password"
                data-lpignore="true"
                data-form-type="other"
                name="openai_api_key_input"
              />
            </FormField>

            <FormField
              label="Anthropic API Key"
              helpText="For Claude models (prompt editing, suggestions)"
              size="sm"
            >
              <Input
                type="password"
                value={settings.anthropic_api_key || ''}
                onChange={(e) => setSettings({ ...settings, anthropic_api_key: e.target.value })}
                placeholder="sk-ant-..."
                size="sm"
                autoComplete="new-password"
                data-lpignore="true"
                data-form-type="other"
                name="anthropic_api_key_input"
              />
            </FormField>

            <FormField
              label="Default Provider"
              helpText={
                settings.llm_provider === 'cmd-llm'
                  ? 'Configure via CMD_LLM_COMMAND environment variable'
                  : 'Which AI provider to use by default'
              }
              size="sm"
            >
              <select
                value={settings.llm_provider}
                onChange={(e) => setSettings({ ...settings, llm_provider: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
              >
                {providers.map((p) => (
                  <option key={p.provider_id} value={p.provider_id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField
              label="Default Model"
              helpText="Specific model to use (optional)"
              size="sm"
            >
              <Input
                type="text"
                value={settings.llm_default_model || ''}
                onChange={(e) => setSettings({ ...settings, llm_default_model: e.target.value })}
                placeholder="gpt-4o-mini or claude-3-5-sonnet"
                size="sm"
              />
            </FormField>
          </>
        )}
      </div>

      <div className={`flex ${compact ? 'justify-end' : 'justify-end'}`}>
        {compact ? (
          <button
            onClick={saveSettings}
            disabled={saving}
            className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded text-[10px] font-semibold mt-2"
          >
            {saving ? 'Saving...' : 'Save AI Settings'}
          </button>
        ) : (
          <Button onClick={saveSettings} disabled={saving} size="sm">
            {saving ? 'Saving...' : 'Save AI Settings'}
          </Button>
        )}
      </div>
    </form>
  );
}
