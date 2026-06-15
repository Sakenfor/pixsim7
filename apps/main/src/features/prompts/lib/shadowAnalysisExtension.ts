import { Facet, type Extension, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
  hoverTooltip,
  type Tooltip,
} from '@codemirror/view';

import { getPromptRoleHex, getPromptRoleLabel } from '@/lib/promptRoleUi';

import type { PromptTokenLine } from '../hooks/useShadowAnalysis';
import type { PromptBlockCandidate } from '../types';

import { parsePrimitiveMatch } from './parsePrimitiveMatch';

// ── Config ─────────────────────────────────────────────────────────────────

export interface ShadowAnalysisConfig {
  candidates: PromptBlockCandidate[];
  roleColors?: Record<string, string>;
  tokenLines?: PromptTokenLine[];
  /** When set, candidates whose role !== emphasizedRole render at reduced
   *  opacity (matches PromptHighlightedSpans). Drives legend emphasis. */
  emphasizedRole?: string | null;
}

export interface ShadowAnalysisCallbacks {
  onCandidateHover?: (candidate: PromptBlockCandidate | null) => void;
  onCandidateClick?: (candidate: PromptBlockCandidate, anchor: HTMLElement) => void;
}

// ── Facet ──────────────────────────────────────────────────────────────────

const shadowConfigFacet = Facet.define<ShadowAnalysisConfig | null, ShadowAnalysisConfig | null>({
  combine: (values) => values[0] ?? null,
});

// ── Position lookup ────────────────────────────────────────────────────────

interface PositionedCandidate {
  from: number;
  to: number;
  candidate: PromptBlockCandidate;
}

function getPositionedCandidates(config: ShadowAnalysisConfig | null): PositionedCandidate[] {
  if (!config) return [];
  return config.candidates
    .filter((c) => typeof c.start_pos === 'number' && typeof c.end_pos === 'number')
    .map((c) => ({ from: c.start_pos!, to: c.end_pos!, candidate: c }))
    .sort((a, b) => a.from - b.from);
}

function findCandidateAt(positioned: PositionedCandidate[], pos: number): PromptBlockCandidate | null {
  for (const p of positioned) {
    if (pos >= p.from && pos < p.to) return p.candidate;
  }
  return null;
}

// ── Decoration builder ─────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function buildDecorations(
  config: ShadowAnalysisConfig | null,
  docLength: number,
): DecorationSet {
  if (!config) return Decoration.none;

  const positioned = getPositionedCandidates(config);
  if (positioned.length === 0) return Decoration.none;

  const builder = new RangeSetBuilder<Decoration>();

  const emphasizedRole = config.emphasizedRole ?? null;
  for (const { from, to, candidate } of positioned) {
    if (from >= to || from < 0 || to > docLength) continue;

    const hex = getPromptRoleHex(candidate.role, config.roleColors);
    const { r, g, b } = hexToRgb(hex);
    const conf = candidate.confidence ?? 1;
    // Legend emphasis: dim non-matching roles to ×0.3.
    const isDimmed = emphasizedRole != null && candidate.role !== emphasizedRole;
    const dimFactor = isDimmed ? 0.3 : 1;
    const opacity = (0.4 + 0.6 * Math.min(1, Math.max(0, conf))) * dimFactor;
    const bgAlpha = (opacity * 0.25).toFixed(2);

    const borderAlpha = dimFactor.toFixed(2);
    const mark = Decoration.mark({
      attributes: {
        // Resting style: underline only. The bg color is exposed as a custom
        // property so the hover rule in the theme can fade it in without us
        // re-emitting per-role styles in CSS. The underline alpha mirrors
        // the dim factor so emphasised + non-emphasised roles read clearly
        // against each other.
        style: [
          `--cm-shadow-bg: rgba(${r},${g},${b},${bgAlpha})`,
          `border-bottom: 2px solid rgba(${r},${g},${b},${borderAlpha})`,
          'border-radius: 2px',
          'cursor: pointer',
        ].join(';'),
        class: 'cm-shadow-candidate',
        'data-role': candidate.role ?? '',
      },
    });

    builder.add(from, to, mark);
  }

  return builder.finish();
}

// ── Structural line decorations (header + chain) ──────────────────────────

// Glyph per surviving header pattern. Chain lines don't get a glyph badge;
// inline element marks + line tinting carry the visual signal instead.
const HEADER_PATTERN_GLYPH: Record<string, string> = {
  colon: ':',
  angle_bracket: '‹›',
  freestanding: '¶',
};

class HeaderBadgeWidget extends WidgetType {
  constructor(readonly glyph: string) {
    super();
  }

