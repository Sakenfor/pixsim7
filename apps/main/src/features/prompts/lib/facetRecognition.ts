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

/**
 * The complete set of inputs that drive facet recognition — vocab members plus
 * user-registered class-wide facets. Bundled so every surface supplies the whole
 * set as one unit (see `useFacetRecognition`) instead of threading each input
 * separately and risking silent under-supply (the bug this fixed: viewers that
 * passed neither, so registered/vocab facets read as unknown there). Required on
 * `VariableTokensConfig`, so a surface that forgets it is a compile error.
 */
export interface FacetRecognition {
  facetVocab: FacetVocab;
  savedFacets?: ReadonlySet<string>;
}

/** Empty recognition (no vocab, no registered facets) — for surfaces that
 *  genuinely want axis-only recognition. A stable ref for memo dependencies. */
export const EMPTY_FACET_RECOGNITION: FacetRecognition = {
  facetVocab: {},
  savedFacets: new Set(),
};

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
  /** Set when recognition came from a user-registered class-wide facet (neither
   *  an axis nor a vocab value) — see `facetKey` / the prompt facet registry. */
  saved?: boolean;
}

/** Canonical key for a user-registered class-wide facet, e.g. `ACTOR:METHODS`.
 *  Both parts uppercased; matches the backend facet registry shape. */
export function facetKey(className: string, facet: string): string {
  return `${className.trim().toUpperCase()}:${facet.trim().toUpperCase()}`;
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
export function resolveFacet(
  className: string,
  facet: string,
  vocab: FacetVocab,
  savedFacets?: ReadonlySet<string>,
): ResolvedFacet {
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
  // User-registered class-wide facet — recognised even though it's neither a
  // declared axis nor a vocab value.
  if (savedFacets?.has(facetKey(className, base.facet))) {
    return { facet: base.facet, known: true, saved: true };
  }
  return { facet: base.facet, known: false };
}

/** Resolve the leading facet of a full variable name (e.g. `ACTOR1_HIP`). Null when facetless. */
export function resolveVariableFacet(
  name: string,
  vocab: FacetVocab,
  savedFacets?: ReadonlySet<string>,
): ResolvedFacet | null {
  const parsed = parseVariableName(name);
  if (parsed.facets.length === 0) return null;
  return resolveFacet(parsed.className, parsed.facets[0], vocab, savedFacets);
}

export interface FacetSuggestion {
  /** Token to insert after `ENTITY_`, uppercased (e.g. `POSE`, `HIP`, `UPPER_BODY`). */
  value: string;
  /** Human label for the suggestion list. */
  label: string;
  /** Source hint — the vocab category / `freeform` for axes, the axis name for
   *  values, `registered` for user-registered class-wide facets. */
  detail: string;
  kind: 'axis' | 'value' | 'saved';
}

/**
 * Facets "related" to an already-resolved one — i.e. swap candidates. When the
 * facet resolved to a known axis, returns that axis's siblings (the axis token
 * itself + the concrete vocab values of that axis), so clicking `SCENE_TWIST`
 * offers other values of TWIST's axis to replace it with. Falls back to the full
 * class facet set when the facet is unrecognised (no axis to scope siblings to).
 */
export function relatedFacets(
  className: string,
  resolved: ResolvedFacet,
  vocab: FacetVocab,
  savedFacets?: ReadonlySet<string>,
): FacetSuggestion[] {
  const all = suggestFacets(className, '', vocab, savedFacets);
  const axisName = resolved.known ? resolved.axis?.name : undefined;
  if (!axisName) return all;
  const siblings = all.filter(
    (s) =>
      (s.kind === 'value' && s.detail === axisName) ||
      (s.kind === 'axis' && s.value === axisName.toUpperCase()),
  );
  return siblings.length > 0 ? siblings : all;
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
  savedFacets?: ReadonlySet<string>,
): FacetSuggestion[] {
  const p = norm(partial);
  const matches = (s: string): boolean => norm(s).startsWith(p);
  const axes = facetAxesForClass(className);

  const out: FacetSuggestion[] = [];
  const seen = new Set<string>();
  const push = (value: string, label: string, detail: string, kind: FacetSuggestion['kind']): void => {
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
  // User-registered class-wide facets (keys `CLASS:FACET`).
  if (savedFacets) {
    const prefix = `${className.trim().toUpperCase()}:`;
    for (const key of savedFacets) {
      if (!key.startsWith(prefix)) continue;
      const token = key.slice(prefix.length);
      if (!p || matches(token)) push(token, token, 'registered', 'saved');
    }
  }
  return out;
}
