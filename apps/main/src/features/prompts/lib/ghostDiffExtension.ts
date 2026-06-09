import { EditorState, Facet, type Extension, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  type Tooltip,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
  hoverTooltip,
} from '@codemirror/view';

import {
  diffPromptWithRanges,
  type DiffPromptRangeOptions,
  type DiffSegmentWithRange,
} from './promptDiff';

// ── Config ─────────────────────────────────────────────────────────────────

export interface GhostDiffConfig {
  comparisonText: string;
  stepDistance: number;
  precision?: DiffPromptRangeOptions['precision'];
}

export interface GhostDiffCallbacks {
  onSuppress?: (suppressed: boolean) => void;
  onRemovedSegments?: (removed: string[]) => void;
}

// ── Constants (same as PromptGhostDiff.tsx) ─────────────────────────────────

const OPACITY_MAX = 0.55;
const OPACITY_MIN = 0.08;
const DECAY = 0.75;
const MAX_DIFF_RATIO = 0.6;

function ghostOpacity(stepDistance: number): number {
  if (stepDistance <= 0) return 0;
  return OPACITY_MIN + (OPACITY_MAX - OPACITY_MIN) * DECAY ** (stepDistance - 1);
}

// ── Facet for external config ──────────────────────────────────────────────

const ghostDiffFacet = Facet.define<GhostDiffConfig | null, GhostDiffConfig | null>({
  combine: (values) => values[0] ?? null,
});

// ── Position mapping ───────────────────────────────────────────────────────

interface AddRange {
  from: number;
  to: number;
  compareText: string;
}

interface RemoveMarker {
  at: number;
  text: string;
}

interface DiffResult {
  ranges: AddRange[];
  removeMarkers: RemoveMarker[];
  removed: string[];
  suppressed: boolean;
  opacity: number;
}

class RemoveMarkerWidget extends WidgetType {
  constructor(
    private readonly at: number,
    private readonly removedText: string,
  ) {
    super();
  }

