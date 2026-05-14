/**
 * CuePackOutline
 *
 * Read-only structural view of a compiled pack — block list with
 * variants, derived from the `blocks_json` returned by the compile
 * endpoint. Acts as the "form view" complement to the raw CUE
 * textarea: users see what they're building without the panel having
 * to parse CUE itself.
 *
 * Form-driven editing of fields lives in v2; for now this surface
 * makes the structure legible and links each block back to its
 * source line via the variant key.
 */

import { useEffect, useMemo, useRef } from 'react';

import { blockIdPrefixMatchesSelection } from './blockMatch';

interface CompiledBlock {
  id?: string;
  block_schema?: {
    id_prefix?: string;
    mode?: string;
    role?: string;
    category?: string;
    variants?: Array<{ key?: string; text?: string }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface CuePackOutlineProps {
  blocks: Array<Record<string, unknown>>;
  /**
   * Fully-qualified block id from `CAP_BLOCK_SELECTION` (e.g.
   * `core.camera.angle.eye_level`). Matched against each compiled
   * block's `id_prefix` so a selection of any variant highlights
   * the parent block.
   */
  highlightId?: string | null;
  onSelectBlock?: (blockId: string) => void;
}

export function CuePackOutline({ blocks, highlightId, onSelectBlock }: CuePackOutlineProps) {
  const parsed = useMemo<CompiledBlock[]>(() => blocks as CompiledBlock[], [blocks]);
  const highlightedRef = useRef<HTMLDivElement | null>(null);

  // Scroll the highlighted card into view when the selection changes.
  useEffect(() => {
    if (!highlightId || !highlightedRef.current) return;
    highlightedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [highlightId]);

  if (parsed.length === 0) {
    return (
      <div className="px-3 py-4 text-[11px] text-neutral-500">
        No blocks compiled yet. Run <span className="text-neutral-300">Compile</span> to populate
        this outline.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 px-2 py-2">
      {parsed.map((block, idx) => {
        const id = block.id ?? `#${idx}`;
        const schema = block.block_schema ?? {};
        const variants = schema.variants ?? [];
        const isHighlighted = blockIdPrefixMatchesSelection(schema.id_prefix, highlightId);
        return (
          <div
            key={id}
            ref={isHighlighted ? highlightedRef : null}
            className={`rounded border px-2 py-1.5 transition ${
              isHighlighted
                ? 'border-blue-500/60 bg-blue-500/5'
                : 'border-neutral-800 bg-neutral-900/40'
            }`}
          >
            <button
              type="button"
              onClick={() => onSelectBlock?.(id)}
              className="w-full text-left"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-mono text-neutral-200">{id}</span>
                {schema.role && (
                  <span className="text-[9px] uppercase tracking-wider text-neutral-500">
                    {schema.role}
                  </span>
                )}
                {schema.category && (
                  <span className="text-[9px] text-neutral-600">/ {schema.category}</span>
                )}
                {schema.mode && schema.mode !== 'surface' && (
                  <span className="ml-auto text-[9px] text-amber-400/80">{schema.mode}</span>
                )}
              </div>
              {schema.id_prefix && (
                <div className="text-[10px] font-mono text-neutral-500 mt-0.5">
                  {schema.id_prefix}
                </div>
              )}
            </button>
            {variants.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {variants.map((v, vIdx) => (
                  <span
                    key={v.key ?? vIdx}
                    className="text-[10px] font-mono text-neutral-400 bg-neutral-800/60 px-1.5 py-0.5 rounded"
                    title={v.text ?? ''}
                  >
                    {v.key ?? `v${vIdx}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
