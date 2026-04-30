import { Facet, type Extension, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';

import type { PromptTokenLine } from '../hooks/useShadowAnalysis';

/**
 * Operator edit extension — decorates operator runs (`=`, `<`, `>`, `:`)
 * emitted by the backend tokenizer. Click an operator to surface a
 * popover for type-swap + run-length adjustment. Document text isn't
 * modified by this extension; the host applies edits via
 * `view.dispatch({ changes })` from the popover.
 *
 * Position source: backend `tokens.lines` already provides absolute
 * char ranges (`op_start` / `op_end`) for every operator. We don't scan
 * the doc — backend is authoritative.
 */

export interface OperatorRange {
  /** Char range start in the document. */
  from: number;
  /** Char range end (exclusive). */
  to: number;
  /** The operator string at rest, e.g. `=`, `<`, `===>`. */
  raw: string;
  /** Run length (count of operator chars). */
  run: number;
  /**
   * Owning line kind — feeds straight into recipe matching's `line_kind`.
   * Today only `colon` headers and `chain` lines surface clickable
   * operators (angle_bracket / freestanding have no operator runs to
   * click), but the union is widened for forward-compat.
   */
  context: 'chain' | 'colon' | 'angle_bracket' | 'freestanding';
  /** Element kind immediately before this operator (chain only). */
  prevKind?: 'var' | 'prose';
  /** Element kind immediately after this operator (chain only). */
  nextKind?: 'var' | 'prose';
}

export interface OperatorEditCallbacks {
  onOperatorClick?: (operator: OperatorRange, anchor: HTMLElement) => void;
}

const operatorTokensFacet = Facet.define<PromptTokenLine[] | undefined, PromptTokenLine[] | undefined>({
  combine: (values) => values[0],
});

function collectOperatorRanges(
  tokenLines: PromptTokenLine[] | undefined,
  docLength: number,
): OperatorRange[] {
  if (!tokenLines) return [];
  const out: OperatorRange[] = [];

  for (const line of tokenLines) {
    if (line.kind === 'header') {
      if (typeof line.op_start === 'number' && typeof line.op_end === 'number') {
        const from = line.op_start;
        const to = line.op_end;
        if (from < to && from >= 0 && to <= docLength) {
          // Tokenizer only emits op_start/op_end for the colon header
          // today; angle_bracket / freestanding have none. Keep the
          // wider union for safety, fall back to 'colon' if `pattern`
          // is missing.
          const headerCtx =
            line.pattern === 'colon' ||
            line.pattern === 'angle_bracket' ||
            line.pattern === 'freestanding'
              ? line.pattern
              : 'colon';
          out.push({
            from, to,
            raw: '',  // host can recover via doc.sliceString
            run: to - from,
            context: headerCtx,
          });
        }
      }
    } else if (line.kind === 'chain' && Array.isArray(line.operators) && Array.isArray(line.elements)) {
      // Invariant: elements.length === operators.length + 1
      for (let i = 0; i < line.operators.length; i++) {
        const op = line.operators[i];
        const from = op.op_start;
        const to = op.op_end;
        if (from < to && from >= 0 && to <= docLength) {
          out.push({
            from, to,
            raw: op.op,
            run: op.run,
            context: 'chain',
            prevKind: line.elements[i]?.kind,
            nextKind: line.elements[i + 1]?.kind,
          });
        }
      }
    }
  }

  // Sort by start position — RangeSetBuilder requires monotonic adds.
  out.sort((a, b) => a.from - b.from);
  return out;
}

const operatorMark = Decoration.mark({
  attributes: {
    class: 'cm-prompt-op',
  },
});

function buildDecorations(
  tokenLines: PromptTokenLine[] | undefined,
  docLength: number,
): DecorationSet {
  try {
    const ranges = collectOperatorRanges(tokenLines, docLength);
    if (ranges.length === 0) return Decoration.none;
    const builder = new RangeSetBuilder<Decoration>();
    for (const r of ranges) {
      // Skip zero-length or out-of-bounds ranges defensively — RangeSetBuilder
      // throws on invalid input which would tear down the whole editor.
      if (r.from >= r.to || r.from < 0 || r.to > docLength) continue;
      builder.add(r.from, r.to, operatorMark);
    }
    return builder.finish();
  } catch (err) {
    console.warn('[operatorEditExtension] buildDecorations failed:', err);
    return Decoration.none;
  }
}

const operatorPlugin = ViewPlugin.define(
  (view) => {
    let lastTokens = view.state.facet(operatorTokensFacet);
    let decorations = buildDecorations(lastTokens, view.state.doc.length);

    return {
      get decorations() {
        return decorations;
      },
      update(update: ViewUpdate) {
        const newTokens = update.state.facet(operatorTokensFacet);
        const tokensChanged = newTokens !== lastTokens;
        if (!update.docChanged && !tokensChanged) return;
        lastTokens = newTokens;
        decorations = buildDecorations(newTokens, update.state.doc.length);
      },
    };
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);

function operatorClickHandler(callbacks: OperatorEditCallbacks) {
  return EditorView.domEventHandlers({
    click: (e, view) => {
      if (!callbacks.onOperatorClick) return false;
      if (!(e.target instanceof HTMLElement)) return false;
      const opEl = e.target.closest<HTMLElement>('.cm-prompt-op');
      if (!opEl) return false;

      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos === null) return false;

      const tokens = view.state.facet(operatorTokensFacet);
      const ranges = collectOperatorRanges(tokens, view.state.doc.length);
      const hit = ranges.find((r) => pos >= r.from && pos < r.to);
      if (!hit) return false;

      // Resolve raw operator from the doc since headers don't bring it.
      const resolved: OperatorRange = {
        ...hit,
        raw: view.state.doc.sliceString(hit.from, hit.to),
      };
      callbacks.onOperatorClick(resolved, opEl);
      e.preventDefault();
      return true;
    },
  });
}

const operatorTheme = EditorView.baseTheme({
  '.cm-prompt-op': {
    cursor: 'pointer',
    borderRadius: '2px',
    transition: 'background-color 100ms ease',
  },
  '.cm-prompt-op:hover': {
    backgroundColor: 'rgba(168, 85, 247, 0.18)',
    outline: '1px solid rgba(168, 85, 247, 0.5)',
  },
});

export function operatorEditExtension(
  tokenLines: PromptTokenLine[] | undefined,
  callbacks?: OperatorEditCallbacks,
): Extension {
  const parts: Extension[] = [
    operatorTokensFacet.of(tokenLines),
    operatorPlugin,
    operatorTheme,
  ];
  if (callbacks?.onOperatorClick) {
    parts.push(operatorClickHandler(callbacks));
  }
  return parts;
}