  toDOM() {
    const root = document.createElement('span');
    root.className =
      'cm-ghost-diff-remove relative inline-block w-0 overflow-visible align-middle';
    root.dataset.ghostAt = String(this.at);
    root.dataset.ghostCompare = encodeURIComponent(this.removedText);
    // No native `title` — the line hover tooltip carries the context; the dot
    // stays a pure click-to-restore affordance.

    const dot = document.createElement('span');
    dot.className =
      'absolute -left-1 top-[0.7em] -translate-y-1/2 w-2 h-2 rounded-full bg-red-500 shadow-sm ring-1 ring-white/80 dark:ring-neutral-900/80 cursor-pointer';
    root.appendChild(dot);
    return root;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

export function computeDiff(docText: string, config: GhostDiffConfig | null): DiffResult {
  const empty: DiffResult = {
    ranges: [],
    removeMarkers: [],
    removed: [],
    suppressed: false,
    opacity: 0,
  };
  if (!config) return empty;

  const segments = diffPromptWithRanges(config.comparisonText, docText, {
    precision: config.precision ?? 'coarse',
  });
  const hasChanges = segments.some((s) => s.type !== 'keep');
  if (!hasChanges) return empty;

  const changedCount = segments.filter((s) => s.type !== 'keep').length;
  const diffRatio = segments.length > 0 ? changedCount / segments.length : 0;
  if (diffRatio > MAX_DIFF_RATIO) {
    return {
      ranges: [],
      removeMarkers: [],
      removed: segments.filter((s) => s.type === 'remove').map((s) => s.text),
      suppressed: true,
      opacity: 0,
    };
  }

  const opacity = ghostOpacity(config.stepDistance);
  if (opacity <= 0) return empty;

  const ranges: AddRange[] = [];
  const removeMarkers: RemoveMarker[] = [];
  const removed: string[] = [];
  let cursor = 0;

  for (const seg of segments) {
    if (seg.type === 'remove') {
      removed.push(seg.text);
      removeMarkers.push({ at: cursor, text: seg.text });
      continue;
    }

    if (typeof seg.to === 'number') {
      cursor = seg.to;
    } else if (typeof seg.from === 'number') {
      cursor = seg.from + seg.text.length;
    } else {
      cursor += seg.text.length;
    }

    if (
      seg.type === 'add' &&
      typeof seg.from === 'number' &&
      typeof seg.to === 'number' &&
      seg.from < seg.to
    ) {
      const compareText =
        typeof seg.prevFrom === 'number' && typeof seg.prevTo === 'number'
          ? config.comparisonText.slice(seg.prevFrom, seg.prevTo)
          : '';
      ranges.push({ from: seg.from, to: seg.to, compareText });
    }
  }

  return { ranges, removeMarkers, removed, suppressed: false, opacity };
}

// ── Decoration builder ─────────────────────────────────────────────────────

export function buildDecorations(result: DiffResult): DecorationSet {
  if ((result.ranges.length === 0 && result.removeMarkers.length === 0) || result.opacity <= 0) {
    return Decoration.none;
  }

  // RangeSetBuilder requires a SINGLE stream of ranges added in ascending
  // (from, startSide) order — add marks and remove-widgets cannot be added in
  // two separate passes, since a remove marker usually sits before an
  // already-added add mark and trips "Ranges must be added sorted by `from`".
  // Collect everything, then sort. `order` breaks ties at the same position:
  // a point widget (side -1) must precede a mark that starts there.
  type Entry = { from: number; to: number; deco: Decoration; order: number };
  const entries: Entry[] = [];

  for (const { from, to, compareText } of result.ranges) {
    if (from < to) {
      entries.push({
        from,
        to,
        order: 1,
        deco: Decoration.mark({
          attributes: {
            // No native `title` — the hover tooltip (ghostLineHoverTooltip)
            // owns the hover affordance so we don't double-pop two tooltips.
            class: 'cm-ghost-diff-add',
            style: `background-color: rgba(34, 197, 94, ${result.opacity}); border-radius: 2px; cursor: pointer;`,
            'data-ghost-from': String(from),
            'data-ghost-to': String(to),
            'data-ghost-compare': encodeURIComponent(compareText),
          },
        }),
      });
    }
  }

  for (const marker of result.removeMarkers) {
    entries.push({
      from: marker.at,
      to: marker.at,
      order: 0,
      deco: Decoration.widget({
        widget: new RemoveMarkerWidget(marker.at, marker.text),
        side: -1,
      }),
    });
  }

  entries.sort((a, b) => a.from - b.from || a.order - b.order);

  const builder = new RangeSetBuilder<Decoration>();
  for (const entry of entries) {
    builder.add(entry.from, entry.to, entry.deco);
  }
  return builder.finish();
}

// ── ViewPlugin — computes decorations + fires callbacks ────────────────────

const ghostDiffPlugin = ViewPlugin.define(
  (view) => {
    let lastConfig = view.state.facet(ghostDiffFacet);
    let decorations = lastConfig
      ? buildDecorations(computeDiff(view.state.doc.toString(), lastConfig))
      : Decoration.none;

    return {
      get decorations() {
        return decorations;
      },
      update(update: ViewUpdate) {
        const newConfig = update.state.facet(ghostDiffFacet);
        const configChanged =
          newConfig?.comparisonText !== lastConfig?.comparisonText ||
          newConfig?.stepDistance !== lastConfig?.stepDistance ||
          newConfig?.precision !== lastConfig?.precision ||
          (newConfig === null) !== (lastConfig === null);

        // Fast path: ghost mode disabled and still disabled.
        if (!configChanged && newConfig === null) return;
        if (!update.docChanged && !configChanged) return;

        lastConfig = newConfig;
        decorations = newConfig
          ? buildDecorations(computeDiff(update.state.doc.toString(), newConfig))
          : Decoration.none;
      },
    };
  },
  {
    decorations: (plugin) => plugin.decorations,
    eventHandlers: {
      mousedown(event, view) {
        if (event.button !== 0) return false;
        const target = event.target;
        if (!(target instanceof Element)) return false;
        const addNode = target.closest<HTMLElement>('.cm-ghost-diff-add');
        const removeNode = target.closest<HTMLElement>('.cm-ghost-diff-remove');
        if (!addNode && !removeNode) return false;
        if (view.state.facet(EditorState.readOnly)) return true;

        const docLen = view.state.doc.length;

        if (addNode) {
          const from = Number(addNode.dataset.ghostFrom);
          const to = Number(addNode.dataset.ghostTo);
          if (!Number.isFinite(from) || !Number.isFinite(to)) return true;

          const safeFrom = Math.max(0, Math.min(docLen, from));
          const safeTo = Math.max(safeFrom, Math.min(docLen, to));

          let replaceWith = '';
          const encoded = addNode.dataset.ghostCompare ?? '';
          try {
            replaceWith = decodeURIComponent(encoded);
          } catch {
            replaceWith = '';
          }

          view.dispatch({
            changes: { from: safeFrom, to: safeTo, insert: replaceWith },
            selection: { anchor: safeFrom + replaceWith.length },
          });
          event.preventDefault();
          return true;
        }

        const at = Number(removeNode?.dataset.ghostAt);
        if (!Number.isFinite(at)) return true;
        const safeAt = Math.max(0, Math.min(docLen, at));

        let restoreText = '';
        const encoded = removeNode?.dataset.ghostCompare ?? '';
        try {
          restoreText = decodeURIComponent(encoded);
        } catch {
          restoreText = '';
        }

        view.dispatch({
          changes: { from: safeAt, to: safeAt, insert: restoreText },
          selection: { anchor: safeAt + restoreText.length },
        });
        event.preventDefault();
        return true;
      },
    },
  },
);

// ── Callback bridge (separate plugin so it doesn't block decoration calc) ──

function ghostDiffCallbackPlugin(callbacks: GhostDiffCallbacks) {
  let lastSuppressed: boolean | null = null;
  let lastRemovedSig = '';

  return ViewPlugin.define((view) => {
    const config = view.state.facet(ghostDiffFacet);
    let lastConfig = config;

    function fireCallbacks(docText: string, cfg: GhostDiffConfig | null) {
      const result = computeDiff(docText, cfg);

      if (callbacks.onSuppress && result.suppressed !== lastSuppressed) {
        lastSuppressed = result.suppressed;
        callbacks.onSuppress(result.suppressed);
      }

      if (callbacks.onRemovedSegments) {
        const sig = result.removed.join('\x1f');
        if (sig !== lastRemovedSig) {
          lastRemovedSig = sig;
          callbacks.onRemovedSegments(result.removed);
        }
      }
    }

    if (config) {
      fireCallbacks(view.state.doc.toString(), config);
    }

    return {
      update(update: ViewUpdate) {
        const newConfig = update.state.facet(ghostDiffFacet);
        const configChanged =
          newConfig?.comparisonText !== lastConfig?.comparisonText ||
          newConfig?.stepDistance !== lastConfig?.stepDistance ||
          newConfig?.precision !== lastConfig?.precision ||
          (newConfig === null) !== (lastConfig === null);

        // Fast path: ghost mode disabled and still disabled.
        if (!configChanged && newConfig === null) return;
        if (!update.docChanged && !configChanged) return;
        lastConfig = newConfig;
        fireCallbacks(newConfig ? update.state.doc.toString() : '', newConfig);
      },
    };
  });
}

// ── Hover tooltip — "what was this line before?" ────────────────────────────

interface LineChange {
  /** The previous version of the line (from comparisonText), or '' for a
   *  brand-new line that had no prior counterpart. */
  prevLine: string;
  /** The current line text in the document. */
  curLine: string;
}

/**
 * Reconstruct the previous version of the document line containing `pos`.
 *
 * Walks the same diff the inline decorations use and maps the hovered doc line
 * back to its span in `comparisonText` via each segment's prev offsets, then
 * expands that span to whole comparison line(s). Returns null when the line
 * has no changes (nothing was replaced, so there's nothing to show).
 */
export function lineChangeAt(
  docText: string,
  comparisonText: string,
  pos: number,
  precision: DiffPromptRangeOptions['precision'],
): LineChange | null {
  const segments = diffPromptWithRanges(comparisonText, docText, { precision });

  const lineStart = docText.lastIndexOf('\n', Math.max(0, pos - 1)) + 1;
  const nlIdx = docText.indexOf('\n', pos);
  const lineEnd = nlIdx === -1 ? docText.length : nlIdx;
  const curLine = docText.slice(lineStart, lineEnd);

  let prevMin = Infinity;
  let prevMax = -Infinity;
  let hasChange = false;
  let cursor = 0; // doc-frame cursor, mirrors computeDiff's remove anchoring

  const notePrev = (seg: DiffSegmentWithRange) => {
    if (typeof seg.prevFrom === 'number') prevMin = Math.min(prevMin, seg.prevFrom);
    if (typeof seg.prevTo === 'number') prevMax = Math.max(prevMax, seg.prevTo);
  };

  for (const seg of segments) {
    if (seg.type === 'remove') {
      // Anchored at the current doc cursor; counts for the line it sits in.
      if (cursor >= lineStart && cursor <= lineEnd) {
        hasChange = true;
        notePrev(seg);
      }
      continue;
    }
    const from = seg.from ?? cursor;
    const to = seg.to ?? from;
    cursor = to;
    // Overlaps the hovered line?
    if (to > lineStart && from < lineEnd) {
      notePrev(seg);
      if (seg.type === 'add') hasChange = true;
    }
  }

  if (!hasChange) return null;
  if (prevMin === Infinity || prevMax < prevMin) {
    // Changed line with no prior counterpart (pure insertion).
    return { prevLine: '', curLine };
  }

  const prevStart = comparisonText.lastIndexOf('\n', Math.max(0, prevMin - 1)) + 1;
  const prevNl = comparisonText.indexOf('\n', prevMax);
  const prevEnd = prevNl === -1 ? comparisonText.length : prevNl;
  const prevLine = comparisonText.slice(prevStart, prevEnd);

  // Nothing meaningful to show if the reconstructed previous line is identical.
  if (prevLine === curLine) return null;

  return { prevLine, curLine };
}

const ghostTooltipTheme = EditorView.baseTheme({
  '.cm-ghost-line-tooltip': {
    padding: '6px 9px',
    borderRadius: '8px',
    fontSize: '12px',
    lineHeight: '1.45',
    maxWidth: '420px',
    background: 'rgba(23,23,23,0.96)',
    color: '#e5e5e5',
    border: '1px solid #404040',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    pointerEvents: 'none',
  },
  '.cm-ghost-line-tooltip .cm-ghost-tt-row': {
    display: 'flex',
    gap: '6px',
    fontFamily: 'ui-monospace, monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  '.cm-ghost-line-tooltip .cm-ghost-tt-sign': {
    flexShrink: '0',
    fontWeight: '600',
    userSelect: 'none',
  },
});

function ghostLineHoverTooltip() {
  return hoverTooltip(
    (view, pos): Tooltip | null => {
      const config = view.state.facet(ghostDiffFacet);
      if (!config) return null;

      const change = lineChangeAt(
        view.state.doc.toString(),
        config.comparisonText,
        pos,
        config.precision ?? 'coarse',
      );
      if (!change) return null;

      const line = view.state.doc.lineAt(pos);
      return {
        pos: line.from,
        end: line.to,
        above: true,
        create() {
          const dom = document.createElement('div');
          dom.className = 'cm-ghost-line-tooltip';

          const addRow = (sign: string, text: string, color: string) => {
            const row = document.createElement('div');
            row.className = 'cm-ghost-tt-row';
            const s = document.createElement('span');
            s.className = 'cm-ghost-tt-sign';
            s.textContent = sign;
            s.style.color = color;
            const body = document.createElement('span');
            body.textContent = text.length > 0 ? text : '(empty)';
            row.appendChild(s);
            row.appendChild(body);
            dom.appendChild(row);
          };

          if (change.prevLine === '') {
            const label = document.createElement('div');
            label.style.cssText = 'color:#a0a0a0;margin-bottom:3px;';
            label.textContent = 'New line — no previous version';
            dom.appendChild(label);
            addRow('+', change.curLine, '#4ade80');
          } else {
            addRow('−', change.prevLine, '#f87171');
            addRow('+', change.curLine, '#4ade80');
          }

          const hint = document.createElement('div');
          hint.style.cssText =
            'margin-top:5px;padding-top:4px;border-top:1px solid #404040;color:#8a8a8a;font-size:11px;';
          hint.textContent = 'Click highlighted text to replace · ● to restore';
          dom.appendChild(hint);
          return { dom };
        },
      };
    },
    { hideOnChange: true, hoverTime: 300 },
  );
}

// ── Public API ─────────────────────────────────────────────────────────────

export function ghostDiffExtension(
  config: GhostDiffConfig | null,
  callbacks?: GhostDiffCallbacks,
): Extension {
  const parts: Extension[] = [
    ghostDiffFacet.of(config),
    ghostDiffPlugin,
    ghostLineHoverTooltip(),
    ghostTooltipTheme,
  ];
  if (callbacks) {
    parts.push(ghostDiffCallbackPlugin(callbacks));
  }
  return parts;
}
