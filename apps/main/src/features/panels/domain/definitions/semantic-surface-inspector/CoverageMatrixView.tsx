/**
 * CoverageMatrixView - 2D heatmap of primitive coverage against ontology namespaces.
 *
 * Rows = primitive grouping (pack or category), cols = ontology namespace.
 * Each cell shows how many primitives in `row` carry at least one ontology_id
 * in namespace `col`, alongside the row total. Color scale is INVERTED vs
 * BlockMatrixView: low / zero coverage cells pop red/amber so gaps are
 * visually obvious; full coverage fades to emerald.
 *
 * Visual layout mirrors `BlockMatrixView`'s MatrixGrid (sticky headers,
 * row/col totals, inline distribution bars) so the dev surface has a
 * consistent feel.
 */
import clsx from 'clsx';
import { useEffect, useState } from 'react';

import {
  getSemanticSurfaceCoverageMatrix,
  type CoverageCell,
  type CoverageMatrixResponse,
  type CoverageRowAxis,
} from '@lib/api/semanticSurface';
import { Icon } from '@lib/icons';


const ROW_AXIS_OPTIONS: Array<{ value: CoverageRowAxis; label: string }> = [
  { value: 'category', label: 'Category' },
  { value: 'pack', label: 'Pack' },
];

function coverageClass(ratio: number, total: number): string {
  if (total === 0) return 'bg-neutral-800/30 text-neutral-600';
  if (ratio === 0) return 'bg-rose-900/40 text-rose-300';
  if (ratio < 0.25) return 'bg-amber-900/40 text-amber-300';
  if (ratio < 0.6) return 'bg-amber-900/20 text-amber-400';
  if (ratio < 0.95) return 'bg-emerald-900/30 text-emerald-300';
  return 'bg-emerald-800/50 text-emerald-200';
}

function ratioPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export function CoverageMatrixView() {
  const [rowAxis, setRowAxis] = useState<CoverageRowAxis>('category');
  const [data, setData] = useState<CoverageMatrixResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<CoverageCell | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setSelectedCell(null);
    void (async () => {
      try {
        const result = await getSemanticSurfaceCoverageMatrix({ row_axis: rowAxis });
        if (!alive) return;
        setData(result);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'Failed to load coverage matrix');
        setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [rowAxis]);

  const cellAt = new Map<string, CoverageCell>();
  if (data) {
    for (const cell of data.cells) {
      cellAt.set(`${cell.row}|${cell.col}`, cell);
    }
  }

  const overallRatio = data && data.grand_total > 0
    ? data.cells.reduce((sum, c) => sum + c.matched_count, 0) /
      Math.max(1, data.grand_total * data.cols.length)
    : 0;

  return (
    <div className="flex flex-col h-full min-h-0 bg-neutral-900">
      {/* Header */}
      <div className="px-3 py-2 border-b border-neutral-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Icon name="grid" size={14} className="text-neutral-400" />
          <span className="text-sm font-medium text-neutral-200">Semantic Surface Coverage</span>
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-neutral-400">
          Rows
          <select
            value={rowAxis}
            onChange={(e) => setRowAxis(e.target.value as CoverageRowAxis)}
            className="px-1.5 py-0.5 rounded border border-neutral-700 bg-neutral-800 text-neutral-200 text-[11px] outline-none"
          >
            {ROW_AXIS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Matrix grid */}
      <div className="flex-1 min-h-0 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs text-neutral-500">Loading coverage matrix...</span>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs text-red-400">{error}</span>
          </div>
        )}
        {!loading && !error && data && data.rows.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs text-neutral-500">No primitives discovered</span>
          </div>
        )}
        {!loading && !error && data && data.rows.length > 0 && (
          <CoverageGrid
            data={data}
            cellAt={cellAt}
            selectedCell={selectedCell}
            onCellClick={setSelectedCell}
          />
        )}
      </div>

      {/* Selected cell detail */}
      {selectedCell && (
        <CellDetail cell={selectedCell} onClose={() => setSelectedCell(null)} />
      )}

      {/* Footer stats */}
      {data && !loading && (
        <div className="px-3 py-1 border-t border-neutral-800 text-[10px] text-neutral-500 flex items-center gap-3 shrink-0">
          <span>{data.grand_total} primitives</span>
          <span>{data.rows.length} {rowAxis === 'pack' ? 'packs' : 'categories'}</span>
          <span>{data.cols.length} namespaces</span>
          <span className="text-neutral-400">overall: {ratioPct(overallRatio)}</span>
          {data.skipped_packs.length > 0 && (
            <span className="text-amber-400" title={data.skipped_packs.map((s) => `${s.pack}: ${s.error}`).join('\n')}>
              {data.skipped_packs.length} skipped
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function CoverageGrid({
  data,
  cellAt,
  selectedCell,
  onCellClick,
}: {
  data: CoverageMatrixResponse;
  cellAt: Map<string, CoverageCell>;
  selectedCell: CoverageCell | null;
  onCellClick: (cell: CoverageCell) => void;
}) {
  return (
    <div className="inline-block min-w-full">
      <table className="border-collapse text-[11px]">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-20 bg-neutral-900 border-b border-r border-neutral-700 px-2 py-1.5 text-left">
              <div className="text-[9px] text-neutral-500 font-normal">
                <span>{data.row_axis}</span>
                <span className="mx-1">/</span>
                <span>{data.col_axis}</span>
              </div>
            </th>
            {data.cols.map((col) => (
              <th
                key={col}
                className="sticky top-0 z-10 bg-neutral-900 border-b border-neutral-700 px-2 py-1.5 text-center font-medium text-neutral-300 whitespace-nowrap"
                title={`${col} — ${data.col_totals[col] ?? 0} primitive(s) carry an ontology_id in this namespace`}
              >
                <div>{col}</div>
                <div className="text-[9px] text-neutral-500 font-normal mt-0.5">
                  {data.col_totals[col] ?? 0}
                </div>
              </th>
            ))}
            <th className="sticky top-0 z-10 bg-neutral-900 border-b border-l border-neutral-700 px-2 py-1.5 text-center font-medium text-neutral-500 whitespace-nowrap text-[10px]">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => {
            const rowTotal = data.row_totals[row] ?? 0;
            return (
              <tr key={row}>
                <td
                  className="sticky left-0 z-10 bg-neutral-900 border-r border-neutral-700 px-2 py-1 font-medium text-neutral-300 whitespace-nowrap"
                  title={`${row} — ${rowTotal} primitive(s)`}
                >
                  {row}
                </td>
                {data.cols.map((col) => {
                  const cell = cellAt.get(`${row}|${col}`);
                  const matched = cell?.matched_count ?? 0;
                  const ratio = cell?.ratio ?? 0;
                  const isSelected =
                    selectedCell?.row === row && selectedCell?.col === col;
                  return (
                    <td
                      key={col}
                      onClick={() => cell && onCellClick(cell)}
                      className={clsx(
                        'px-2 py-1 text-center cursor-pointer transition-colors border border-neutral-800/50 tabular-nums min-w-[50px]',
                        coverageClass(ratio, rowTotal),
                        isSelected && 'ring-1 ring-blue-500 ring-inset',
                      )}
                      title={`${row} / ${col}: ${matched}/${rowTotal} (${ratioPct(ratio)})`}
                    >
                      {rowTotal > 0 ? (
                        <div className="flex flex-col leading-tight">
                          <span>{matched}</span>
                          <span className="text-[9px] opacity-70">{ratioPct(ratio)}</span>
                        </div>
                      ) : (
                        <span className="text-neutral-700">-</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-center border-l border-neutral-700 tabular-nums text-[10px] text-neutral-400 font-medium">
                  {rowTotal}
                </td>
              </tr>
            );
          })}
          <tr>
            <td className="sticky left-0 z-10 bg-neutral-900 border-r border-t border-neutral-700 px-2 py-1 text-[10px] text-neutral-500 font-medium whitespace-nowrap">
              Total
            </td>
            {data.cols.map((col) => (
              <td
                key={col}
                className="px-2 py-1 text-center border-t border-neutral-700 tabular-nums text-[10px] text-neutral-400 font-medium"
              >
                {data.col_totals[col] ?? 0}
              </td>
            ))}
            <td className="px-2 py-1 text-center border-t border-l border-neutral-700 tabular-nums text-[10px] text-neutral-300 font-semibold">
              {data.grand_total}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CellDetail({
  cell,
  onClose,
}: {
  cell: CoverageCell;
  onClose: () => void;
}) {
  return (
    <div className="shrink-0 max-h-[35%] overflow-y-auto px-3 py-2 border-t border-neutral-800">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[11px] font-medium text-neutral-200">
          {cell.row} / {cell.col}
        </span>
        <span className="text-[10px] text-neutral-500">
          {cell.matched_count}/{cell.total} primitives match this namespace ({ratioPct(cell.ratio)})
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 rounded text-neutral-500 hover:text-neutral-300"
        >
          <Icon name="x" size={12} />
        </button>
      </div>

      {cell.samples.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {cell.samples.map((s) => (
            <div
              key={s.block_id}
              className="text-left p-1.5 rounded border border-neutral-700/50 max-w-[280px]"
            >
              <div className="text-[10px] text-neutral-200 font-mono truncate">{s.block_id}</div>
              {s.text_preview && (
                <div className="text-[10px] text-neutral-400 mt-0.5 line-clamp-2 leading-tight italic">
                  {s.text_preview}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[10px] text-amber-500/70 p-2 rounded border border-amber-800/30 bg-amber-900/10">
          No primitives in this {cell.row} carry an ontology_id in the {cell.col} namespace.
        </div>
      )}
    </div>
  );
}
