/**
 * useShadowAnalysis Hook
 *
 * Debounced background prompt analysis for the shadow overlay in text mode.
 * Calls `/prompts/analyze` and surfaces primitive match metadata from candidates.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { useApi } from '@/hooks/useApi';

import type { PromptBlockCandidate } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AnalyzePromptResponse {
  analysis?: {
    prompt?: string;
    candidates?: PromptBlockCandidate[];
  };
}

export interface ShadowAnalysisResult {
  /** The prompt text that was analyzed */
  analyzedPrompt: string;
  /** Parsed candidates (may include position data + metadata.primitive_match) */
  candidates: PromptBlockCandidate[];
}

export interface ShadowAnalysisState {
  /** Latest analysis result (null before first successful analysis) */
  result: ShadowAnalysisResult | null;
  /** Whether an analysis request is in-flight */
  loading: boolean;
  /** Force immediate re-analysis */
  refresh: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 600;
const MIN_CHARS = 8;

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useShadowAnalysis(
  text: string,
  options: {
    enabled?: boolean;
    analyzerId?: string;
  } = {},
): ShadowAnalysisState {
  const { enabled = true, analyzerId } = options;
  const api = useApi();

  const [result, setResult] = useState<ShadowAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const requestIdRef = useRef(0);

  const runAnalysis = useCallback(
    async (promptText: string) => {
      const normalized = promptText.trim();
      if (!normalized || normalized.length < MIN_CHARS) {
        setResult(null);
        setLoading(false);
        return;
      }

      const requestId = ++requestIdRef.current;
      setLoading(true);

      try {
        const payload: Record<string, unknown> = { text: normalized };
        if (analyzerId) {
          payload.analyzer_id = analyzerId;
        }

        const response = await api.post<AnalyzePromptResponse>(
          '/prompts/analyze',
          payload,
        );

        if (requestId !== requestIdRef.current) return; // stale

        const candidates = response?.analysis?.candidates ?? [];
        setResult({
          analyzedPrompt: normalized,
          candidates,
        });
      } catch {
        // Fail silently — no hard error UI for background analysis
        if (requestId === requestIdRef.current) {
          // Keep previous result on error
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [api, analyzerId],
  );

  // Debounced analysis on text changes
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const normalized = text.trim();
    if (!normalized || normalized.length < MIN_CHARS) {
      setResult(null);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void runAnalysis(text);
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [text, enabled, runAnalysis, refreshToken]);

  const refresh = useCallback(() => {
    setRefreshToken((prev) => prev + 1);
    void runAnalysis(text);
  }, [runAnalysis, text]);

  return { result, loading, refresh };
}
