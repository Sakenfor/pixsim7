/* eslint-disable react-refresh/only-export-components */
/**
 * Generation Settings Schema
 *
 * Configure retry behavior and defaults for generation tools.
 */

import { useEffect, useRef, useState } from 'react';

import { pixsimClient } from '@lib/api';

import {
  useGenerationSettingsStore,
  useGenerationHistoryStore,
  type HistoryMode,
  type HistorySortMode,
} from '@features/generation';

import { settingsSchemaRegistry, type SettingGroup, type SettingStoreAdapter } from '../core';

// ===== Server generation config (rate limits, retry, per-user caps) =====

interface GenerationServerConfig {
  rate_limit_max_requests: number;
  rate_limit_window_seconds: number;
  login_rate_limit_max_requests: number;
  login_rate_limit_window_seconds: number;
  auto_retry_enabled: boolean;
  auto_retry_max_attempts: number;
  max_jobs_per_user: number;
  max_accounts_per_user: number;
}

async function fetchGenerationServerConfig(): Promise<GenerationServerConfig> {
  return pixsimClient.get<GenerationServerConfig>('/admin/generation/config');
}

async function updateGenerationServerConfig(
  patch: Partial<GenerationServerConfig>,
): Promise<GenerationServerConfig> {
  return pixsimClient.patch<GenerationServerConfig>('/admin/generation/config', patch);
}

// ===== Server LLM config (cache tuning) =====

interface LLMServerConfig {
  llm_cache_enabled: boolean;
  llm_cache_ttl: number;
  llm_cache_freshness: number;
}

async function fetchLLMServerConfig(): Promise<LLMServerConfig> {
  return pixsimClient.get<LLMServerConfig>('/admin/llm/config');
}

async function updateLLMServerConfig(
  patch: Partial<LLMServerConfig>,
): Promise<LLMServerConfig> {
  return pixsimClient.patch<LLMServerConfig>('/admin/llm/config', patch);
}

const adminOnly = (values: Record<string, any>) => !!values.__isAdmin;

function HistoryClearActions({
  value,
  onChange,
  disabled,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  void value;
  void onChange;
  const clearAllHistory = useGenerationHistoryStore((s) => s.clearAllHistory);
  const clearAllUnpinned = useGenerationHistoryStore((s) => s.clearAllUnpinned);
  const hasHistory = useGenerationHistoryStore((s) =>
    Object.values(s.historyByOperation).some((entries) => (entries ?? []).length > 0),
  );

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={disabled || !hasHistory}
        onClick={() => clearAllUnpinned()}
        className="px-2 py-1 text-xs rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:text-red-600 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Clear Recent
      </button>
      <button
        type="button"
        disabled={disabled || !hasHistory}
        onClick={() => clearAllHistory()}
        className="px-2 py-1 text-xs rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:text-red-600 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Clear All
      </button>
    </div>
  );
}

