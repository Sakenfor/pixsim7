/**
 * usePromptModerationStats — debounced fetch of a prompt's render-moderation
 * track record (pass rate vs fast-filtered) for the prompt-box chip.
 *
 * Sends the current prompt (+ selected input image) to the backend, which
 * matches past generations and returns pass/filtered counts for prompt+image
 * and prompt-only, plus the current consecutive-fail streak vs the auto-retry
 * cap.
 *
 * Refresh is throttled + imperative: we subscribe to the generations store with
 * store.subscribe (NOT a render-time selector) and bump a tick at most every
 * few seconds. A render-time selector here re-rendered the whole prompt panel
 * on every gen update and froze QuickGen during queue bursts.
 */
import { useEffect, useRef, useState } from 'react';

import { pixsimClient } from '@lib/api';

import { useGenerationsStore } from '../stores/generationsStore';

export interface PromptOutcomeStats {
  passed: number;
  filtered: number;
  rate: number | null; // passed / (passed + filtered)
}

export interface PromptModerationStats {
  prompt_only: PromptOutcomeStats;
  prompt_image: PromptOutcomeStats | null;
  streak: number; // consecutive filtered for the current prompt(+image)
  cap: number; // auto-retry stops at this streak (for this operation)
  defer_seconds: number; // backoff before the next auto-retry (for this operation)
}

const ENDPOINT = '/generations/prompt-stats';
const DEBOUNCE_MS = 600;
const REFRESH_THROTTLE_MS = 4000;

export function usePromptModerationStats(
  prompt: string,
  imageAssetId: number | null,
  operationType?: string | null,
): PromptModerationStats | null {
  const [stats, setStats] = useState<PromptModerationStats | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reqId = useRef(0);
  const [refreshTick, setRefreshTick] = useState(0);

  // Throttled refresh on generation activity. Imperative subscribe → no
  // per-update work during render, and at most one tick per throttle window,
  // so a burst of queued/finalizing gens can't thrash the prompt box.
  useEffect(() => {
    let last = 0;
    return useGenerationsStore.subscribe(() => {
      const now = Date.now();
      if (now - last >= REFRESH_THROTTLE_MS) {
        last = now;
        setRefreshTick((t) => (t + 1) % 1_000_000);
      }
    });
  }, []);

  useEffect(() => {
    const trimmed = (prompt || '').trim();
    clearTimeout(timer.current);
    if (!trimmed) {
      setStats(null);
      return;
    }
    const id = ++reqId.current;
    timer.current = setTimeout(() => {
      pixsimClient
        .post<PromptModerationStats>(ENDPOINT, {
          prompt: trimmed,
          image_asset_id: imageAssetId ?? null,
          operation_type: operationType ?? null,
        })
        .then((res) => {
          if (reqId.current === id) setStats(res);
        })
        .catch(() => {
          if (reqId.current === id) setStats(null);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
  }, [prompt, imageAssetId, operationType, refreshTick]);

  return stats;
}
