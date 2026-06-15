import { Facet, type Extension, RangeSetBuilder, type Text } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';

import type { PromptTokenLine } from '../hooks/useShadowAnalysis';

import { resolveFacet, type FacetVocab } from './facetRecognition';
import { facetAxesForClass, isDefaultVariableClass, parseVariableName, splitVarCall } from './promptVariableName';
import { getVariableClassVisual } from './variableClassVisuals';

/**
 * Variable token extension — decorates uppercase `var` chain elements
 * (`ACTOR1`, `GOAL`, …) emitted by the backend tokenizer and makes them
 * clickable. Clicking surfaces a popover to save/unsave the token as a known
 * prompt variable. Mirrors `operatorEditExtension`: positions come straight
 * from the backend token lines (each chain element carries `start`/`end`),
 * the document text isn't modified by this extension, and saved-vs-unsaved is
 * a styling concern driven by the supplied name set.
 */

export interface VariableRange {
  /** Char range start in the document (tightened to the token, no whitespace). */
  from: number;
  /** Char range end (exclusive). */
  to: number;
  /** Canonical uppercase variable name at this range. */
  name: string;
  /** Whether this name is currently saved (drives styling + popover state). */
  saved: boolean;
  /** Whether the name's class is a hard-coded default (e.g. ACTOR1/2/3) — it
   *  reads as "recognised" even when not explicitly saved. */
  defaultClass: boolean;
  /** Class colour hex (from the role taxonomy), when the class has one. */
  colorHex?: string;
  /**
   * Facet sub-range — the portion after the first `_` (e.g. `HIP` in
   * `ACTOR1_HIP`) plus its recognition, set only when the class declares
   * facet axes and the token has a facet. Drives a nested mark coloured by
   * whether the facet resolves (typed) or not (unrecognised within the class).
   */
  facet?: { from: number; to: number; known: boolean };
}

export interface VariableTokenCallbacks {
  onVariableClick?: (variable: VariableRange, anchor: HTMLElement) => void;
  /** Fired when the click lands on the facet sub-region of a var token (the
   *  part after the first `_`, e.g. `TWIST` in `SCENE_TWIST`). Carries the doc
   *  span of the facet text so the host can offer related facets to swap in
   *  (replace), distinct from the variable-level save/unsave popover. */
  onFacetClick?: (
    facet: { from: number; to: number; varName: string; className: string; facet: string },
    anchor: HTMLElement,
  ) => void;
}

export interface VariableTokensConfig {
  tokenLines: PromptTokenLine[] | undefined;
  savedNames: ReadonlySet<string>;
  /** Vocab members for value-level facet recognition (`HIP` → `part:hip`).
   *  Empty/omitted = axis-level only (`POSE` still resolves; concrete values
   *  fall back to unrecognised). Threaded from `useVocabularies`. */
  facetVocab?: FacetVocab;
}

const EMPTY_CONFIG: VariableTokensConfig = {
  tokenLines: undefined,
  savedNames: new Set(),
  facetVocab: {},
};

const variableTokensFacet = Facet.define<VariableTokensConfig, VariableTokensConfig>({
  combine: (values) => values[0] ?? EMPTY_CONFIG,
});

/**
 * Minimal structural view of a document — just what range collection needs.
 * CodeMirror's `Text` satisfies it; a plain string is wrapped by
 * {@link collectVariableRangesFromString} so the DOM-span viewer can share the
 * exact same extraction logic as the CodeMirror surface.
 */
export interface TextSlice {
  readonly length: number;
  sliceString(from: number, to: number): string;
}

/** Exported for unit tests — the host uses the extension, not this directly. */
export function collectVariableRanges(config: VariableTokensConfig, doc: TextSlice): VariableRange[] {
  const { tokenLines, savedNames, facetVocab } = config;
  if (!tokenLines) return [];
  const out: VariableRange[] = [];
  const docLength = doc.length;

  for (const line of tokenLines) {
    if (line.kind !== 'chain' || !Array.isArray(line.elements)) continue;
    for (const el of line.elements) {
      if (el.kind !== 'var' || !el.text) continue;
      if (
        typeof el.start !== 'number' ||
        typeof el.end !== 'number' ||
        el.start < 0 ||
        el.end > docLength ||
        el.start >= el.end
      ) {
        continue;
      }
      // The element slot may include surrounding whitespace; tighten the range
      // to the token itself so we don't decorate adjacent spaces. For a valued
      // var `NAME(value)` decorate only NAME — the bare name is the identity
      // (save/swap/facets), the (value) stays plain text.
      const raw = doc.sliceString(el.start, el.end);
      const leading = raw.length - raw.trimStart().length;
      const { name: bareName, nameLen } = splitVarCall(raw.trim());
      const name = bareName.toUpperCase();
      if (!name) continue;
      const from = el.start + leading;
      const to = from + nameLen;
      if (from >= to || to > docLength) continue;
      // Facet sub-range: the portion after the first `_`, coloured by whether
      // it resolves against the class's facet axes. Only for facet-declaring
      // classes (matches the autocomplete gating) so prose-ish `FOO_BAR` and
      // facetless classes stay un-flagged.
      const parsed = parseVariableName(name);
      let facet: VariableRange['facet'];
      if (parsed.facets.length > 0 && facetAxesForClass(parsed.className).length > 0) {
        const us = name.indexOf('_');
        if (us > 0 && us < name.length - 1) {
          const facetFrom = from + us + 1;
          if (facetFrom < to && to <= docLength) {
            const resolved = resolveFacet(parsed.className, parsed.facets[0], facetVocab ?? {});
            facet = { from: facetFrom, to, known: resolved.known };
          }
        }
      }
      out.push({
        from,
        to,
        name,
        saved: savedNames.has(name),
        defaultClass: isDefaultVariableClass(name),
        colorHex: getVariableClassVisual(name)?.hex,
        facet,
      });
    }
  }

  out.sort((a, b) => a.from - b.from);
  return out;
}

