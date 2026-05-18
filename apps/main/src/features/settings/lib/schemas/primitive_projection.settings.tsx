 
/**
 * Primitive-Projection Settings Schema (admin, server-persisted)
 *
 * Surfaces the backend `primitive_projection` SettingsBase namespace
 * (LLM-fallback tuning for weak/missing token-overlap matches) as an admin
 * group, mirroring the "LLM Cache" server-config group in generation.settings.
 * Backed by GET/PATCH /admin/primitive-projection/config.
 */
import { useEffect, useRef, useState } from 'react';

import { pixsimClient } from '@lib/api';

import { settingsSchemaRegistry, type SettingGroup, type SettingStoreAdapter } from '../core';

interface PrimitiveProjectionServerConfig {
  llm_fallback_enabled: boolean;
  llm_fallback_max_candidates: number;
  llm_fallback_timeout_ms: number;
  llm_fallback_catalog_cap: number;
  llm_fallback_min_confidence: number;
}

async function fetchPrimitiveProjectionServerConfig(): Promise<PrimitiveProjectionServerConfig> {
  return pixsimClient.get<PrimitiveProjectionServerConfig>(
    '/admin/primitive-projection/config',
  );
}

async function updatePrimitiveProjectionServerConfig(
  patch: Partial<PrimitiveProjectionServerConfig>,
): Promise<PrimitiveProjectionServerConfig> {
  return pixsimClient.patch<PrimitiveProjectionServerConfig>(
    '/admin/primitive-projection/config',
    patch,
  );
}

const adminOnly = (values: Record<string, any>) => !!values.__isAdmin;
const fallbackEnabled = (values: Record<string, any>) =>
  !!values.__isAdmin && values.server_ppLlmFallbackEnabled === true;

const primitiveProjectionGroups: SettingGroup[] = [
  {
    id: 'server-primitive-projection',
    title: 'Prompt Projection — LLM Fallback',
    description:
      'Optional LLM semantic fallback for prompt candidates the token-overlap '
      + 'matcher leaves weak (no_signal / below_threshold / ambiguous). Off by '
      + 'default — a pure no-op until enabled. Changes are persisted to the database.',
    showWhen: adminOnly,
    adminGroup: true,
    fields: [
      {
        id: 'server_ppLlmFallbackEnabled',
        type: 'toggle',
        label: 'Enable LLM Fallback',
        description:
          'Re-project weak/missing matches via a single batched LLM call. '
          + 'Graceful: any error/timeout keeps the token-overlap result.',
        defaultValue: false,
      },
      {
        id: 'server_ppLlmFallbackMaxCandidates',
        type: 'number',
        label: 'Max Candidates / Request',
        description: 'Cap on weak candidates forwarded to the batched LLM call (latency/cost guard).',
        min: 1,
        max: 24,
        step: 1,
        defaultValue: 6,
        showWhen: fallbackEnabled,
      },
      {
        id: 'server_ppLlmFallbackTimeoutMs',
        type: 'number',
        label: 'Timeout (ms)',
        description: 'Hard time budget; on timeout the token-overlap result is kept.',
        min: 250,
        max: 30000,
        step: 250,
        defaultValue: 4000,
        showWhen: fallbackEnabled,
      },
      {
        id: 'server_ppLlmFallbackCatalogCap',
        type: 'number',
        label: 'Catalog Cap',
        description: 'Max primitive-catalog entries serialized into the LLM prompt (token-cost bound).',
        min: 20,
        max: 600,
        step: 20,
        defaultValue: 160,
        showWhen: fallbackEnabled,
      },
      {
        id: 'server_ppLlmFallbackMinConfidence',
        type: 'number',
        label: 'Min Confidence',
        description: 'Minimum LLM-reported confidence to accept a semantic match (0.0–1.0).',
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.55,
        showWhen: fallbackEnabled,
      },
    ],
  },
];

const PP_FIELD_MAP: Record<string, keyof PrimitiveProjectionServerConfig> = {
  server_ppLlmFallbackEnabled: 'llm_fallback_enabled',
  server_ppLlmFallbackMaxCandidates: 'llm_fallback_max_candidates',
  server_ppLlmFallbackTimeoutMs: 'llm_fallback_timeout_ms',
  server_ppLlmFallbackCatalogCap: 'llm_fallback_catalog_cap',
  server_ppLlmFallbackMinConfidence: 'llm_fallback_min_confidence',
};

const PP_BOOLEAN_FIELDS = new Set(['server_ppLlmFallbackEnabled']);

function coercePpValue(fieldId: string, value: unknown): boolean | number {
  return PP_BOOLEAN_FIELDS.has(fieldId) ? Boolean(value) : Number(value);
}

function usePrimitiveProjectionSettingsStoreAdapter(): SettingStoreAdapter {
  const [config, setConfig] = useState<PrimitiveProjectionServerConfig | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchPrimitiveProjectionServerConfig()
      .then(setConfig)
      .catch((err) => {
        console.error('Failed to fetch primitive-projection config:', err);
      });
  }, []);

  return {
    get: (fieldId: string) => {
      const key = PP_FIELD_MAP[fieldId];
      return key ? config?.[key] : undefined;
    },
    set: (fieldId: string, value: unknown) => {
      const key = PP_FIELD_MAP[fieldId];
      if (!key || !config) return;
      const prev = { ...config };
      const coerced = coercePpValue(fieldId, value);
      setConfig({ ...config, [key]: coerced });
      updatePrimitiveProjectionServerConfig(
        { [key]: coerced } as Partial<PrimitiveProjectionServerConfig>,
      )
        .then(setConfig)
        .catch((err) => {
          console.error('Failed to update primitive-projection config:', err);
          setConfig(prev);
        });
    },
    getAll: () => ({
      server_ppLlmFallbackEnabled: config?.llm_fallback_enabled,
      server_ppLlmFallbackMaxCandidates: config?.llm_fallback_max_candidates,
      server_ppLlmFallbackTimeoutMs: config?.llm_fallback_timeout_ms,
      server_ppLlmFallbackCatalogCap: config?.llm_fallback_catalog_cap,
      server_ppLlmFallbackMinConfidence: config?.llm_fallback_min_confidence,
    }),
  };
}

export function registerPrimitiveProjectionSettings(): () => void {
  return settingsSchemaRegistry.register({
    categoryId: 'generation',
    groups: primitiveProjectionGroups,
    useStore: usePrimitiveProjectionSettingsStoreAdapter,
  });
}
