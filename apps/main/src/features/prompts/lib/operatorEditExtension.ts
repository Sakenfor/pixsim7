import { Facet, type Extension, RangeSetBuilder, type Text } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';

import type { PromptTokenLine } from '../hooks/useShadowAnalysis';

import { parseVariableName, splitVarCall } from './promptVariableName';

/** Class family of a var element (`ACTOR` from `ACTOR1` or `ACTOR1_HIP`), or
 *  undefined when empty. Unlike the legacy `varSemanticKind` (trailing-index
 *  strip only), this also splits off the facet, so a facet-typed var reports
 *  its class — letting `ACTOR1_HIP` match a class-level `ACTOR` recipe and a
 *  facet-level one. Equal to varSemanticKind for realistic facetless names. */
function varClass(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return parseVariableName(text).className || undefined;
}

/** Leading facet token of a var element (`HIP` from `ACTOR1_HIP`), or undefined
 *  when the var has no facet. Pure helper over parseVariableName. */
function leadingFacet(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const facets = parseVariableName(text).facets;
  return facets.length > 0 ? facets[0] : undefined;
}

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
   *
   * `access` is the special intra-token `_` operator (e.g. the `_` in
   * `ACTOR1_HIP`) — peer to the relation arrows but highest-precedence: it
   * binds an entity to a facet drawn from that class's facet set. It carries
   * no recipe semantics; the host routes it to a facet popover, not the
   * operator type-swap popover.
   */
  context: 'chain' | 'colon' | 'angle_bracket' | 'freestanding' | 'access';
  /** Element kind immediately before this operator (chain only). */
  prevKind?: 'var' | 'prose';
  /** Element kind immediately after this operator (chain only). */
  nextKind?: 'var' | 'prose';
  /**
   * Semantic-kind family of the var immediately before/after the operator
   * (chain only; only set when that element is a `var`). e.g. `ACTOR1` →
   * `ACTOR`. Feeds recipe matching's `lhs_kind` / `rhs_kind`.
   */
  prevVarKind?: string;
  nextVarKind?: string;
  /**
   * Leading facet token of the adjacent var operand, when it has one (e.g.
   * `HIP` from `ACTOR1_HIP`). Pairs with prevVarKind/nextVarKind (the class)
   * to give relation recipes a facet-typed operand — `ACTOR1_HIP < ACTOR2_HIP`
   * is a relation over anatomy-typed operands, not just `ACTOR < ACTOR`.
   */
  prevFacet?: string;
  nextFacet?: string;
  /**
   * Set only when `context === 'access'`. The entity/facet split of the
   * owning var token, so the host can resolve + describe the facet without
   * re-parsing. `facet` is the leading facet token (e.g. `HIP` from
   * `ACTOR1_HIP`); `className` is the entity's class (e.g. `ACTOR`).
   */
  access?: {
    varName: string;
    className: string;
    facet: string;
    /** Doc span of the facet text (after the first `_`) — the range a facet
     *  swap replaces. Lets the access `_` and the facet-text click share one
     *  replace-capable popover. */
    facetFrom: number;
    facetTo: number;
  };
}

export interface OperatorEditCallbacks {
  onOperatorClick?: (operator: OperatorRange, anchor: HTMLElement) => void;
}

const operatorTokensFacet = Facet.define<PromptTokenLine[] | undefined, PromptTokenLine[] | undefined>({
  combine: (values) => values[0],
});

/** Exported for unit tests — the host uses the extension, not this directly. */
export function collectOperatorRanges(
  tokenLines: PromptTokenLine[] | undefined,
  doc: Text,
): OperatorRange[] {
  if (!tokenLines) return [];
  const out: OperatorRange[] = [];
  const docLength = doc.length;

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
          const prevEl = line.elements[i];
          const nextEl = line.elements[i + 1];
          out.push({
            from, to,
            raw: op.op,
            run: op.run,
            context: 'chain',
            prevKind: prevEl?.kind,
            nextKind: nextEl?.kind,
            prevVarKind: prevEl?.kind === 'var' ? varClass(prevEl.text) : undefined,
            nextVarKind: nextEl?.kind === 'var' ? varClass(nextEl.text) : undefined,
            prevFacet: prevEl?.kind === 'var' ? leadingFacet(prevEl.text) : undefined,
            nextFacet: nextEl?.kind === 'var' ? leadingFacet(nextEl.text) : undefined,
          });
        }
      }
      // Intra-token `_` access operators. Each `var` element of the form
      // ENTITY_FACET carries a high-precedence `_` binding the entity to a
      // facet. We decorate that single `_` char (the first one — the
      // entity↔facet boundary) so it's clickable like the relation arrows,
      // reusing the same `.cm-prompt-op` mark. The element slot may include
      // surrounding whitespace, so tighten via the doc text (mirrors
      // variableTokenExtension).
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
        const raw = doc.sliceString(el.start, el.end);
        const leading = raw.length - raw.trimStart().length;
        // For a valued var `NAME(value)`, the access `_` and facet live in the
        // bare NAME, not the (value).
        const { name: bareName, nameLen } = splitVarCall(raw.trim());
        const name = bareName.toUpperCase();
        const us = name.indexOf('_');
        // Need a non-empty entity before the `_` and a facet after it.
        if (us <= 0 || us >= name.length - 1) continue;
        const parsed = parseVariableName(name);
        if (parsed.facets.length === 0) continue;
        const from = el.start + leading + us;
        const to = from + 1;
        if (from < 0 || to > docLength || from >= to) continue;
        // Facet text span = after the first `_` to the end of the bare name; the
        // range a swap replaces.
        const facetFrom = from + 1;
        const facetTo = el.start + leading + nameLen;
        out.push({
          from, to,
          raw: '_',
          run: 1,
          context: 'access',
          access: {
            varName: name,
            className: parsed.className,
            facet: parsed.facets[0],
            facetFrom,
            facetTo,
          },
        });
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
  doc: Text,
): DecorationSet {
  try {
    const ranges = collectOperatorRanges(tokenLines, doc);
    if (ranges.length === 0) return Decoration.none;
    const docLength = doc.length;
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
    let decorations = buildDecorations(lastTokens, view.state.doc);

    return {
      get decorations() {
        return decorations;
      },
      update(update: ViewUpdate) {
        const newTokens = update.state.facet(operatorTokensFacet);
        const tokensChanged = newTokens !== lastTokens;
        if (!update.docChanged && !tokensChanged) return;
        lastTokens = newTokens;
        decorations = buildDecorations(newTokens, update.state.doc);
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
      const ranges = collectOperatorRanges(tokens, view.state.doc);
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
  // ── Resting style: persistent indication ──────────────────────────────────
  // Without a rest style, operators look identical to surrounding text and
  // structure only becomes visible on hover — which makes the chain layer
  // feel "missing" until you happen to mouse over an operator. A subtle
  // purple bg + colored glyph keeps `<`, `=`, `===>`, `:` discoverable at a
  // glance while staying out of the way of prose text.
  '.cm-prompt-op': {
    cursor: 'pointer',
    borderRadius: '2px',
    padding: '0 1px',
    backgroundColor: 'rgba(168, 85, 247, 0.08)',
    color: 'rgba(126, 34, 206, 0.95)',
    fontWeight: '600',
    transition: 'background-color 100ms ease, outline-color 100ms ease',
  },
  '.cm-prompt-op:hover': {
    backgroundColor: 'rgba(168, 85, 247, 0.22)',
    outline: '1px solid rgba(168, 85, 247, 0.55)',
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
