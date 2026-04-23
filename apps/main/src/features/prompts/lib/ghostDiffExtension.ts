import { Facet, type Extension, RangeSetBuilder } from '@codemirror/state';
import { Decoration, type DecorationSet, ViewPlugin, type ViewUpdate } from '@codemirror/view';

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
}

interface DiffResult {
  ranges: AddRange[];
  removed: string[];
  suppressed: boolean;
  opacity: number;
}

function computeDiff(docText: string, config: GhostDiffConfig | null): DiffResult {
  const empty: DiffResult = { ranges: [], removed: [], suppressed: false, opacity: 0 };
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
      removed: segments.filter((s) => s.type === 'remove').map((s) => s.text),
      suppressed: true,
      opacity: 0,
    };
  }

  const opacity = ghostOpacity(config.stepDistance);
  if (opacity <= 0) return empty;

  const ranges: AddRange[] = [];
  const removed: string[] = [];

  for (const seg of segments) {
    if (seg.type === 'remove') {
      removed.push(seg.text);
      continue;
    }
    if (
      seg.type === 'add' &&
      typeof seg.from === 'number' &&
      typeof seg.to === 'number' &&
      seg.from < seg.to
    ) {
      ranges.push({ from: seg.from, to: seg.to });
    }
  }

  return { ranges, removed, suppressed: false, opacity };
}

// ── Decoration builder ─────────────────────────────────────────────────────

function buildDecorations(result: DiffResult): DecorationSet {
  if (result.ranges.length === 0 || result.opacity <= 0) {
    return Decoration.none;
  }

  const sorted = [...result.ranges].sort((a, b) => a.from - b.from);
  const builder = new RangeSetBuilder<Decoration>();
  const mark = Decoration.mark({
    attributes: {
      style: `background-color: rgba(34, 197, 94, ${result.opacity}); border-radius: 2px;`,
    },
  });

  for (const { from, to } of sorted) {
    if (from < to) {
      builder.add(from, to, mark);
    }
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