const generationGroups: SettingGroup[] = [
  {
    id: 'viewer',
    title: 'Asset Viewer',
    description: 'Control behavior when viewing assets.',
    fields: [
      {
        id: 'autoSwitchOperationType',
        type: 'toggle',
        label: 'Auto-switch operation type',
        description: 'Automatically switch to "Extend" for videos and "Image to Video" for images when viewing an asset.',
        defaultValue: true,
      },
    ],
  },
  {
    id: 'history',
    title: 'Asset History',
    description: 'Configure how asset usage history is tracked for quick reuse.',
    fields: [
      {
        id: 'historyMode',
        type: 'select',
        label: 'History Mode',
        description: 'How to organize asset history.',
        defaultValue: 'per-operation',
        options: [
          { value: 'per-operation', label: 'Per Operation', description: 'Separate history for each operation type (I2V, Extend, etc.)' },
          { value: 'global', label: 'Global', description: 'Single shared history across all operation types' },
        ],
      },
      {
        id: 'maxHistorySize',
        type: 'number',
        label: 'Max History Size',
        description: 'Maximum number of recent (non-pinned) assets to keep in history.',
        min: 5,
        max: 100,
        step: 5,
        defaultValue: 20,
      },
      {
        id: 'historySortMode',
        type: 'select',
        label: 'Sort Order',
        description: 'Choose whether pinned assets stay on top or sort by recency.',
        defaultValue: 'pinned-first',
        options: [
          { value: 'pinned-first', label: 'Pinned first' },
          { value: 'recent-first', label: 'Most recent first' },
        ],
      },
      {
        id: 'includeOutputsInHistory',
        type: 'toggle',
        label: 'Include outputs in history',
        description: 'Record generated output assets in history for quick reuse.',
        defaultValue: true,
      },
      {
        id: 'hideIncompatibleAssets',
        type: 'toggle',
        label: 'Hide incompatible assets',
        description: 'Hide assets that cannot be used by the current operation.',
        defaultValue: false,
      },
      {
        id: 'autoPrefetchHistoryThumbnails',
        type: 'toggle',
        label: 'Auto-prefetch missing thumbnails',
        description: 'Fetch asset details when thumbnails are missing or stale.',
        defaultValue: true,
      },
      {
        id: 'usePerOperationHistoryLimits',
        type: 'toggle',
        label: 'Per-operation history limits',
        description: 'Override the global history size for specific operation types.',
        defaultValue: false,
      },
      {
        id: 'maxHistorySizeTextToImage',
        type: 'number',
        label: 'Max History Size (Text to Image)',
        min: 5,
        max: 100,
        step: 5,
        defaultValue: 20,
        showWhen: (values) => values.usePerOperationHistoryLimits === true && values.historyMode === 'per-operation',
      },
      {
        id: 'maxHistorySizeTextToVideo',
        type: 'number',
        label: 'Max History Size (Text to Video)',
        min: 5,
        max: 100,
        step: 5,
        defaultValue: 20,
        showWhen: (values) => values.usePerOperationHistoryLimits === true && values.historyMode === 'per-operation',
      },
      {
        id: 'maxHistorySizeImageToVideo',
        type: 'number',
        label: 'Max History Size (Image to Video)',
        min: 5,
        max: 100,
        step: 5,
        defaultValue: 20,
        showWhen: (values) => values.usePerOperationHistoryLimits === true && values.historyMode === 'per-operation',
      },
      {
        id: 'maxHistorySizeImageToImage',
        type: 'number',
        label: 'Max History Size (Image to Image)',
        min: 5,
        max: 100,
        step: 5,
        defaultValue: 20,
        showWhen: (values) => values.usePerOperationHistoryLimits === true && values.historyMode === 'per-operation',
      },
      {
        id: 'maxHistorySizeVideoExtend',
        type: 'number',
        label: 'Max History Size (Video Extend)',
        min: 5,
        max: 100,
        step: 5,
        defaultValue: 20,
        showWhen: (values) => values.usePerOperationHistoryLimits === true && values.historyMode === 'per-operation',
      },
      {
        id: 'maxHistorySizeVideoTransition',
        type: 'number',
        label: 'Max History Size (Video Transition)',
        min: 5,
        max: 100,
        step: 5,
        defaultValue: 20,
        showWhen: (values) => values.usePerOperationHistoryLimits === true && values.historyMode === 'per-operation',
      },
      {
        id: 'maxHistorySizeFusion',
        type: 'number',
        label: 'Max History Size (Fusion)',
        min: 5,
        max: 100,
        step: 5,
        defaultValue: 20,
        showWhen: (values) => values.usePerOperationHistoryLimits === true && values.historyMode === 'per-operation',
      },
      {
        id: 'historyClearActions',
        type: 'custom',
        label: 'Clear History',
        description: 'Remove recent history entries (optionally keep pinned).',
        component: HistoryClearActions,
      },
    ],
  },
  {
    id: 'retries',
    title: 'Auto-Retry',
    description: 'Control how failed generations are retried.',
    fields: [
      {
        id: 'autoRetryEnabled',
        type: 'toggle',
        label: 'Enable Auto-Retry',
        description: 'Automatically retry failed generations when errors look temporary or content-related.',
        defaultValue: true,
      },
      {
        id: 'autoRetryMaxAttempts',
        type: 'number',
        label: 'Max Retry Attempts',
        description: 'Maximum number of attempts per generation (including the first).',
        min: 1,
        max: 50,
        step: 1,
        defaultValue: 20,
      },
    ],
  },
  {
    id: 'server-limits',
    title: 'Server Limits',
    description: 'Rate limits, retry caps, and per-user quotas applied server-side. Changes are persisted to the database.',
    showWhen: adminOnly,
    adminGroup: true,
    fields: [
      {
        id: 'server_rateLimitMaxRequests',
        type: 'number',
        label: 'Generation Rate Limit — Max Requests',
        description: 'Maximum generation requests allowed per time window.',
        min: 1,
        max: 100,
        step: 1,
        defaultValue: 10,
      },
      {
        id: 'server_rateLimitWindowSeconds',
        type: 'number',
        label: 'Generation Rate Limit — Window (seconds)',
        description: 'Time window for the generation rate limit counter.',
        min: 10,
        max: 3600,
        step: 10,
        defaultValue: 60,
      },
      {
        id: 'server_loginRateLimitMaxRequests',
        type: 'number',
        label: 'Login Rate Limit — Max Requests',
        description: 'Maximum login attempts allowed per time window.',
        min: 1,
        max: 100,
        step: 1,
        defaultValue: 5,
      },
      {
        id: 'server_loginRateLimitWindowSeconds',
        type: 'number',
        label: 'Login Rate Limit — Window (seconds)',
        description: 'Time window for the login rate limit counter.',
        min: 10,
        max: 3600,
        step: 10,
        defaultValue: 60,
      },
      {
        id: 'server_autoRetryEnabled',
        type: 'toggle',
        label: 'Server Auto-Retry Enabled',
        description: 'Enable automatic retry for failed generations server-side.',
        defaultValue: true,
      },
      {
        id: 'server_autoRetryMaxAttempts',
        type: 'number',
        label: 'Server Auto-Retry Max Attempts',
        description: 'Server-enforced maximum retry attempts per generation.',
        min: 1,
        max: 50,
        step: 1,
        defaultValue: 20,
      },
      {
        id: 'server_maxJobsPerUser',
        type: 'number',
        label: 'Max Concurrent Jobs per User',
        description: 'Maximum number of concurrent generation jobs allowed per user.',
        min: 1,
        max: 100,
        step: 1,
        defaultValue: 10,
      },
      {
        id: 'server_maxAccountsPerUser',
        type: 'number',
        label: 'Max Provider Accounts per User',
        description: 'Maximum number of provider accounts a user can link.',
        min: 1,
        max: 50,
        step: 1,
        defaultValue: 5,
      },
    ],
  },
  {
    id: 'server-llm',
    title: 'LLM Cache',
    description: 'Control LLM response caching behavior. Changes are persisted to the database.',
    showWhen: adminOnly,
    adminGroup: true,
    fields: [
      {
        id: 'server_llmCacheEnabled',
        type: 'toggle',
        label: 'Enable LLM Cache',
        description: 'Cache LLM responses in Redis to reduce API costs and latency.',
        defaultValue: true,
      },
      {
        id: 'server_llmCacheTtl',
        type: 'number',
        label: 'Cache TTL (seconds)',
        description: 'Time-to-live for cached LLM responses.',
        min: 0,
        max: 86400,
        step: 60,
        defaultValue: 3600,
      },
      {
        id: 'server_llmCacheFreshness',
        type: 'number',
        label: 'Cache Freshness',
        description: 'Freshness threshold (0.0 = always use cache, 1.0 = always regenerate).',
        min: 0,
        max: 1,
        step: 0.1,
        defaultValue: 0,
      },
    ],
  },
];

