/**
 * useShadowAnalysis Hook
 *
 * Debounced background prompt analysis for the shadow overlay in text mode.
 * Calls `/prompts/analyze` and surfaces primitive match metadata from candidates.
 * Reads/writes the shared promptAnalysisCache so blocks mode can reuse results.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { useApi } from '@/hooks/useApi';

import {
  getCachedAnalysis,
  setCachedAnalysis,
  type AnalysisResult,
} from '../lib/promptAnalysisCache';
import type { PromptBlockCandidate } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AnalyzePromptResponse {
  analysis?: {
    prompt?: string;
    candidates?: PromptBlockCandidate[];
    tags?: AnalysisResult['tags'];
  };
}

export interface ShadowAnalysisResult {
  analyzedPrompt: string;
  candidates: PromptBlockCandidate[];
}

export interface ShadowAnalysisState {
  result: ShadowAnalysisResult | null;
  loading: boolean;
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

  // Stable refs
  const apiRef = useRef(api);
  apiRef.current = api;
  const analyzerIdRef = useRef(analyzerId);
  analyzerIdRef.current = analyzerId;
  const textRef = useRef(text);
  textRef.current = text;

  const runAnalysis = useCallback(
    async (promptText: string, skipCache = false) => {
      const normalized = promptText.trim();
      if (!normalized || normalized.length < MIN_CHARS) {
        setResult(null);
        setLoading(false);
        return;
      }

      // Check cache first
      if (!skipCache) {
        const cached = getCachedAnalysis(normalized, analyzerIdRef.current);
        if (cached) {
          setResult({
            analyzedPrompt: normalized,
            candidates: cached.candidates,
          });
          setLoading(false);
          return;
        }
      }

      const requestId = ++requestIdRef.current;
      setLoading(true);

      try {
        const payload: Record<string, unknown> = { text: normalized };
        if (analyzerIdRef.current) {
          payload.analyzer_id = analyzerIdRef.current;
        }

        const response = await apiRef.current.post<AnalyzePromptResponse>(
          '/prompts/analyze',
          payload,
        );

        if (requestId !== requestIdRef.current) return; // stale

        const candidates = response?.analysis?.candidates ?? [];
        const tags = response?.analysis?.tags ?? [];

        // Write to shared cache
        setCachedAnalysis(normalized, analyzerIdRef.current, {
          prompt: response?.analysis?.prompt || normalized,
          candidates,
          tags,
        });

        setResult({
          analyzedPrompt: normalized,
          candidates,
        });
      } catch {
        // Fail silently
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [], // stable — reads from refs
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
    void runAnalysis(textRef.current, true); // skip cache on manual refresh
  }, [runAnalysis]);

  return { result, loading, refresh };
}