/**
 * String-backed twin of {@link collectVariableRanges} for non-CodeMirror
 * surfaces (the inline DOM-span viewer). Keeps variable extraction identical to
 * the editor so saved/decorated tokens line up across both engines.
 */
export function collectVariableRangesFromString(
  config: VariableTokensConfig,
  text: string,
): VariableRange[] {
  return collectVariableRanges(config, {
    length: text.length,
    sliceString: (from, to) => text.slice(from, to),
  });
}

// Token styling combines two signals:
//   colour  = the variable's class hue (role taxonomy) when it has one;
//             else emerald for a plain saved var, grey for an unknown one.
//   underline = saved -> solid, default-recognised -> dotted, unknown -> dashed.
const _SAVED_HEX = 'rgba(16, 185, 129, 0.85)'; // emerald, for saved non-class vars
const _UNKNOWN_HEX = 'rgba(120, 120, 120, 0.55)';

function variableStyle(range: VariableRange): string {
  const underline = range.saved ? 'solid' : range.defaultClass ? 'dotted' : 'dashed';
  const lineColor = range.colorHex ?? (range.saved ? _SAVED_HEX : _UNKNOWN_HEX);
  const parts = [`border-bottom:1px ${underline} ${lineColor}`];
  // Tint the text only when there's a class hue or it's saved — keep unknown
  // tokens in the editor's default text colour so they read as plain prose.
  const textColor = range.colorHex ?? (range.saved ? _SAVED_HEX : undefined);
  if (textColor) parts.push(`color:${textColor}`);
  return parts.join(';');
}

const _markCache = new Map<string, Decoration>();

function markFor(range: VariableRange): Decoration {
  const style = variableStyle(range);
  let mark = _markCache.get(style);
  if (!mark) {
    mark = Decoration.mark({ attributes: { class: 'cm-prompt-var', style } });
    _markCache.set(style, mark);
  }
  return mark;
}

// Facet sub-mark — nested inside the var mark over the facet portion. Underline
// only (no background wash): the base var mark already underlines the whole
// token, so the facet sub-mark just recolours that segment's underline to type
// it — violet solid for a known (typed) facet, amber dashed for one that isn't
// recognised within the class. Avoids the highlight+underline doubling over the
// facet. Two cached marks (known/unknown).
const _facetMarkCache = new Map<boolean, Decoration>();

function facetMarkFor(known: boolean): Decoration {
  let mark = _facetMarkCache.get(known);
  if (!mark) {
    const style = known
      ? 'border-bottom:1px solid rgba(168,85,247,0.9)'
      : 'border-bottom:1px dashed rgba(217,119,6,0.9)';
    mark = Decoration.mark({
      attributes: {
        class: known ? 'cm-prompt-facet cm-prompt-facet-known' : 'cm-prompt-facet cm-prompt-facet-unknown',
        style,
      },
    });
    _facetMarkCache.set(known, mark);
  }
  return mark;
}

// Value-literal operand mark — a bare `( … )` chain operand. Faint violet wash
// (echoing the analysis-layer value tint) so an explicit value/body reads
// distinctly from incidental prose in the structure layer. Non-interactive for
// now (value editing/binding is deferred).
const valueMark = Decoration.mark({ attributes: { class: 'cm-prompt-value' } });

/** Doc ranges of `value` chain elements (bare `( … )` operands), WS-trimmed. */
function collectValueRanges(config: VariableTokensConfig, doc: Text): Array<{ from: number; to: number }> {
  const { tokenLines } = config;
  if (!tokenLines) return [];
  const out: Array<{ from: number; to: number }> = [];
  const docLength = doc.length;
  for (const line of tokenLines) {
    if (line.kind !== 'chain' || !Array.isArray(line.elements)) continue;
    for (const el of line.elements) {
      if (el.kind !== 'value') continue;
      if (typeof el.start !== 'number' || typeof el.end !== 'number' || el.start < 0 || el.end > docLength || el.start >= el.end) {
        continue;
      }
      const raw = doc.sliceString(el.start, el.end);
      const leading = raw.length - raw.trimStart().length;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const from = el.start + leading;
      const to = from + trimmed.length;
      if (from < to && to <= docLength) out.push({ from, to });
    }
  }
  return out;
}

