import { Facet, type Extension, RangeSetBuilder, type Text } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';

import type { PromptTokenLine } from '../hooks/useShadowAnalysis';

import { isDefaultVariableClass } from './promptVariableName';

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
}

export interface VariableTokenCallbacks {
  onVariableClick?: (variable: VariableRange, anchor: HTMLElement) => void;
}

export interface VariableTokensConfig {
  tokenLines: PromptTokenLine[] | undefined;
  savedNames: ReadonlySet<string>;
}

const EMPTY_CONFIG: VariableTokensConfig = { tokenLines: undefined, savedNames: new Set() };

const variableTokensFacet = Facet.define<VariableTokensConfig, VariableTokensConfig>({
  combine: (values) => values[0] ?? EMPTY_CONFIG,
});

function collectVariableRanges(config: VariableTokensConfig, doc: Text): VariableRange[] {
  const { tokenLines, savedNames } = config;
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
      // to the token itself so we don't decorate adjacent spaces.
      const raw = doc.sliceString(el.start, el.end);
      const leading = raw.length - raw.trimStart().length;
      const name = raw.trim().toUpperCase();
      if (!name) continue;
      const from = el.start + leading;
      const to = from + raw.trim().length;
      if (from >= to || to > docLength) continue;
      out.push({
        from,
        to,
        name,
        saved: savedNames.has(name),
        defaultClass: isDefaultVariableClass(name),
      });
    }
  }

  out.sort((a, b) => a.from - b.from);
  return out;
}

const savedVarMark = Decoration.mark({
  attributes: { class: 'cm-prompt-var cm-prompt-var-saved' },
});
const defaultVarMark = Decoration.mark({
  attributes: { class: 'cm-prompt-var cm-prompt-var-default' },
});
const unsavedVarMark = Decoration.mark({
  attributes: { class: 'cm-prompt-var' },
});

function markFor(range: VariableRange): Decoration {
  if (range.saved) return savedVarMark;
  if (range.defaultClass) return defaultVarMark;
  return unsavedVarMark;
}

function buildDecorations(config: VariableTokensConfig, doc: Text): DecorationSet {
  try {
    const ranges = collectVariableRanges(config, doc);
    if (ranges.length === 0) return Decoration.none;
    const builder = new RangeSetBuilder<Decoration>();
    for (const r of ranges) {
      if (r.from >= r.to || r.from < 0 || r.to > doc.length) continue;
      builder.add(r.from, r.to, markFor(r));
    }
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
      if (!callbacks.onVariableClick) return false;
      if (!(e.target instanceof HTMLElement)) return false;
      const varEl = e.target.closest<HTMLElement>('.cm-prompt-var');
      if (!varEl) return false;

      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos === null) return false;

      const config = view.state.facet(variableTokensFacet);
      const ranges = collectVariableRanges(config, view.state.doc);
      const hit = ranges.find((r) => pos >= r.from && pos < r.to);
      if (!hit) return false;

      callbacks.onVariableClick(hit, varEl);
      e.preventDefault();
      return true;
    },
  });
}

const variableTheme = EditorView.baseTheme({
  // Resting style: a dashed underline marks any uppercase VAR token as a
  // clickable, save-able operand — distinct from the violet operator glyph.
  '.cm-prompt-var': {
    cursor: 'pointer',
    borderRadius: '2px',
    padding: '0 1px',
    borderBottom: '1px dashed rgba(120, 120, 120, 0.55)',
    transition: 'background-color 100ms ease, border-color 100ms ease',
  },
  '.cm-prompt-var:hover': {
    backgroundColor: 'rgba(168, 85, 247, 0.18)',
    borderBottomColor: 'rgba(168, 85, 247, 0.7)',
  },
  // Saved variables get the solid emerald treatment used by the sidebar list.
  '.cm-prompt-var-saved': {
    borderBottom: '1px solid rgba(16, 185, 129, 0.75)',
    color: 'rgba(5, 150, 105, 0.95)',
  },
  // Default-class variables (ACTOR1/2/3, GOAL, …) read as recognised even when
  // not explicitly saved: a lighter dotted emerald, between saved and unknown.
  '.cm-prompt-var-default': {
    borderBottom: '1px dotted rgba(16, 185, 129, 0.7)',
    color: 'rgba(5, 150, 105, 0.8)',
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
