/**
 * useResolvedPreview — backend-sourced resolved prompt preview.
 *
 * Mirrors the outbound generation pipeline (inline-collapse → project → resolve)
 * via the pure `POST /prompts/resolve-preview` endpoint, so the composer can show
 * what generation will actually send. Replaces the former in-browser mirrors
 * (inlineVarValues + projectStructuredPrompt + resolvePromptVariables); the
 * authoritative Python services are now the single source of truth.
 *
 * Variable values/transforms come from the caller's already-loaded saved
 * registry, so the endpoint stays stateless. Debounced + cached by the full
 * input; returns `null` while a fetch is in flight and when resolution is a
 * no-op (the resolved text equals the input).
 */
import type { ResolvePreviewRequest, ResolvePreviewResponse } from '@pixsim7/shared.api.model';
import { useEffect, useState } from 'react';

import { useApi } from '@/hooks/useApi';

export interface ResolvePreviewEntry {
  name: string;
  value?: string;
  transform?: string;
}

const DEBOUNCE_MS = 120;
const MAX_CACHE = 100;

const cache = new Map<string, string | null>();

function setCache(key: string, resolved: string | null): void {
  cache.set(key, resolved);
  if (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

function buildMaps(entries: ReadonlyArray<ResolvePreviewEntry>): {
  values: Record<string, string>;
  transforms: Record<string, string>;
} {
  const values: Record<string, string> = {};
  const transforms: Record<string, string> = {};
  for (const entry of entries) {
    const name = entry.name?.trim().toUpperCase();
    if (!name) continue;
    if (typeof entry.value === 'string' && entry.value) values[name] = entry.value;
    if (typeof entry.transform === 'string' && entry.transform) transforms[name] = entry.transform;
  }
  return { values, transforms };
}

export function useResolvedPreview(params: {
  text: string;
  project: boolean;
  entries: ReadonlyArray<ResolvePreviewEntry>;
}): string | null {
  const api = useApi();
  const { text, project } = params;
  const { values, transforms } = buildMaps(params.entries);
  // Cache + dedupe key encodes every input that affects the result.
  const key = JSON.stringify([text, project, values, transforms]);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!text || cache.has(key)) return;
    let cancelled = false;
    const body: ResolvePreviewRequest = { text, project, values, transforms };
    const handle = setTimeout(() => {
      api
        .post<ResolvePreviewResponse>('/prompts/resolve-preview', body)
        .then((res) => {
          if (cancelled) return;
          setCache(key, res?.resolved ?? null);
          tick((n) => n + 1);
        })
        .catch(() => {
          if (cancelled) return;
          setCache(key, null);
          tick((n) => n + 1);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // values/transforms are captured via `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, key, text, project]);

  if (!text) return null;
  return cache.get(key) ?? null;
}
