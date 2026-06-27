import type {
  PromptVariableEntry,
  PromptVariablesResponse,
  RenamePromptVariableRequest,
  UpsertPromptVariableRequest,
} from '@pixsim7/shared.api.model';
import { useCallback, useEffect, useState } from 'react';

import { useApi } from '@/hooks/useApi';

export type { PromptVariableEntry };

interface PromptVariableApiError extends Error {
  response?: {
    status?: number;
    data?: unknown;
  };
}

export interface SaveVariableOptions {
  allowExisting?: boolean;
  /** Optional one-line reuse hint. Persisted/updated when provided. */
  description?: string;
  /** Optional substitution text (phase 2). Persisted/updated when provided. */
  value?: string;
  /** Optional transform spec ('id' or 'id:arg'). Persisted/updated when provided. */
  transform?: string;
}

export interface PromptVariableMutationResult {
  ok: boolean;
  code?: 'duplicate' | 'not_found' | 'invalid' | 'forbidden' | 'unknown';
  message?: string;
  variables?: string[];
  entries?: PromptVariableEntry[];
}

let cachedEntries: PromptVariableEntry[] | null = null;
let inflightFetch: Promise<PromptVariableEntry[]> | null = null;

// Cross-instance sync: every mounted hook subscribes, so a mutation in one
// surface (e.g. the composer's Variables menu) refreshes every other consumer
// (e.g. the shadow panel's resolved preview) instead of going stale.
const entryListeners = new Set<(entries: PromptVariableEntry[]) => void>();

function publishEntries(next: PromptVariableEntry[]): void {
  cachedEntries = next;
  entryListeners.forEach((listener) => listener(next));
}