  eq(other: HeaderBadgeWidget): boolean {
    return other.glyph === this.glyph;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-shadow-line-badge cm-shadow-line-badge-header';
    span.textContent = this.glyph;
    span.style.cssText = [
      'display: inline-block',
      'min-width: 1em',
      'padding: 0 4px',
      'margin-right: 6px',
      'border-radius: 3px',
      'font-family: ui-monospace, monospace',
      'font-size: 0.85em',
      'text-align: center',
      'opacity: 0.85',
      'user-select: none',
      'pointer-events: none',
      'background: rgba(56, 189, 248, 0.18); color: rgb(2, 132, 199);',
    ].join(';');
    return span;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

const headerLineMark = Decoration.line({
  attributes: { class: 'cm-shadow-header-line' },
});

const chainLineWithBodyMark = Decoration.line({
  attributes: { class: 'cm-shadow-chain-line cm-shadow-chain-line-with-body' },
});

const chainLinePureMark = Decoration.line({
  attributes: { class: 'cm-shadow-chain-line cm-shadow-chain-line-pure' },
});

const chainElementVarMark = Decoration.mark({
  attributes: { class: 'cm-shadow-chain-elem cm-shadow-chain-elem-var', 'data-elem-kind': 'var' },
});

const chainElementProseMark = Decoration.mark({
  attributes: { class: 'cm-shadow-chain-elem cm-shadow-chain-elem-prose', 'data-elem-kind': 'prose' },
});

const chainElementValueMark = Decoration.mark({
  attributes: { class: 'cm-shadow-chain-elem cm-shadow-chain-elem-value', 'data-elem-kind': 'value' },
});

function buildChainDecorations(
  tokenLines: PromptTokenLine[] | undefined,
  view: EditorView,
): DecorationSet {
  if (!tokenLines || tokenLines.length === 0) return Decoration.none;
  const docLen = view.state.doc.length;

  // Collect line decos + badge widgets + per-element inline marks, then
  // sort by position so the RangeSetBuilder can insert them in order
  // (it requires monotonic adds).
  type Entry = { from: number; to: number; deco: Decoration; sortKey: number };
  const entries: Entry[] = [];

  for (const tokenLine of tokenLines) {
    if (tokenLine.kind === 'header') {
      if (tokenLine.start < 0 || tokenLine.start >= docLen) continue;
      const line = view.state.doc.lineAt(tokenLine.start);

      entries.push({
        from: line.from,
        to: line.from,
        deco: headerLineMark,
        sortKey: line.from * 4,
      });

      const glyph = HEADER_PATTERN_GLYPH[tokenLine.pattern ?? ''] ?? '?';
      entries.push({
        from: line.from,
        to: line.from,
        deco: Decoration.widget({ widget: new HeaderBadgeWidget(glyph), side: -1 }),
        sortKey: line.from * 4 + 1,
      });
      continue;
    }

    if (tokenLine.kind === 'chain' && Array.isArray(tokenLine.elements)) {
      if (tokenLine.start < 0 || tokenLine.start >= docLen) continue;
      const line = view.state.doc.lineAt(tokenLine.start);

      const hasProse = tokenLine.elements.some(
        (e) => e.kind === 'prose' && e.text.length > 0,
      );
      const lineDeco = hasProse ? chainLineWithBodyMark : chainLinePureMark;
      entries.push({
        from: line.from,
        to: line.from,
        deco: lineDeco,
        sortKey: line.from * 4,
      });

      // Inline element marks — non-empty spans only; RangeSetBuilder
      // chokes on zero-length mark decorations.
      for (const el of tokenLine.elements) {
        if (el.start >= el.end) continue;
        if (el.start < 0 || el.end > docLen) continue;
        const mark =
          el.kind === 'var'
            ? chainElementVarMark
            : el.kind === 'value'
              ? chainElementValueMark
              : chainElementProseMark;
        entries.push({
          from: el.start,
          to: el.end,
          deco: mark,
          sortKey: el.start * 4 + 2,
        });
      }
    }
  }

  entries.sort((a, b) => a.sortKey - b.sortKey);

  const builder = new RangeSetBuilder<Decoration>();
  for (const e of entries) {
    builder.add(e.from, e.to, e.deco);
  }
  return builder.finish();
}

// ── Decoration plugin ──────────────────────────────────────────────────────

const shadowDecoPlugin = ViewPlugin.define(
  (view) => {
    let lastConfig = view.state.facet(shadowConfigFacet);
    let decorations = buildDecorations(lastConfig, view.state.doc.length);

    return {
      get decorations() {
        return decorations;
      },
      update(update: ViewUpdate) {
        const newConfig = update.state.facet(shadowConfigFacet);
        const configChanged = newConfig !== lastConfig;

        if (!update.docChanged && !configChanged) return;

        lastConfig = newConfig;
        decorations = buildDecorations(newConfig, update.state.doc.length);
      },
    };
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);

const shadowChainDecoPlugin = ViewPlugin.define(
  (view) => {
    let lastConfig = view.state.facet(shadowConfigFacet);
    let decorations = buildChainDecorations(lastConfig?.tokenLines, view);
    return {
      get decorations() { return decorations; },
      update(update: ViewUpdate) {
        const newConfig = update.state.facet(shadowConfigFacet);
        const configChanged = newConfig !== lastConfig;
        if (!update.docChanged && !configChanged) return;
        lastConfig = newConfig;
        decorations = buildChainDecorations(newConfig?.tokenLines, update.view);
      },
    };
  },
  { decorations: (plugin) => plugin.decorations },
);

// ── Hover tooltip ──────────────────────────────────────────────────────────

function shadowHoverTooltip(callbacks?: ShadowAnalysisCallbacks) {
  return hoverTooltip((view, pos) => {
    const config = view.state.facet(shadowConfigFacet);
    if (!config) {
      callbacks?.onCandidateHover?.(null);
      return null;
    }

    const positioned = getPositionedCandidates(config);
    const candidate = findCandidateAt(positioned, pos);

    callbacks?.onCandidateHover?.(candidate);

    if (!candidate) return null;

    const from = candidate.start_pos!;
    const to = candidate.end_pos!;

    return {
      pos: from,
      end: to,
      above: false,
      create(): { dom: HTMLElement; offset?: { x: number; y: number } } {
        const dom = document.createElement('div');
        dom.className = 'cm-shadow-tooltip';
        dom.style.cssText = [
          'padding: 6px 10px',
          'border-radius: 8px',
          'font-size: 12px',
          'max-width: 280px',
          'background: rgba(23,23,23,0.95)',
          'color: #fff',
          'border: 1px solid #404040',
          'box-shadow: 0 4px 12px rgba(0,0,0,0.3)',
          'pointer-events: none',
        ].join(';');

        const roleHex = getPromptRoleHex(candidate.role, config.roleColors);
        const roleLabel = getPromptRoleLabel(candidate.role);

        // Role + category line
        const header = document.createElement('div');
        header.style.cssText = 'display: flex; align-items: center; gap: 6px;';
        const dot = document.createElement('span');
        dot.style.cssText = `width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: ${roleHex};`;
        header.appendChild(dot);
        const roleName = document.createElement('span');
        roleName.style.fontWeight = '500';
        roleName.textContent = roleLabel;
        header.appendChild(roleName);
        if (candidate.category) {
          const cat = document.createElement('span');
          cat.style.color = '#a0a0a0';
          cat.textContent = `/ ${candidate.category}`;
          header.appendChild(cat);
        }
        dom.appendChild(header);

        // Confidence
        if (typeof candidate.confidence === 'number') {
          const confLine = document.createElement('div');
          confLine.style.cssText = 'margin-top: 2px; color: #a0a0a0;';
          confLine.textContent = `Confidence: ${Math.round(candidate.confidence * 100)}%`;
          dom.appendChild(confLine);
        }

        // Primitive match
        const pm = parsePrimitiveMatch(candidate);
        if (pm) {
          const pmLine = document.createElement('div');
          pmLine.style.cssText = 'margin-top: 4px; padding-top: 4px; border-top: 1px solid #404040; display: flex; align-items: center; gap: 6px;';
          const blockId = document.createElement('span');
          blockId.style.cssText = 'color: #a78bfa; font-family: monospace;';
          blockId.textContent = pm.block_id;
          pmLine.appendChild(blockId);
          const score = document.createElement('span');
          score.style.cssText = `font-variant-numeric: tabular-nums; color: ${pm.score >= 0.8 ? '#4ade80' : pm.score >= 0.6 ? '#facc15' : '#a0a0a0'};`;
          score.textContent = `${Math.round(pm.score * 100)}%`;
          pmLine.appendChild(score);
          dom.appendChild(pmLine);
        }

        // Keywords
        if (candidate.matched_keywords && candidate.matched_keywords.length > 0) {
          const kwLine = document.createElement('div');
          kwLine.style.cssText = 'margin-top: 2px; color: #a0a0a0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
          kwLine.textContent = `Keywords: ${candidate.matched_keywords.join(', ')}`;
          dom.appendChild(kwLine);
        }

        return { dom };
      },
    } satisfies Tooltip;
  }, { hideOnChange: true, hoverTime: 300 });
}

// ── Click handler ──────────────────────────────────────────────────────────

function shadowClickHandler(callbacks: ShadowAnalysisCallbacks) {
  return EditorView.domEventHandlers({
    click: (e, view) => {
      if (!callbacks.onCandidateClick) return false;
      if (!(e.target instanceof Node)) return false;

      // Only treat direct hits on decorated candidate text as valid clicks.
      // This avoids opening the popover from line gutters, end-of-line space,
      // or empty lines that may still map to nearby document positions.
      const baseEl =
        e.target instanceof HTMLElement ? e.target : e.target.parentElement;
      const candidateEl = baseEl?.closest<HTMLElement>('.cm-shadow-candidate');
      if (!candidateEl) return false;

      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos === null) return false;

      const config = view.state.facet(shadowConfigFacet);
      if (!config) return false;

      const positioned = getPositionedCandidates(config);
      const candidate = findCandidateAt(positioned, pos);
      if (!candidate) return false;

      callbacks.onCandidateClick(candidate, candidateEl);
      return false;
    },
  });
}

// ── Public API ─────────────────────────────────────────────────────────────

const headerLineTheme = EditorView.baseTheme({
  // ── Header lines (colon, angle_bracket, freestanding) ───────────────────
  '.cm-shadow-header-line': {
    backgroundColor: 'rgba(56, 189, 248, 0.06)',
    borderLeft: '2px solid rgba(56, 189, 248, 0.5)',
    paddingLeft: '6px',
    fontWeight: '500',
    transition: 'background-color 120ms ease, border-left-color 120ms ease',
  },
  '.cm-shadow-header-line:hover': {
    backgroundColor: 'rgba(56, 189, 248, 0.13)',
    borderLeftColor: 'rgba(14, 165, 233, 0.85)',
  },
  '.cm-shadow-header-line:hover .cm-shadow-line-badge-header': {
    background: 'rgba(56, 189, 248, 0.32)',
    opacity: '1',
  },
  // ── Chain lines containing prose (header-style blue tint) ───────────────
  '.cm-shadow-chain-line-with-body': {
    backgroundColor: 'rgba(56, 189, 248, 0.06)',
    borderLeft: '2px solid rgba(56, 189, 248, 0.45)',
    paddingLeft: '6px',
    transition: 'background-color 120ms ease, border-left-color 120ms ease',
  },
  '.cm-shadow-chain-line-with-body:hover': {
    backgroundColor: 'rgba(56, 189, 248, 0.13)',
    borderLeftColor: 'rgba(14, 165, 233, 0.85)',
  },
  // ── Chain lines all-var (relation-style amber tint) ─────────────────────
  '.cm-shadow-chain-line-pure': {
    backgroundColor: 'rgba(245, 158, 11, 0.06)',
    borderLeft: '2px solid rgba(245, 158, 11, 0.45)',
    paddingLeft: '6px',
    transition: 'background-color 120ms ease, border-left-color 120ms ease',
  },
  '.cm-shadow-chain-line-pure:hover': {
    backgroundColor: 'rgba(245, 158, 11, 0.13)',
    borderLeftColor: 'rgba(217, 119, 6, 0.85)',
  },
  // ── Per-element inline styling within chains ────────────────────────────
  '.cm-shadow-chain-elem-var': {
    fontFamily: 'ui-monospace, monospace',
    color: 'rgb(2, 132, 199)',
  },
  '.cm-shadow-chain-elem-prose': {
    fontStyle: 'italic',
  },
  // Value literal operand `( … )` — faint violet wash so an explicit value body
  // reads distinctly from incidental prose.
  '.cm-shadow-chain-elem-value': {
    backgroundColor: 'rgba(168, 85, 247, 0.07)',
    borderRadius: '2px',
  },
  // ── Candidate spans: underline at rest, bg wash on hover ────────────────
  '.cm-shadow-candidate:hover': {
    backgroundColor: 'var(--cm-shadow-bg)',
    borderBottomWidth: '3px',
  },
});

export function shadowAnalysisExtension(
  config: ShadowAnalysisConfig | null,
  callbacks?: ShadowAnalysisCallbacks,
): Extension {
  const parts: Extension[] = [
    shadowConfigFacet.of(config),
    shadowDecoPlugin,
    shadowHoverTooltip(callbacks),
    headerLineTheme,
  ];
  if (config?.tokenLines?.length) {
    parts.push(shadowChainDecoPlugin);
  }
  if (callbacks?.onCandidateClick) {
    parts.push(shadowClickHandler(callbacks));
  }
  return parts;
}
