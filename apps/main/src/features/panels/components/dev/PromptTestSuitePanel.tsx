import { useState, useCallback, useMemo } from 'react';
import { useGenerationSettingsStore } from '@features/generation';
import {
  Badge,
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
} from '@pixsim7/shared.ui';
import { Icon } from '@lib/icons';
import { PromptComposer } from '@features/prompts/components/PromptComposer';

import { resolveRecipe } from '@pixsim7/core.prompt';
import {
  detectPromptSections,
  PATTERN_COLORS,
  type DetectedSection,
  type PatternId,
} from './promptTestSuiteSections';
import {
  buildPositionOptions,
  positionLabel,
  positionToValue,
  serializeVariant,
  valueToPosition,
  type VariantSpec,
} from './promptTestSuiteVariants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CellStatus = 'idle' | 'queued' | 'running' | 'done';
type CellRating = 'idle' | 'partial' | 'worked' | 'glitch' | null;

interface ImageCol {
  id: string;
  label: string;
  thumbnailUrl?: string;
}

/** Matrix selection — ported from BlockMatrixView pattern.
 *  Supports single cell, multi-cell (Ctrl+click), whole row, or whole column. */
type TestMatrixSelection =
  | { kind: 'cell'; cells: Array<{ variantId: string; imageId: string }> }
  | { kind: 'row'; variantId: string }
  | { kind: 'col'; imageId: string }
  | null;

interface CellState {
  status: CellStatus;
  rating: CellRating;
  generationId?: number;
}

// ---------------------------------------------------------------------------
// Seed data (hardcoded scaffold — will be replaced by real state)
// ---------------------------------------------------------------------------

const SEED_VARIANTS: VariantSpec[] = [
  { id: 'v-playing', token: 'PLAYING', position: { mode: 'top' } },
  { id: 'v-distracted', token: 'distracted', position: { mode: 'bottom' } },
];

const SEED_IMAGES: ImageCol[] = [
  { id: 'img-1', label: 'Image A' },
  { id: 'img-2', label: 'Image B' },
  { id: 'img-3', label: 'Image C' },
];