function normalizeResponseEntries(
  payload: PromptVariablesResponse | null | undefined,
): PromptVariableEntry[] {
  const raw = Array.isArray(payload?.variables) ? payload.variables : [];
  const byName = new Map<string, PromptVariableEntry>();
  for (const item of raw) {
    const name = typeof item?.name === 'string' ? item.name.trim().toUpperCase() : '';
    if (!name) continue;
    const description =
      typeof item?.description === 'string' && item.description.trim().length > 0
        ? item.description.trim()
        : undefined;
    const value =
      typeof item?.value === 'string' && item.value.trim().length > 0
        ? item.value
        : undefined;
    const transform =
      typeof item?.transform === 'string' && item.transform.trim().length > 0
        ? item.transform.trim()
        : undefined;
    byName.set(name, { name, description, value, transform });
  }
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function entryNames(entries: PromptVariableEntry[]): string[] {
  return entries.map((entry) => entry.name);
}

function parseMutationError(error: unknown): Omit<PromptVariableMutationResult, 'ok'> {
  const cast = error as PromptVariableApiError;
  const status = cast?.response?.status;
  if (status === 409) {
    return { code: 'duplicate', message: cast.message || 'Variable already exists.' };
  }
  if (status === 404) {
    return { code: 'not_found', message: cast.message || 'Variable not found.' };
  }
  if (status === 400 || status === 422) {
    return { code: 'invalid', message: cast.message || 'Invalid variable name.' };
  }
  if (status === 401 || status === 403) {
    return { code: 'forbidden', message: cast.message || 'Not allowed.' };
  }
  return { code: 'unknown', message: cast?.message || 'Failed to update variables.' };
}

async function fetchPromptVariables(
  api: ReturnType<typeof useApi>,
): Promise<PromptVariableEntry[]> {
  if (cachedEntries) return cachedEntries;
  if (inflightFetch) return inflightFetch;

  inflightFetch = api
    .get<PromptVariablesResponse>('/prompts/meta/variables')
    .then((payload) => {
      const entries = normalizeResponseEntries(payload);
      cachedEntries = entries;
      inflightFetch = null;
      return entries;
    })
    .catch(() => {
      inflightFetch = null;
      return [];
    });

  return inflightFetch;
}

export function usePromptVariables() {
  const api = useApi();
  const [entries, setEntries] = useState<PromptVariableEntry[]>(cachedEntries ?? []);
  const [loading, setLoading] = useState<boolean>(cachedEntries === null);

  // Update the shared cache and notify every mounted instance (incl. this one).
  const applyEntries = useCallback((next: PromptVariableEntry[]) => {
    publishEntries(next);
  }, []);

  // Subscribe to cross-instance updates for this hook's lifetime.
  useEffect(() => {
    entryListeners.add(setEntries);
    if (cachedEntries) setEntries(cachedEntries);
    return () => {
      entryListeners.delete(setEntries);
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await api.get<PromptVariablesResponse>('/prompts/meta/variables');
      applyEntries(normalizeResponseEntries(payload));
    } finally {
      setLoading(false);
    }
  }, [api, applyEntries]);

  useEffect(() => {
    if (cachedEntries) return;
    let active = true;
    fetchPromptVariables(api).then((next) => {
      if (!active) return;
      setEntries(next);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [api]);

  const saveVariable = useCallback(
    async (
      name: string,
      options: SaveVariableOptions = {},
    ): Promise<PromptVariableMutationResult> => {
      const normalized = name.trim().toUpperCase();
      const description = options.description?.trim() || undefined;
      const value = options.value?.trim() || undefined;
      const transform = options.transform?.trim() || undefined;
      const snapshot = cachedEntries ?? [];

      // Optimistically reflect the add / field-edit. A duplicate add (no
      // allow_existing) predicts no change, so a 409 rolls back to an identical
      // list — no flicker. On edit, only provided fields override.
      if (normalized) {
        const existing = snapshot.find((entry) => entry.name === normalized);
        if (!existing) {
          applyEntries(
            [...snapshot, { name: normalized, description, value, transform }].sort((a, b) =>
              a.name.localeCompare(b.name),
            ),
          );
        } else if (
          options.description !== undefined ||
          options.value !== undefined ||
          options.transform !== undefined
        ) {
          applyEntries(
            snapshot.map((entry) =>
              entry.name === normalized
                ? {
                    name: entry.name,
                    description:
                      options.description !== undefined ? description : entry.description,
                    value: options.value !== undefined ? value : entry.value,
                    transform: options.transform !== undefined ? transform : entry.transform,
                  }
                : entry,
            ),
          );
        }
      }

      try {
        const body: UpsertPromptVariableRequest = {
          name,
          allow_existing: options.allowExisting ?? false,
        };
        if (options.description !== undefined) {
          body.description = options.description;
        }
        if (options.value !== undefined) {
          body.value = options.value;
        }
        if (options.transform !== undefined) {
          body.transform = options.transform;
        }
        const payload = await api.post<PromptVariablesResponse>('/prompts/meta/variables', body);
        const next = normalizeResponseEntries(payload);
        applyEntries(next);
        return { ok: true, variables: entryNames(next), entries: next };
      } catch (error) {
        applyEntries(snapshot);
        return { ok: false, ...parseMutationError(error) };
      }
    },
    [api, applyEntries],
  );

  const renameVariable = useCallback(
    async (name: string, newName: string): Promise<PromptVariableMutationResult> => {
      const from = name.trim().toUpperCase();
      const to = newName.trim().toUpperCase();
      const snapshot = cachedEntries ?? [];

      // Optimistic rename, unless the target name already exists (which the
      // server rejects with 409 — leave the list untouched in that case).
      if (to && !snapshot.some((entry) => entry.name === to)) {
        applyEntries(
          snapshot
            .map((entry) =>
              entry.name === from
                ? {
                    name: to,
                    description: entry.description,
                    value: entry.value,
                    transform: entry.transform,
                  }
                : entry,
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      }

      try {
        const renameBody: RenamePromptVariableRequest = { new_name: newName };
        const payload = await api.patch<PromptVariablesResponse>(
          `/prompts/meta/variables/${encodeURIComponent(name)}`,
          renameBody,
        );
        const next = normalizeResponseEntries(payload);
        applyEntries(next);
        return { ok: true, variables: entryNames(next), entries: next };
      } catch (error) {
        applyEntries(snapshot);
        return { ok: false, ...parseMutationError(error) };
      }
    },
    [api, applyEntries],
  );

  const deleteVariable = useCallback(
    async (name: string): Promise<PromptVariableMutationResult> => {
      const target = name.trim().toUpperCase();
      const snapshot = cachedEntries ?? [];

      applyEntries(snapshot.filter((entry) => entry.name !== target));

      try {
        const payload = await api.delete<PromptVariablesResponse>(
          `/prompts/meta/variables/${encodeURIComponent(name)}`,
        );
        const next = normalizeResponseEntries(payload);
        applyEntries(next);
        return { ok: true, variables: entryNames(next), entries: next };
      } catch (error) {
        applyEntries(snapshot);
        return { ok: false, ...parseMutationError(error) };
      }
    },
    [api, applyEntries],
  );

  return {
    /** Variable names only — for set membership / detection comparisons. */
    variables: entries.map((entry) => entry.name),
    /** Full entries with optional descriptions. */
    entries,
    loading,
    refresh,
    saveVariable,
    renameVariable,
    deleteVariable,
  };
}
