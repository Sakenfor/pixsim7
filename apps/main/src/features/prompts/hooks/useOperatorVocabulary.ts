/**
 * Fetches the operator vocabulary (global swap_targets + max_run_length,
 * plus per-line_kind `contexts` overrides) from
 * `/api/v1/prompts/meta/operator-vocabulary`. Cached at module level —
 * the data is static during a session, so we only fetch once. Use
 * `resolveOperatorContract` to get the effective contract for a line kind.
 *
 * Backend authority: `grammar_rules.json` is the source of truth. The
 * frontend popover reads this hook's result instead of duplicating
 * those values.
 */
import type { OperatorVocabularyResponse } from '@pixsim7/shared.api.model';
import { useEffect, useState } from 'react';

import { useApi } from '@/hooks/useApi';

/** Line kinds the popover reports — matches OperatorRange.context. */
export type OperatorContextKind = 'chain' | 'colon' | 'angle_bracket' | 'freestanding';

/** Per-line_kind override of the global vocabulary (omitted fields inherit). */
export interface OperatorContext {
  lineKind: OperatorContextKind;
  swapTargets?: string[];
  maxRunLength?: number;
}

export interface OperatorVocabulary {
  swapTargets: string[];
  maxRunLength: number;
  contexts: OperatorContext[];
}

const FALLBACK: OperatorVocabulary = {
  swapTargets: ['=', '<', '>', ':', '?'],
  maxRunLength: 12,
  contexts: [],
};

/**
 * Resolve the effective operator contract for a given line kind: the global
 * default, narrowed by any matching per-context override. The op_signature
 * analog for the operator layer — `swapTargets` scopes the suggested swaps,
 * `maxRunLength` caps the run-length stepper for that context.
 */
export function resolveOperatorContract(
  vocab: OperatorVocabulary,
  lineKind: OperatorContextKind | undefined,
): { swapTargets: string[]; maxRunLength: number } {
  const ctx = lineKind ? vocab.contexts.find((c) => c.lineKind === lineKind) : undefined;
  return {
    swapTargets: ctx?.swapTargets ?? vocab.swapTargets,
    maxRunLength: ctx?.maxRunLength ?? vocab.maxRunLength,
  };
}

let cached: OperatorVocabulary | null = null;
let inflight: Promise<OperatorVocabulary> | null = null;

async function fetchOperatorVocabulary(api: ReturnType<typeof useApi>): Promise<OperatorVocabulary> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = api
    .get<OperatorVocabularyResponse>('/prompts/meta/operator-vocabulary')
    .then((data) => {
      const result: OperatorVocabulary = {
        swapTargets: Array.isArray(data?.swap_targets) ? data.swap_targets : FALLBACK.swapTargets,
        maxRunLength: typeof data?.max_run_length === 'number' ? data.max_run_length : FALLBACK.maxRunLength,
        contexts: Array.isArray(data?.contexts)
          ? data.contexts.map((c) => ({
              lineKind: c.line_kind as OperatorContextKind,
              swapTargets: Array.isArray(c.swap_targets) ? c.swap_targets : undefined,
              maxRunLength: typeof c.max_run_length === 'number' ? c.max_run_length : undefined,
            }))
          : [],
      };
      cached = result;
      inflight = null;
      return result;
    })
    .catch(() => {
      inflight = null;
      return FALLBACK;
    });

  return inflight;
}

export function useOperatorVocabulary(): OperatorVocabulary {
  const api = useApi();
  const [vocab, setVocab] = useState<OperatorVocabulary>(cached ?? FALLBACK);

  useEffect(() => {
    if (cached) return;
    let active = true;
    fetchOperatorVocabulary(api).then((v) => {
      if (active) setVocab(v);
    });
    return () => {
      active = false;
    };
  }, [api]);

  return vocab;
}