function makeCellKey(variantId: string, imageId: string) {
  return `${variantId}::${imageId}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<CellStatus, string> = {
  idle: 'bg-zinc-800',
  queued: 'bg-amber-900/40',
  running: 'bg-blue-900/40',
  done: 'bg-zinc-800',
};

const RATING_BADGE: Record<NonNullable<CellRating>, { color: 'gray' | 'green' | 'yellow' | 'red'; label: string }> = {
  idle: { color: 'gray', label: 'Idle' },
  partial: { color: 'yellow', label: 'Partial' },
  worked: { color: 'green', label: 'Worked' },
  glitch: { color: 'red', label: 'Glitch' },
};

function CellBadge({ status, rating }: { status: CellStatus; rating: CellRating }) {
  if (status === 'running') return <Badge color="blue">Running</Badge>;
  if (status === 'queued') return <Badge color="yellow">Queued</Badge>;
  if (rating && RATING_BADGE[rating]) {
    const r = RATING_BADGE[rating];
    return <Badge color={r.color as any}>{r.label}</Badge>;
  }
  return <span className="text-zinc-600 text-xs">—</span>;
}

const PATTERN_LABEL: Record<PatternId, string> = {
  colon: ':',
  assignment: '=',
  assignment_arrow: '>',
  angle_bracket: '<>',
  freestanding: '•',
};

function SectionChip({ section }: { section: DetectedSection }) {
  const color = PATTERN_COLORS[section.patternId];
  return (
    <Tooltip content={`${section.patternId} · ${section.bodyRange[1] - section.bodyRange[0]} chars body`}>
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono"
        style={{ borderColor: color + '55', color, background: color + '14' }}
      >
        <span className="opacity-60">{PATTERN_LABEL[section.patternId]}</span>
        {section.label}
      </span>
    </Tooltip>
  );
}


// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function PromptTestSuitePanel() {
  const [basePrompt, setBasePrompt] = useState('');
  const [variants, setVariants] = useState<VariantSpec[]>(SEED_VARIANTS);
  const [images] = useState<ImageCol[]>(SEED_IMAGES);
  const [cells, setCells] = useState<Record<string, CellState>>({});
  const [selection, setSelection] = useState<TestMatrixSelection>(null);
  const [newToken, setNewToken] = useState('');
  const [previewVariantId, setPreviewVariantId] = useState<string | null>(null);

  // Inherit operation/model context from quickgen settings.
  const operationType = useGenerationSettingsStore((s) => s.activeOperationType);
  const modelId       = useGenerationSettingsStore((s) => s.params?.model as string | undefined);
  const providerId    = useGenerationSettingsStore((s) => s.providerId);

  const recipe = useMemo(
    () => resolveRecipe({ operation_type: operationType, model_id: modelId, provider_id: providerId }),
    [operationType, modelId, providerId],
  );

  const runContextSeed = useMemo(
    () => ({ operation_type: operationType, model_id: modelId, provider_id: providerId }),
    [operationType, modelId, providerId],
  );

  // Selection helpers
  const isCellSelected = useCallback(
    (vId: string, iId: string) => {
      if (selection?.kind !== 'cell') return false;
      return selection.cells.some((c) => c.variantId === vId && c.imageId === iId);
    },
    [selection],
  );
  const isRowSelected = useCallback(
    (vId: string) => selection?.kind === 'row' && selection.variantId === vId,
    [selection],
  );
  const isColSelected = useCallback(
    (iId: string) => selection?.kind === 'col' && selection.imageId === iId,
    [selection],
  );
  const isInSelectedAxis = useCallback(
    (vId: string, iId: string) => {
      if (selection?.kind === 'row' && selection.variantId === vId) return true;
      if (selection?.kind === 'col' && selection.imageId === iId) return true;
      return false;
    },
    [selection],
  );

  // Single selected cell (for rating pane — only when exactly one cell selected)
  const singleSelectedCellKey = useMemo(() => {
    if (selection?.kind !== 'cell') return null;
    if (selection.cells.length !== 1) return null;
    const c = selection.cells[0];
    return makeCellKey(c.variantId, c.imageId);
  }, [selection]);

  const handleCellClick = useCallback((vId: string, iId: string, ctrlKey: boolean) => {
    setSelection((prev) => {
      if (ctrlKey && prev?.kind === 'cell') {
        const idx = prev.cells.findIndex((c) => c.variantId === vId && c.imageId === iId);
        if (idx >= 0) {
          const next = prev.cells.filter((_, i) => i !== idx);
          return next.length > 0 ? { kind: 'cell', cells: next } : null;
        }
        return { kind: 'cell', cells: [...prev.cells, { variantId: vId, imageId: iId }] };
      }
      // Regular click toggles single-cell selection
      if (prev?.kind === 'cell' && prev.cells.length === 1) {
        const c = prev.cells[0];
        if (c.variantId === vId && c.imageId === iId) return null;
      }
      return { kind: 'cell', cells: [{ variantId: vId, imageId: iId }] };
    });
  }, []);

  const handleRowClick = useCallback((vId: string) => {
    setSelection((prev) =>
      prev?.kind === 'row' && prev.variantId === vId ? null : { kind: 'row', variantId: vId },
    );
  }, []);

  const handleColClick = useCallback((iId: string) => {
    setSelection((prev) =>
      prev?.kind === 'col' && prev.imageId === iId ? null : { kind: 'col', imageId: iId },
    );
  }, []);

  // Detect sections in the base prompt (client-side, instant feedback).
  // Uses the active recipe so pattern selection follows the current operation.
  const sections: DetectedSection[] = useMemo(
    () => detectPromptSections(basePrompt, recipe),
    [basePrompt, recipe],
  );


  const getCell = useCallback(
    (vId: string, iId: string): CellState =>
      cells[makeCellKey(vId, iId)] ?? { status: 'idle', rating: null },
    [cells],
  );

  const rateCell = useCallback(
    (key: string, rating: CellRating) => {
      setCells((prev) => ({
        ...prev,
        [key]: { ...(prev[key] ?? { status: 'done', rating: null }), rating },
      }));
    },
    [],
  );

  const selectionSummary = useMemo(() => {
    if (!selection) return null;
    if (selection.kind === 'cell') {
      if (selection.cells.length === 1) return null; // rating pane handles this
      return `${selection.cells.length} cells selected`;
    }
    if (selection.kind === 'row') {
      const variant = variants.find((v) => v.id === selection.variantId);
      return `Row: ${variant?.token ?? '?'} (${images.length} cells)`;
    }
    const image = images.find((i) => i.id === selection.imageId);
    return `Column: ${image?.label ?? '?'} (${variants.length} cells)`;
  }, [selection, variants, images]);

  const positionOptions = useMemo(() => buildPositionOptions(sections), [sections]);

  const updateVariant = useCallback((id: string, patch: Partial<VariantSpec>) => {
    setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }, []);

  const addVariant = useCallback(() => {
    const token = newToken.trim();
    if (!token) return;
    setVariants((prev) => [
      ...prev,
      { id: `v-${Date.now()}`, token, position: { mode: 'top' } },
    ]);
    setNewToken('');
  }, [newToken]);

  const removeVariant = useCallback((id: string) => {
    setVariants((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const previewPrompt = useMemo(() => {
    if (!previewVariantId) return null;
    const variant = variants.find((v) => v.id === previewVariantId);
    if (!variant) return null;
    return serializeVariant(basePrompt, sections, variant);
  }, [previewVariantId, variants, basePrompt, sections]);

  return (
    <div className="flex flex-col h-full overflow-hidden text-sm">
      {/* ---- Toolbar ---- */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 shrink-0">
        <Icon name="flask" size={14} className="text-zinc-400" />
        <span className="font-medium text-zinc-200">Prompt Test Suite</span>
        <span className="text-zinc-600 text-xs ml-1">
          {variants.length} variants × {images.length} images
        </span>
        <div className="flex-1" />
        <Tooltip content="Add image column (pick from gallery)">
          <Button size="sm" variant="ghost" disabled>
            <Icon name="image" size={13} /> + Image
          </Button>
        </Tooltip>
        <Tooltip content="Run all cells">
          <Button size="sm" variant="ghost" disabled>
            <Icon name="play" size={13} /> Run All
          </Button>
        </Tooltip>
      </div>

      {/* ---- Base prompt ---- */}
      <div className="px-3 py-2 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-medium text-zinc-400">Base prompt</span>
          {sections.length > 0 && (
            <span className="text-[10px] text-zinc-500">
              {sections.length} block{sections.length === 1 ? '' : 's'} detected
            </span>
          )}
        </div>
        <PromptComposer
          value={basePrompt}
          onChange={setBasePrompt}
          placeholder="Paste or build prompt — sections (CAMERA:, ACTOR1 =, >HEADER<) are detected as blocks and available as position targets below."
          minHeight={80}
          maxChars={8000}
          showCounter={false}
          historyScopeKey="prompt-test-suite"
          runContextSeed={runContextSeed}
        />
        {sections.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {sections.map((s, i) => (
              <SectionChip key={`${s.label}-${i}`} section={s} />
            ))}
          </div>
        )}
      </div>

      {/* ---- Matrix ---- */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Token</TableHead>
              <TableHead className="w-48">Position</TableHead>
              {images.map((img) => {
                const colSel = isColSelected(img.id);
                return (
                  <TableHead
                    key={img.id}
                    className={`min-w-[120px] text-center cursor-pointer select-none transition-colors ${
                      colSel ? 'bg-blue-900/30 ring-1 ring-blue-500/50' : 'hover:bg-zinc-800/60'
                    }`}
                    onClick={() => handleColClick(img.id)}
                  >
                    {img.thumbnailUrl ? (
                      <img
                        src={img.thumbnailUrl}
                        alt={img.label}
                        className="w-16 h-10 object-cover rounded mx-auto mb-1 pointer-events-none"
                      />
                    ) : (
                      <div className="w-16 h-10 bg-zinc-800 rounded mx-auto mb-1 flex items-center justify-center">
                        <Icon name="image" size={14} className="text-zinc-600" />
                      </div>
                    )}
                    <span className="text-xs text-zinc-400">{img.label}</span>
                  </TableHead>
                );
              })}
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((v) => {
              const positionValid =
                v.position.mode === 'top' ||
                v.position.mode === 'bottom' ||
                (v.position.ref && sections.some((s) => s.label === v.position.ref));
              const rowSel = isRowSelected(v.id);
              return (
                <TableRow
                  key={v.id}
                  className={rowSel ? 'bg-blue-900/20 ring-1 ring-blue-500/40' : ''}
                >
                  <TableCell>
                    <input
                      value={v.token}
                      onChange={(e) => updateVariant(v.id, { token: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 px-1.5 py-0.5 focus:outline-none focus:border-zinc-500 font-mono"
                    />
                  </TableCell>
                  <TableCell>
                    <select
                      value={positionToValue(v.position)}
                      onChange={(e) =>
                        updateVariant(v.id, { position: valueToPosition(e.target.value) })
                      }
                      className={`w-full bg-zinc-800 border rounded text-xs px-1.5 py-0.5 focus:outline-none focus:border-zinc-500 ${
                        positionValid ? 'border-zinc-700 text-zinc-200' : 'border-red-700/50 text-red-300'
                      }`}
                    >
                      {positionOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  {images.map((img) => {
                    const key = makeCellKey(v.id, img.id);
                    const cell = getCell(v.id, img.id);
                    const cellSel = isCellSelected(v.id, img.id);
                    const axisHighlight = isInSelectedAxis(v.id, img.id);
                    return (
                      <TableCell
                        key={key}
                        className={`text-center cursor-pointer transition-colors ${STATUS_COLORS[cell.status]} ${
                          cellSel ? 'ring-1 ring-blue-500' : ''
                        } ${axisHighlight ? 'bg-blue-900/20' : ''}`}
                        onClick={(e) => handleCellClick(v.id, img.id, e.ctrlKey || e.metaKey)}
                      >
                        <CellBadge status={cell.status} rating={cell.rating} />
                      </TableCell>
                    );
                  })}
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Tooltip content="Select entire row">
                        <button
                          className={`transition-colors ${
                            rowSel ? 'text-blue-400' : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                          onClick={() => handleRowClick(v.id)}
                        >
                          <Icon name="arrowRight" size={12} />
                        </button>
                      </Tooltip>
                      <Tooltip content="Preview serialized prompt">
                        <button
                          className={`transition-colors ${
                            previewVariantId === v.id ? 'text-blue-400' : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                          onClick={() =>
                            setPreviewVariantId(previewVariantId === v.id ? null : v.id)
                          }
                        >
                          <Icon name="eye" size={12} />
                        </button>
                      </Tooltip>
                      <Tooltip content="Delete variant">
                        <button
                          className="text-zinc-500 hover:text-red-400 transition-colors"
                          onClick={() => removeVariant(v.id)}
                        >
                          <Icon name="trash" size={12} />
                        </button>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* ---- Add variant row ---- */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-zinc-800 shrink-0">
        <Input
          value={newToken}
          onChange={(e) => setNewToken(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addVariant();
          }}
          placeholder="Add variant token…"
          className="h-7 text-xs w-64"
        />
        <Button size="sm" variant="ghost" disabled={!newToken.trim()} onClick={addVariant}>
          <Icon name="plus" size={12} /> Add variant
        </Button>
        <span className="text-[10px] text-zinc-600 ml-2">
          Tip: position defaults to Top — adjust per row.
        </span>
      </div>

      {/* ---- Preview pane ---- */}
      {previewPrompt !== null && (
        <div className="border-t border-zinc-800 px-3 py-2 shrink-0 bg-zinc-900/50 max-h-56 overflow-auto">
          <div className="flex items-center gap-2 mb-1">
            <Icon name="eye" size={12} className="text-blue-400" />
            <span className="text-xs text-zinc-400">
              Preview:{' '}
              <span className="text-zinc-200 font-mono">
                {variants.find((v) => v.id === previewVariantId)?.token}
              </span>
              <span className="text-zinc-500 mx-1">@</span>
              <span className="text-zinc-300">
                {positionLabel(variants.find((v) => v.id === previewVariantId)!.position)}
              </span>
            </span>
            <div className="flex-1" />
            <button
              onClick={() => setPreviewVariantId(null)}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <Icon name="close" size={11} />
            </button>
          </div>
          <pre className="text-[11px] text-zinc-300 whitespace-pre-wrap font-mono leading-snug">
            {previewPrompt}
          </pre>
        </div>
      )}

      {/* ---- Selection summary (row/col/multi-cell) ---- */}
      {selectionSummary && (
        <div className="flex items-center gap-2 px-3 py-1.5 shrink-0 border-t border-zinc-800 bg-blue-950/20 text-xs">
          <Icon name="check" size={11} className="text-blue-400" />
          <span className="text-blue-300">{selectionSummary}</span>
          <div className="flex-1" />
          <button
            onClick={() => setSelection(null)}
            className="text-zinc-400 hover:text-zinc-200 text-[11px]"
          >
            Clear
          </button>
        </div>
      )}

      {/* ---- Detail / rating pane (single cell only) ---- */}
      {singleSelectedCellKey && (
        <div className="border-t border-zinc-800 px-3 py-3 shrink-0 bg-zinc-900/50">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-zinc-400">Rate result:</span>
            {(['idle', 'partial', 'worked', 'glitch'] as CellRating[]).map(
              (r) =>
                r && (
                  <button
                    key={r}
                    onClick={() => rateCell(singleSelectedCellKey, r)}
                    className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                      cells[singleSelectedCellKey]?.rating === r
                        ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                        : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    {RATING_BADGE[r].label}
                  </button>
                ),
            )}
          </div>
          <textarea
            placeholder="Notes…"
            rows={2}
            className="w-full bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 px-2 py-1 resize-none focus:outline-none focus:border-zinc-500"
          />
        </div>
      )}
    </div>
  );
}
