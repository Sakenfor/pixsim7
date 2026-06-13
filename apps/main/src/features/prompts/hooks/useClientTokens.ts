/**
 * useClientTokens — synchronous, client-side prompt tokenization.
 *
 * The STRUCTURE-layer source of truth for the editor. Runs the TS port of the
 * backend tokenizer (`@pixsim7/core.prompt` `tokenize`, parity-guarded against
 * Python — see plan prompt-variable-placeholders cp-structure-decouple) over
 * the live document. This decouples the mini-language structure layer
 * (operators + variables + facets + click-to-edit) from the heavy role-ANALYSIS
 * layer: previously every structural mark rode `cmShadowTokenLines`, which is
 * only populated when `showShadow && autoAnalyze` and lags behind typing by the
 * analyze debounce + network round-trip.
 *
 * Because the tokenizer is pure, instant, and offline, the structure layer is
 * always available (even in plain / non-shadow mode) and its offsets are always
 * in the current document frame — no freshness guard needed (the CodeMirror doc
 * equals `value`, and these offsets are over the original text, exactly like the
 * backend `tokens.lines` the operator/variable extensions already consume).
 */
import { tokenize } from '@pixsim7/core.prompt';
import { useMemo } from 'react';

import type { PromptTokenLine } from './useShadowAnalysis';

/** Tokenize `value` into structural line nodes, memoized on the text. */
export function useClientTokens(value: string): PromptTokenLine[] {
  return useMemo(() => tokenize(value).lines, [value]);
}
