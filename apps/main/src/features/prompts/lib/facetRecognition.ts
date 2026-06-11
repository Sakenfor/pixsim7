/**
 * facetRecognition — value-level facet resolution + suggestions.
 *
 * Layered on top of the axis-level `classifyFacet` (promptVariableName.ts): given
 * the vocab members fetched via `useVocabularies`, resolve a concrete facet token
 * (e.g. `HIP`) to a real vocab member of one of the class's vocab-backed axes, and
 * produce autocomplete suggestions for `ENTITY_`.
 *
 * Pure — vocab data is passed in, never imported (keeps this free of React/api so
 * it stays unit-testable and reusable). The vocab map is keyed by vocab-type, the
 * same shape `useVocabularies` returns; only `{id,label,keywords}` is read here.
 */
import {
  type FacetAxis,
  classifyFacet,
  facetAxesForClass,
  parseVariableName,
} from './promptVariableName';

/** Minimal vocab-member shape (structurally satisfied by useVocabularies' VocabItem). */
export interface FacetVocabItem {
  id: string;
  label: string;
  keywords?: string[];
}

/** Vocab members keyed by vocab-type (e.g. `parts`, `poses`). */
export type FacetVocab = Record<string, FacetVocabItem[]>;

export interface ResolvedFacet {
  /** The facet token, uppercased. */
  facet: string;
  /** Recognised — either a known axis name or a concrete vocab value. */
  known: boolean;
  /** The axis this token belongs to (the matched axis name, or the axis whose
   *  vocab the value came from). */
  axis?: FacetAxis;
  /** Set when the token resolved to a concrete vocab member (value-level). */
  valueId?: string;
  valueLabel?: string;
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_]+/g, '_');
}

function idSuffix(id: string): string {
  const i = id.indexOf(':');
  return i === -1 ? id : id.slice(i + 1);
}

function vocabCategory(axis: FacetAxis): string | null {
  return axis.source.kind === 'vocab' ? axis.source.category : null;
}

function itemMatchesExact(item: FacetVocabItem, token: string): boolean {
  const t = norm(token);
  if (!t) return false;
  if (norm(idSuffix(item.id)) === t) return true;
  if (norm(item.label) === t) return true;
  return (item.keywords ?? []).some((k) => norm(k) === t);
}

/**
 * Resolve a facet token against a class. First tries axis-level recognition
 * (`POSE` is a known ACTOR axis); failing that, treats the token as a concrete
 * value and looks it up in each vocab-backed axis's members (`HIP` → part:hip).
 * Returns `known:false` when neither matches.
 */
export function resolveFacet(className: string, facet: string, vocab: FacetVocab): ResolvedFacet {
  const base = classifyFacet(className, facet);
  if (base.known) {
    return { facet: base.facet, known: true, axis: base.axis };
  }
  for (const axis of facetAxesForClass(className)) {
    const category = vocabCategory(axis);
    if (!category) continue;
    const hit = (vocab[category] ?? []).find((item) => itemMatchesExact(item, base.facet));
    if (hit) {
      return { facet: base.facet, known: true, axis, valueId: hit.id, valueLabel: hit.label };
    }
  }
  return { facet: base.facet, known: false };
}

/** Resolve the leading facet of a full variable name (e.g. `ACTOR1_HIP`). Null when facetless. */
export function resolveVariableFacet(name: string, vocab: FacetVocab): ResolvedFacet | null {
  const parsed = parseVariableName(name);
  if (parsed.facets.length === 0) return null;
  return resolveFacet(parsed.className, parsed.facets[0], vocab);
}

export interface FacetSuggestion {
  /** Token to insert after `ENTITY_`, uppercased (e.g. `POSE`, `HIP`, `UPPER_BODY`). */
  value: string;
  /** Human label for the suggestion list. */
  label: string;
  /** Source hint — the vocab category / `freeform` for axes, the axis name for values. */
  detail: string;
  kind: 'axis' | 'value';
}

/**
 * Suggest facets for a class given the partial token already typed after the
 * entity underscore. Axis names rank first, then concrete vocab values from the
 * class's vocab-backed axes. Prefix-matched (case/underscore-insensitive) against
 * the token, label, and keywords; an empty partial returns everything.
 */
export function suggestFacets(
  className: string,
  partial: string,
  vocab: FacetVocab,
): FacetSuggestion[] {
  const p = norm(partial);
  const matches = (s: string): boolean => norm(s).startsWith(p);
  const axes = facetAxesForClass(className);

  const out: FacetSuggestion[] = [];
  const seen = new Set<string>();
  const push = (value: string, label: string, detail: string, kind: 'axis' | 'value'): void => {
    const v = value.toUpperCase();
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push({ value: v, label, detail, kind });
  };

  // Axis names first.
  for (const axis of axes) {
    if (!p || matches(axis.name)) {
      push(axis.name, axis.label ?? axis.name, vocabCategory(axis) ?? 'freeform', 'axis');
    }
  }
  // Concrete vocab values from vocab-backed axes.
  for (const axis of axes) {
    const category = vocabCategory(axis);
    if (!category) continue;
    for (const item of vocab[category] ?? []) {
      const token = idSuffix(item.id);
      if (!p || matches(token) || matches(item.label) || (item.keywords ?? []).some(matches)) {
        push(token, item.label, axis.name, 'value');
      }
    }
  }
  return out;
}
