import { useCallback, useEffect, useState } from 'react';

import { useApi } from '@/hooks/useApi';

/**
 * usePromptProjection — read/set the owner's structured-prompt projection mode
 * (backend user-pref, GET/PUT /prompts/meta/projection). Opt-in; default `off`.
 * When `rule_template`/`llm`, the generation path compiles the chain
 * mini-language into prose before variable substitution.
 *
 * Cross-instance synced (like usePromptVariables) so any toggle updates every
 * mounted consumer.
 */
export type ProjectionMode = 'off' | 'rule_template' | 'llm';

interface ProjectionResponse {
  mode?: string;
}

function normalizeMode(raw: unknown): ProjectionMode {
  return raw === 'rule_template' || raw === 'llm' ? raw : 'off';
}

let cachedMode: ProjectionMode | null = null;
let inflight: Promise<ProjectionMode> | null = null;
const listeners = new Set<(mode: ProjectionMode) => void>();

function publish(mode: ProjectionMode): void {
  cachedMode = mode;
  listeners.forEach((listener) => listener(mode));
}

async function fetchMode(api: ReturnType<typeof useApi>): Promise<ProjectionMode> {
  if (cachedMode !== null) return cachedMode;
  if (inflight) return inflight;
  inflight = api
    .get<ProjectionResponse>('/prompts/meta/projection')
    .then((payload) => {
      const mode = normalizeMode(payload?.mode);
      cachedMode = mode;
      inflight = null;
      return mode;
    })
    .catch(() => {
      inflight = null;
      return 'off' as ProjectionMode;
    });
  return inflight;
}

export function usePromptProjection() {
  const api = useApi();
  const [mode, setMode] = useState<ProjectionMode>(cachedMode ?? 'off');
  const [loading, setLoading] = useState<boolean>(cachedMode === null);

  useEffect(() => {
    listeners.add(setMode);
    if (cachedMode !== null) setMode(cachedMode);
    return () => {
      listeners.delete(setMode);
    };
  }, []);

  useEffect(() => {
    if (cachedMode !== null) return;
    let active = true;
    fetchMode(api).then((next) => {
      if (!active) return;
      setMode(next);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [api]);

  const setProjectionMode = useCallback(
    async (next: ProjectionMode) => {
      const prev = cachedMode ?? 'off';
      publish(next); // optimistic
      try {
        const payload = await api.put<ProjectionResponse>('/prompts/meta/projection', { mode: next });
        publish(normalizeMode(payload?.mode));
      } catch {
        publish(prev);
      }
    },
    [api],
  );

  return { mode, loading, setProjectionMode };
}