// Field ID → server config key mapping (generation namespace)
const GENERATION_FIELD_MAP: Record<string, keyof GenerationServerConfig> = {
  server_rateLimitMaxRequests: 'rate_limit_max_requests',
  server_rateLimitWindowSeconds: 'rate_limit_window_seconds',
  server_loginRateLimitMaxRequests: 'login_rate_limit_max_requests',
  server_loginRateLimitWindowSeconds: 'login_rate_limit_window_seconds',
  server_autoRetryEnabled: 'auto_retry_enabled',
  server_autoRetryMaxAttempts: 'auto_retry_max_attempts',
  server_maxJobsPerUser: 'max_jobs_per_user',
  server_maxAccountsPerUser: 'max_accounts_per_user',
};

// Field ID → server config key mapping (llm namespace)
const LLM_FIELD_MAP: Record<string, keyof LLMServerConfig> = {
  server_llmCacheEnabled: 'llm_cache_enabled',
  server_llmCacheTtl: 'llm_cache_ttl',
  server_llmCacheFreshness: 'llm_cache_freshness',
};

// Boolean server fields need Boolean() coercion instead of Number()
const SERVER_BOOLEAN_FIELDS = new Set([
  'server_autoRetryEnabled',
  'server_llmCacheEnabled',
]);

