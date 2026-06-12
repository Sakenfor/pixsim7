/**
 * facetTrigger — pure detection of the `ENTITY_<partial>` facet-autocomplete
 * trigger. Lives in `lib/` (no React) so it's unit-testable and reusable; the
 * `useCmFacetInput` hook wires it to the editor's update stream.
 */
import { facetAxesForClass, parseVariableName } from './promptVariableName';

/** Matches a trailing `ENTITY_partial` at the caret. Entity is an uppercase
 *  identifier (digits allowed, e.g. `ACTOR1`); partial is the facet text typed
 *  after the first `_` (uppercase/digits/underscore, possibly empty). */
export const FACET_TRIGGER = /([A-Z][A-Z0-9]*)_([A-Z0-9_]*)$/;

/** Window cap when slicing the doc before the caret — entity + `_` + partial is
 *  short, so 64 chars is ample headroom. */
export const FACET_TRIGGER_WINDOW = 64;

export interface CmFacetTrigger {
  /** Entity class the facets are drawn from (e.g. `ACTOR`). */
  className: string;
  /** Facet text typed after the `_` (uppercased; '' right after the `_`). */
  partial: string;
}

export interface CmFacetTriggerHit extends CmFacetTrigger {
  /** Offset of the partial's first char within `textUpToCursor` (after the `_`). */
  partialStart: number;
}

/**
 * Given the text immediately before the caret, return the facet trigger when it
 * ends in `ENTITY_<partial>` for a facet-declaring class and the entity sits at
 * a word boundary; else null.
 */
export function matchFacetTrigger(textUpToCursor: string): CmFacetTriggerHit | null {
  const m = FACET_TRIGGER.exec(textUpToCursor);
  if (!m) return null;
  const matchStart = m.index;
  // Entity must start at a boundary (start, whitespace, or an operator) — not
  // glued to a preceding word char.
  if (matchStart !== 0 && /[A-Za-z0-9_]/.test(textUpToCursor[matchStart - 1])) return null;
  const entity = m[1];
  const partial = m[2];
  const className = parseVariableName(entity).className;
  // Only recognised, facet-declaring classes arm the trigger.
  if (facetAxesForClass(className).length === 0) return null;
  return { className, partial, partialStart: matchStart + entity.length + 1 };
}
