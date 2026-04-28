/**
 * Fetches the operator vocabulary (swap_targets + max_run_length) from
 * `/api/v1/prompts/meta/operator-vocabulary`. Cached at module level —
 * the data is static during a session, so we only fetch once.
 *
 * Backend authority: `grammar_rules.json` is the source of truth. The
 * frontend popover reads this hook's result instead of duplicating
 * those values.
 */
import { useEffect, useState } from 'react';

import { useApi } from '@/hooks/useApi';

export interface OperatorVocabulary {
  swapTargets: string[];
  maxRunLength: number;
}

interface OperatorVocabularyResponse {
  swap_targets: string[];
  max_run_length: number;
}

const FALLBACK: OperatorVocabulary = {
  swapTargets: ['=', '<', '>', ':', '?'],
  maxRunLength: 12,
};

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
