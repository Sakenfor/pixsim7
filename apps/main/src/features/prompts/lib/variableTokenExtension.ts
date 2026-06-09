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
        colorHex: getVariableClassVisual(name)?.hex,
      });
    }
  }

  out.sort((a, b) => a.from - b.from);
  return out;
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
