import { Facet, type Extension, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
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

  for (const { from, to, candidate } of positioned) {
    if (from >= to || from < 0 || to > docLength) continue;

    const hex = getPromptRoleHex(candidate.role, config.roleColors);
    const { r, g, b } = hexToRgb(hex);
    const conf = candidate.confidence ?? 1;
    const opacity = 0.4 + 0.6 * Math.min(1, Math.max(0, conf));
    const bgAlpha = (opacity * 0.25).toFixed(2);

    const mark = Decoration.mark({
      attributes: {
        style: [
          `background-color: rgba(${r},${g},${b},${bgAlpha})`,
          `border-bottom: 2px solid ${hex}`,
          'border-radius: 2px',
          'cursor: pointer',
        ].join(';'),
        'data-role': candidate.role ?? '',
      },
    });

    builder.add(from, to, mark);
  }

  return builder.finish();
}

// ── Header line decorations ────────────────────────────────────────────────

const headerLineMark = Decoration.line({
  attributes: { class: 'cm-shadow-header-line' },
});

function buildHeaderDecorations(
  tokenLines: PromptTokenLine[] | undefined,
  view: EditorView,
): DecorationSet {
  if (!tokenLines || tokenLines.length === 0) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  const docLen = view.state.doc.length;

  const headerStarts = tokenLines
    .filter((l) => l.kind === 'header')
    .map((l) => l.start)
    .filter((s) => s >= 0 && s < docLen)
    .sort((a, b) => a - b);

  for (const charPos of headerStarts) {
    const line = view.state.doc.lineAt(charPos);
    builder.add(line.from, line.from, headerLineMark);
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

const shadowHeaderDecoPlugin = ViewPlugin.define(
  (view) => {
    let lastConfig = view.state.facet(shadowConfigFacet);
    let decorations = buildHeaderDecorations(lastConfig?.tokenLines, view);
    return {
      get decorations() { return decorations; },
      update(update: ViewUpdate) {
        const newConfig = update.state.facet(shadowConfigFacet);
        const configChanged = newConfig !== lastConfig;
        if (!update.docChanged && !configChanged) return;
        lastConfig = newConfig;
        decorations = buildHeaderDecorations(newConfig?.tokenLines, update.view);
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

      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos === null) return false;

      const config = view.state.facet(shadowConfigFacet);
      if (!config) return false;

      const positioned = getPositionedCandidates(config);
      const candidate = findCandidateAt(positioned, pos);
      if (!candidate) return false;

      // Find the decorated span element so the popover can anchor to it.
      // Click target is typically the span with data-role; fall back to the
      // click coords if no span was found directly.
      let anchor: HTMLElement | null = null;
      if (e.target instanceof HTMLElement) {
        anchor = e.target.closest<HTMLElement>('[data-role]') ?? e.target;
      }
      if (!anchor) return false;

      callbacks.onCandidateClick(candidate, anchor);
      return false;
    },
  });
}

// ── Public API ─────────────────────────────────────────────────────────────

const headerLineTheme = EditorView.baseTheme({
  '.cm-shadow-header-line': {
    borderTop: '1px solid rgba(148,163,184,0.25)',
    marginTop: '1px',
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
    parts.push(shadowHeaderDecoPlugin);
  }
  if (callbacks?.onCandidateClick) {
    parts.push(shadowClickHandler(callbacks));
  }
  return parts;
}
