import { EditorState, Facet, type Extension, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';

import { diffPromptWithRanges, type DiffPromptRangeOptions } from './promptDiff';

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
    root.title = `Removed: ${this.removedText}\\nClick to restore this chunk`;

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

function computeDiff(docText: string, config: GhostDiffConfig | null): DiffResult {
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

function buildDecorations(result: DiffResult): DecorationSet {
  if ((result.ranges.length === 0 && result.removeMarkers.length === 0) || result.opacity <= 0) {
    return Decoration.none;
  }

  const sorted = [...result.ranges].sort((a, b) => a.from - b.from);
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to, compareText } of sorted) {
    if (from < to) {
      const mark = Decoration.mark({
        attributes: {
          class: 'cm-ghost-diff-add',
          style: `background-color: rgba(34, 197, 94, ${result.opacity}); border-radius: 2px; cursor: pointer;`,
          title:
            compareText.length > 0
              ? `Compare: ${compareText}\nClick to replace this chunk`
              : 'Compare: (empty)\nClick to remove this chunk',
          'data-ghost-from': String(from),
          'data-ghost-to': String(to),
          'data-ghost-compare': encodeURIComponent(compareText),
        },
      });
      builder.add(from, to, mark);
    }
  }

  for (const marker of result.removeMarkers) {
    const widget = Decoration.widget({
      widget: new RemoveMarkerWidget(marker.at, marker.text),
      side: -1,
    });
    builder.add(marker.at, marker.at, widget);
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

// ── Public API ─────────────────────────────────────────────────────────────

export function ghostDiffExtension(
  config: GhostDiffConfig | null,
  callbacks?: GhostDiffCallbacks,
): Extension {
  const parts: Extension[] = [
    ghostDiffFacet.of(config),
    ghostDiffPlugin,
  ];
  if (callbacks) {
    parts.push(ghostDiffCallbackPlugin(callbacks));
  }
  return parts;
}
