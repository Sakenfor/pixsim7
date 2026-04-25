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
  type SequenceContext,
} from '../lib/promptAnalysisCache';
import type { PromptBlockCandidate } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PromptTokenRelationHop {
  lhs?: string | null;
  rhs?: string | null;
  raw: string;
  leading_char?: string | null;
  terminal_char?: string | null;
  run: number;
}

// Token-level line nodes returned by the Python tokenizer.
export interface PromptTokenLine {
  kind: 'header' | 'relation' | 'prose';
  // header fields
  pattern?: string;
  label?: string;
  body_start?: number;
  // relation fields — one or more hops, e.g. A===>B<===C → 2 hops
  hops?: PromptTokenRelationHop[];
  // shared
  start: number;
  end: number;
  text?: string;  // prose only
}

interface AnalyzePromptResponse {
  analysis?: {
    prompt?: string;
    candidates?: PromptBlockCandidate[];
    tags?: AnalysisResult['tags'];
    sequence_context?: SequenceContext;
  };
  role_in_sequence?: string;
  sequence_context?: SequenceContext;
  tokens?: { lines: PromptTokenLine[] };
}

export interface ShadowAnalysisResult {
  analyzedPrompt: string;
  candidates: PromptBlockCandidate[];
  roleInSequence: string;
  sequenceContext: SequenceContext;
  tokens?: { lines: PromptTokenLine[] };
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
const VALID_SEQUENCE_ROLES = new Set(['initial', 'continuation', 'transition', 'unspecified']);
const DEFAULT_SEQUENCE_CONTEXT: SequenceContext = {
  role_in_sequence: 'unspecified',
  source: 'none',
  confidence: null,
  matched_block_id: null,
};

function normalizeSequenceRole(raw: unknown): string {
  if (typeof raw !== 'string') return 'unspecified';
  const normalized = raw.trim().toLowerCase();
  return VALID_SEQUENCE_ROLES.has(normalized) ? normalized : 'unspecified';
}

function normalizeSequenceContext(raw: unknown): SequenceContext {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SEQUENCE_CONTEXT };
  }
  const record = raw as Record<string, unknown>;
  return {
    role_in_sequence: normalizeSequenceRole(record.role_in_sequence),
    source:
      typeof record.source === 'string' && record.source.trim()
        ? record.source.trim()
        : 'none',
    confidence: typeof record.confidence === 'number' ? record.confidence : null,
    matched_block_id:
      typeof record.matched_block_id === 'string' && record.matched_block_id.trim()
        ? record.matched_block_id.trim()
        : null,
  };
}

function resolveSequenceContext(response: AnalyzePromptResponse): SequenceContext {
  const preferred = response.sequence_context ?? response.analysis?.sequence_context;
  const normalized = normalizeSequenceContext(preferred);
  if (normalized.role_in_sequence !== 'unspecified') {
    return normalized;
  }
  const fallbackRole = normalizeSequenceRole(response.role_in_sequence);
  if (fallbackRole === 'unspecified') {
    return normalized;
  }
  return {
    ...normalized,
    role_in_sequence: fallbackRole,
    source: normalized.source === 'none' ? 'response.role_in_sequence' : normalized.source,
  };
}

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
          const sequenceContext = normalizeSequenceContext(
            cached.sequence_context ?? {
              role_in_sequence: cached.role_in_sequence,
              source: 'cache',
            },
          );
          setResult({
            analyzedPrompt: normalized,
            candidates: cached.candidates,
            roleInSequence: sequenceContext.role_in_sequence,
            sequenceContext,
            tokens: cached.tokens,
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
        const tokens = response?.tokens;
        const sequenceContext = resolveSequenceContext(response);

        // Write to shared cache
        setCachedAnalysis(normalized, analyzerIdRef.current, {
          prompt: response?.analysis?.prompt || normalized,
          candidates,
          tags,
          role_in_sequence: sequenceContext.role_in_sequence,
          sequence_context: sequenceContext,
          ...(tokens ? { tokens } : {}),
        });

        setResult({
          analyzedPrompt: normalized,
          candidates,
          roleInSequence: sequenceContext.role_in_sequence,
          sequenceContext,
          tokens,
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