function buildDecorations(config: VariableTokensConfig, doc: Text): DecorationSet {
  try {
    // Collect var (+ nested facet) and value marks into one list, then add them
    // sorted by position — RangeSetBuilder requires monotonic `from`.
    const entries: Array<{ from: number; to: number; deco: Decoration }> = [];
    for (const r of collectVariableRanges(config, doc)) {
      if (r.from >= r.to || r.from < 0 || r.to > doc.length) continue;
      entries.push({ from: r.from, to: r.to, deco: markFor(r) });
      if (r.facet && r.facet.from > r.from && r.facet.from < r.facet.to && r.facet.to <= doc.length) {
        entries.push({ from: r.facet.from, to: r.facet.to, deco: facetMarkFor(r.facet.known) });
      }
    }
    for (const v of collectValueRanges(config, doc)) {
      entries.push({ from: v.from, to: v.to, deco: valueMark });
    }
    if (entries.length === 0) return Decoration.none;
    entries.sort((a, b) => a.from - b.from || a.to - b.to);
    const builder = new RangeSetBuilder<Decoration>();
    for (const e of entries) builder.add(e.from, e.to, e.deco);
    return builder.finish();
  } catch (err) {
    console.warn('[variableTokenExtension] buildDecorations failed:', err);
    return Decoration.none;
  }
}

const variablePlugin = ViewPlugin.define(
  (view) => {
    let lastConfig = view.state.facet(variableTokensFacet);
    let decorations = buildDecorations(lastConfig, view.state.doc);

    return {
      get decorations() {
        return decorations;
      },
      update(update: ViewUpdate) {
        const newConfig = update.state.facet(variableTokensFacet);
        const configChanged = newConfig !== lastConfig;
        if (!update.docChanged && !configChanged) return;
        lastConfig = newConfig;
        decorations = buildDecorations(newConfig, update.state.doc);
      },
    };
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);

function variableClickHandler(callbacks: VariableTokenCallbacks) {
  return EditorView.domEventHandlers({
    click: (e, view) => {
      if (!callbacks.onVariableClick && !callbacks.onFacetClick) return false;
      if (!(e.target instanceof HTMLElement)) return false;
      // Defer to the operator/facet handler when the click lands on an operator
      // mark. The intra-token access `_` is a `.cm-prompt-op` nested inside the
      // variable span, so without this guard a click on `_` would open both the
      // facet popover (operator handler) and the variable popover at once.
      if (e.target.closest('.cm-prompt-op')) return false;
      const varEl = e.target.closest<HTMLElement>('.cm-prompt-var');
      if (!varEl) return false;

      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos === null) return false;

      const config = view.state.facet(variableTokensFacet);
      const ranges = collectVariableRanges(config, view.state.doc);
      const hit = ranges.find((r) => pos >= r.from && pos < r.to);
      if (!hit) return false;

      // Facet sub-region click → facet swap popover (replace), not the
      // variable-level save/unsave popover. The facet span is after the first
      // `_`; only route there when the class actually declares this facet
      // (hit.facet is set by collectVariableRanges under the same gating).
      if (
        hit.facet &&
        callbacks.onFacetClick &&
        pos >= hit.facet.from &&
        pos < hit.facet.to
      ) {
        const parsed = parseVariableName(hit.name);
        const facetEl = e.target.closest<HTMLElement>('.cm-prompt-facet') ?? varEl;
        callbacks.onFacetClick(
          {
            from: hit.facet.from,
            to: hit.facet.to,
            varName: hit.name,
            className: parsed.className,
            facet: parsed.facets[0] ?? '',
          },
          facetEl,
        );
        e.preventDefault();
        return true;
      }

      if (!callbacks.onVariableClick) return false;
      callbacks.onVariableClick(hit, varEl);
      e.preventDefault();
      return true;
    },
  });
}

const variableTheme = EditorView.baseTheme({
  // Layout/affordance only; the colour + underline style are applied per-token
  // as an inline style (class hue × saved/default/unknown state) by markFor().
  '.cm-prompt-var': {
    cursor: 'pointer',
    borderRadius: '2px',
    padding: '0 1px',
    transition: 'background-color 100ms ease, border-color 100ms ease',
  },
  '.cm-prompt-var:hover': {
    backgroundColor: 'rgba(168, 85, 247, 0.18)',
  },
  // Facet portion (nested) — layout/transition only; the known/unknown colour
  // is an inline style applied per-token by facetMarkFor().
  '.cm-prompt-facet': {
    borderRadius: '2px',
    transition: 'background-color 100ms ease, border-color 100ms ease',
  },
  // Value-literal operand `( … )` — faint violet wash so an explicit value/body
  // reads distinctly from incidental prose.
  '.cm-prompt-value': {
    backgroundColor: 'rgba(168, 85, 247, 0.07)',
    borderRadius: '2px',
  },
});

export function variableTokenExtension(
  config: VariableTokensConfig,
  callbacks?: VariableTokenCallbacks,
): Extension {
  const parts: Extension[] = [
    variableTokensFacet.of(config),
    variablePlugin,
    variableTheme,
  ];
  if (callbacks?.onVariableClick) {
    parts.push(variableClickHandler(callbacks));
  }
  return parts;
}