function coerceServerValue(fieldId: string, value: unknown): boolean | number {
  return SERVER_BOOLEAN_FIELDS.has(fieldId) ? Boolean(value) : Number(value);
}

function useGenerationSettingsStoreAdapter(): SettingStoreAdapter {
  const params = useGenerationSettingsStore((s) => s.params);
  const setParam = useGenerationSettingsStore((s) => s.setParam);

  // History store
  const historyMode = useGenerationHistoryStore((s) => s.historyMode);
  const maxHistorySize = useGenerationHistoryStore((s) => s.maxHistorySize);
  const historySortMode = useGenerationHistoryStore((s) => s.historySortMode);
  const includeOutputsInHistory = useGenerationHistoryStore((s) => s.includeOutputsInHistory);
  const hideIncompatibleAssets = useGenerationHistoryStore((s) => s.hideIncompatibleAssets);
  const autoPrefetchHistoryThumbnails = useGenerationHistoryStore(
    (s) => s.autoPrefetchHistoryThumbnails,
  );
  const usePerOperationHistoryLimits = useGenerationHistoryStore(
    (s) => s.usePerOperationHistoryLimits,
  );
  const maxHistorySizeByOperation = useGenerationHistoryStore(
    (s) => s.maxHistorySizeByOperation,
  );
  const setHistoryMode = useGenerationHistoryStore((s) => s.setHistoryMode);
  const setMaxHistorySize = useGenerationHistoryStore((s) => s.setMaxHistorySize);
  const setHistorySortMode = useGenerationHistoryStore((s) => s.setHistorySortMode);
  const setIncludeOutputsInHistory = useGenerationHistoryStore(
    (s) => s.setIncludeOutputsInHistory,
  );
  const setHideIncompatibleAssets = useGenerationHistoryStore(
    (s) => s.setHideIncompatibleAssets,
  );
  const setAutoPrefetchHistoryThumbnails = useGenerationHistoryStore(
    (s) => s.setAutoPrefetchHistoryThumbnails,
  );
  const setUsePerOperationHistoryLimits = useGenerationHistoryStore(
    (s) => s.setUsePerOperationHistoryLimits,
  );
  const setMaxHistorySizeForOperation = useGenerationHistoryStore(
    (s) => s.setMaxHistorySizeForOperation,
  );

  // Server config state (admin-only, persisted to DB)
  const [generationConfig, setGenerationConfig] = useState<GenerationServerConfig | null>(null);
  const [llmConfig, setLLMConfig] = useState<LLMServerConfig | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchGenerationServerConfig()
      .then(setGenerationConfig)
      .catch((err) => console.error('Failed to fetch generation server config:', err));
    fetchLLMServerConfig()
      .then(setLLMConfig)
      .catch((err) => console.error('Failed to fetch LLM server config:', err));
  }, []);

  return {
    get: (fieldId: string) => {
      // Server fields — generation namespace
      const genKey = GENERATION_FIELD_MAP[fieldId];
      if (genKey) return generationConfig?.[genKey];

      // Server fields — LLM namespace
      const llmKey = LLM_FIELD_MAP[fieldId];
      if (llmKey) return llmConfig?.[llmKey];

      switch (fieldId) {
        case 'autoSwitchOperationType':
          return params.autoSwitchOperationType ?? true;
        case 'autoRetryEnabled':
          return params.autoRetryEnabled ?? true;
        case 'autoRetryMaxAttempts':
          return params.autoRetryMaxAttempts ?? 20;
        case 'historyMode':
          return historyMode ?? 'per-operation';
        case 'maxHistorySize':
          return maxHistorySize ?? 20;
        case 'historySortMode':
          return historySortMode ?? 'pinned-first';
        case 'includeOutputsInHistory':
          return includeOutputsInHistory ?? true;
        case 'hideIncompatibleAssets':
          return hideIncompatibleAssets ?? false;
        case 'autoPrefetchHistoryThumbnails':
          return autoPrefetchHistoryThumbnails ?? true;
        case 'usePerOperationHistoryLimits':
          return usePerOperationHistoryLimits ?? false;
        case 'maxHistorySizeTextToImage':
          return maxHistorySizeByOperation.text_to_image ?? maxHistorySize ?? 20;
        case 'maxHistorySizeTextToVideo':
          return maxHistorySizeByOperation.text_to_video ?? maxHistorySize ?? 20;
        case 'maxHistorySizeImageToVideo':
          return maxHistorySizeByOperation.image_to_video ?? maxHistorySize ?? 20;
        case 'maxHistorySizeImageToImage':
          return maxHistorySizeByOperation.image_to_image ?? maxHistorySize ?? 20;
        case 'maxHistorySizeVideoExtend':
          return maxHistorySizeByOperation.video_extend ?? maxHistorySize ?? 20;
        case 'maxHistorySizeVideoTransition':
          return maxHistorySizeByOperation.video_transition ?? maxHistorySize ?? 20;
        case 'maxHistorySizeFusion':
          return maxHistorySizeByOperation.fusion ?? maxHistorySize ?? 20;
        default:
          return undefined;
      }
    },
    set: (fieldId: string, value: any) => {
      // Server fields — generation namespace (optimistic + PATCH)
      const genKey = GENERATION_FIELD_MAP[fieldId];
      if (genKey && generationConfig) {
        const prev = { ...generationConfig };
        const coerced = coerceServerValue(fieldId, value);
        setGenerationConfig({ ...generationConfig, [genKey]: coerced });

        updateGenerationServerConfig({ [genKey]: coerced } as Partial<GenerationServerConfig>)
          .then(setGenerationConfig)
          .catch((err) => {
            console.error('Failed to update generation config:', err);
            setGenerationConfig(prev);
          });
        return;
      }

      // Server fields — LLM namespace (optimistic + PATCH)
      const llmKey = LLM_FIELD_MAP[fieldId];
      if (llmKey && llmConfig) {
        const prev = { ...llmConfig };
        const coerced = coerceServerValue(fieldId, value);
        setLLMConfig({ ...llmConfig, [llmKey]: coerced });

        updateLLMServerConfig({ [llmKey]: coerced } as Partial<LLMServerConfig>)
          .then(setLLMConfig)
          .catch((err) => {
            console.error('Failed to update LLM config:', err);
            setLLMConfig(prev);
          });
        return;
      }

      if (fieldId === 'autoSwitchOperationType') {
        setParam('autoSwitchOperationType', Boolean(value));
      }
      if (fieldId === 'autoRetryEnabled') {
        setParam('autoRetryEnabled', Boolean(value));
      }
      if (fieldId === 'autoRetryMaxAttempts') {
        const n = Number(value);
        if (!Number.isNaN(n)) {
          setParam('autoRetryMaxAttempts', n);
        }
      }
      if (fieldId === 'historyMode') {
        setHistoryMode(value as HistoryMode);
      }
      if (fieldId === 'maxHistorySize') {
        const n = Number(value);
        if (!Number.isNaN(n)) {
          setMaxHistorySize(n);
        }
      }
      if (fieldId === 'historySortMode') {
        setHistorySortMode(value as HistorySortMode);
      }
      if (fieldId === 'includeOutputsInHistory') {
        setIncludeOutputsInHistory(Boolean(value));
      }
      if (fieldId === 'hideIncompatibleAssets') {
        setHideIncompatibleAssets(Boolean(value));
      }
      if (fieldId === 'autoPrefetchHistoryThumbnails') {
        setAutoPrefetchHistoryThumbnails(Boolean(value));
      }
      if (fieldId === 'usePerOperationHistoryLimits') {
        setUsePerOperationHistoryLimits(Boolean(value));
      }
      if (fieldId === 'maxHistorySizeTextToImage') {
        const n = Number(value);
        if (!Number.isNaN(n)) {
          setMaxHistorySizeForOperation('text_to_image', n);
        }
      }
      if (fieldId === 'maxHistorySizeTextToVideo') {
        const n = Number(value);
        if (!Number.isNaN(n)) {
          setMaxHistorySizeForOperation('text_to_video', n);
        }
      }
      if (fieldId === 'maxHistorySizeImageToVideo') {
        const n = Number(value);
        if (!Number.isNaN(n)) {
          setMaxHistorySizeForOperation('image_to_video', n);
        }
      }
      if (fieldId === 'maxHistorySizeImageToImage') {
        const n = Number(value);
        if (!Number.isNaN(n)) {
          setMaxHistorySizeForOperation('image_to_image', n);
        }
      }
      if (fieldId === 'maxHistorySizeVideoExtend') {
        const n = Number(value);
        if (!Number.isNaN(n)) {
          setMaxHistorySizeForOperation('video_extend', n);
        }
      }
      if (fieldId === 'maxHistorySizeVideoTransition') {
        const n = Number(value);
        if (!Number.isNaN(n)) {
          setMaxHistorySizeForOperation('video_transition', n);
        }
      }
      if (fieldId === 'maxHistorySizeFusion') {
        const n = Number(value);
        if (!Number.isNaN(n)) {
          setMaxHistorySizeForOperation('fusion', n);
        }
      }
    },
    getAll: () => ({
      autoSwitchOperationType: params.autoSwitchOperationType ?? true,
      autoRetryEnabled: params.autoRetryEnabled ?? true,
      autoRetryMaxAttempts: params.autoRetryMaxAttempts ?? 20,
      historyMode: historyMode ?? 'per-operation',
      maxHistorySize: maxHistorySize ?? 20,
      historySortMode: historySortMode ?? 'pinned-first',
      includeOutputsInHistory: includeOutputsInHistory ?? true,
      hideIncompatibleAssets: hideIncompatibleAssets ?? false,
      autoPrefetchHistoryThumbnails: autoPrefetchHistoryThumbnails ?? true,
      usePerOperationHistoryLimits: usePerOperationHistoryLimits ?? false,
      maxHistorySizeTextToImage: maxHistorySizeByOperation.text_to_image ?? maxHistorySize ?? 20,
      maxHistorySizeTextToVideo: maxHistorySizeByOperation.text_to_video ?? maxHistorySize ?? 20,
      maxHistorySizeImageToVideo: maxHistorySizeByOperation.image_to_video ?? maxHistorySize ?? 20,
      maxHistorySizeImageToImage: maxHistorySizeByOperation.image_to_image ?? maxHistorySize ?? 20,
      maxHistorySizeVideoExtend: maxHistorySizeByOperation.video_extend ?? maxHistorySize ?? 20,
      maxHistorySizeVideoTransition: maxHistorySizeByOperation.video_transition ?? maxHistorySize ?? 20,
      maxHistorySizeFusion: maxHistorySizeByOperation.fusion ?? maxHistorySize ?? 20,
      // Server config fields — generation
      server_rateLimitMaxRequests: generationConfig?.rate_limit_max_requests,
      server_rateLimitWindowSeconds: generationConfig?.rate_limit_window_seconds,
      server_loginRateLimitMaxRequests: generationConfig?.login_rate_limit_max_requests,
      server_loginRateLimitWindowSeconds: generationConfig?.login_rate_limit_window_seconds,
      server_autoRetryEnabled: generationConfig?.auto_retry_enabled,
      server_autoRetryMaxAttempts: generationConfig?.auto_retry_max_attempts,
      server_maxJobsPerUser: generationConfig?.max_jobs_per_user,
      server_maxAccountsPerUser: generationConfig?.max_accounts_per_user,
      // Server config fields — LLM
      server_llmCacheEnabled: llmConfig?.llm_cache_enabled,
      server_llmCacheTtl: llmConfig?.llm_cache_ttl,
      server_llmCacheFreshness: llmConfig?.llm_cache_freshness,
    }),
  };
}

export function registerGenerationSettings(): () => void {
  return settingsSchemaRegistry.register({
    categoryId: 'generation',
    category: {
      label: 'Generation',
      icon: 'dY>',
      order: 30,
    },
    groups: generationGroups,
    useStore: useGenerationSettingsStoreAdapter,
  });
}
