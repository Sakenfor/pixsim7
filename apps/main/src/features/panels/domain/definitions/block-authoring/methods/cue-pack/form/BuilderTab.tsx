/**
 * BuilderTab
 *
 * Form-driven editor surface over a compiled prompt-pack draft.
 *
 * Two-state lifecycle:
 *   1. Empty / out-of-date  — no compile data yet, or compile output
 *      is stale relative to current source. Builder shows a prompt
 *      to compile first.
 *   2. Loaded               — form state derived from the last
 *      successful compile. Edits stay in local form state; "Apply
 *      to Source" regenerates the entire CUE source and triggers
 *      the parent to save.
 *
 * Caveats surfaced before regeneration:
 *   - CUE definition refs in source (e.g. `#VerticalAngleValues`)
 *     resolve at compile time and the Builder can't recover them.
 *   - Manifest section is preserved verbatim, but only if it could
 *     be extracted from the source via a structural anchor.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { BlockFormCard } from './BlockForm';
import { compiledToForm } from './compiledToForm';
import { generateCueSource } from './cueGenerator';
import { detectCueRefs } from './cueRefs';
import type { BlockForm, BuilderCaveat, PackForm } from './types';

export interface BuilderTabProps {
  /** Most recent compiled pack JSON (from PromptPackCompileResponse.pack_json). */
  compiledPack: Record<string, unknown> | null;
  /** Whether the last compile was OK. Determines whether we have anything to bind. */
  compileOk: boolean;
  /** Current raw CUE source. Used for manifest preservation + ref detection. */
  source: string;
  /** True when source has been edited but not re-compiled. */
  sourceStale: boolean;
  /** Called when the user clicks Apply: produces new CUE source for the parent to save. */
  onApply: (nextSource: string) => Promise<void> | void;
  /** Trigger a fresh compile from the Builder (when stale). */
  onRequestCompile: () => Promise<void> | void;
  /** Disable interaction (e.g. saving/compiling in progress). */
  busy?: boolean;
}

export function BuilderTab({
  compiledPack,
  compileOk,
  source,
  sourceStale,
  onApply,
  onRequestCompile,
  busy,
}: BuilderTabProps) {
  const [form, setForm] = useState<PackForm | null>(null);
  const [dirty, setDirty] = useState(false);

  // Rebuild form state whenever the compile output changes.
  useEffect(() => {
    if (!compileOk || !compiledPack) {
      setForm(null);
      setDirty(false);
      return;
    }
    setForm(compiledToForm(compiledPack, source));
    setDirty(false);
    // We intentionally only re-derive on a fresh compile — typing in
    // the form should not be clobbered by an unrelated `source` change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compiledPack, compileOk]);

  const caveats = useMemo<BuilderCaveat[]>(() => {
    const list: BuilderCaveat[] = [];
    const refDetection = detectCueRefs(source);
    if (refDetection.refs.length > 0) {
      list.push({
        kind: 'cue-refs',
        message: `Source uses ${refDetection.refs.length} CUE definition ref(s): ${refDetection.refs.join(', ')}. Applying from Builder will inline their resolved values and lose the symbolic reference.`,
        lines: refDetection.lines,
      });
    }
    if (form && form.manifestSource === null && /\bmanifest\b/.test(source)) {
      list.push({
        kind: 'manifest-extract-failed',
        message:
          'A manifest section appears in source but could not be cleanly extracted. Applying will drop it. Switch to Source tab to edit manifest directly.',
      });
    }
    return list;
  }, [source, form]);

  const updateForm = useCallback((next: PackForm) => {
    setForm(next);
    setDirty(true);
  }, []);

  const updateBlock = useCallback(
    (index: number, next: BlockForm) => {
      setForm((prev) =>
        prev ? { ...prev, blocks: prev.blocks.map((b, i) => (i === index ? next : b)) } : prev,
      );
      setDirty(true);
    },
    [],
  );

  const removeBlock = useCallback((index: number) => {
    setForm((prev) =>
      prev ? { ...prev, blocks: prev.blocks.filter((_, i) => i !== index) } : prev,
    );
    setDirty(true);
  }, []);

  const addBlock = useCallback(() => {
    setForm((prev) => {
      if (!prev) return prev;
      const usedIds = new Set(prev.blocks.map((b) => b.id));
      let n = prev.blocks.length + 1;
      let candidate = `block_${n}`;
      while (usedIds.has(candidate)) {
        n += 1;
        candidate = `block_${n}`;
      }
      const slug = prev.packageName || 'pack';
      const newBlock: BlockForm = {
        id: candidate,
        idPrefix: `${slug}.${candidate}`,
        mode: 'surface',
        variants: [{ key: 'first', extras: {} }],
        extras: {},
      };
      return { ...prev, blocks: [...prev.blocks, newBlock] };
    });
    setDirty(true);
  }, []);

  const apply = useCallback(async () => {
    if (!form) return;
    const next = generateCueSource(form);
    await onApply(next);
    setDirty(false);
  }, [form, onApply]);

  // ── Render gates ──────────────────────────────────────────────────

  if (!compileOk || !compiledPack) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-xs text-neutral-400 max-w-md">
          The Builder works on the most recent successful compile of your draft.
          Run <span className="text-neutral-200">Compile</span> first to populate
          the form.
        </p>
        <button
          type="button"
          onClick={() => void onRequestCompile()}
          disabled={busy}
          className="text-[11px] px-3 py-1.5 rounded border border-blue-700/60 bg-blue-600/20 text-blue-100 hover:bg-blue-600/30 disabled:opacity-50"
        >
          Run Compile
        </button>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-neutral-500">Loading form…</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header: pack-level fields + apply */}
      <div className="border-b border-neutral-800 px-3 py-2 flex flex-col gap-2 shrink-0">
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] uppercase tracking-wider text-neutral-500">
              package_name
            </label>
            <input
              type="text"
              value={form.packageName}
              onChange={(e) => updateForm({ ...form, packageName: e.target.value })}
              className="text-[11px] font-mono bg-neutral-950 border border-neutral-800 rounded px-1.5 py-0.5 text-neutral-200 focus:outline-none focus:border-neutral-600 w-44"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] uppercase tracking-wider text-neutral-500">
              version
            </label>
            <input
              type="text"
              value={form.version}
              onChange={(e) => updateForm({ ...form, version: e.target.value })}
              className="text-[11px] font-mono bg-neutral-950 border border-neutral-800 rounded px-1.5 py-0.5 text-neutral-200 focus:outline-none focus:border-neutral-600 w-24"
            />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {sourceStale && (
              <span
                className="text-[10px] text-amber-400/80"
                title="Source was edited since the last compile — Builder is showing stale form data"
              >
                stale
              </span>
            )}
            {dirty && <span className="text-[10px] text-amber-400/80">form unsaved</span>}
            <button
              type="button"
              onClick={addBlock}
              disabled={busy}
              className="text-[10px] px-2 py-1 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
            >
              + Block
            </button>
            <button
              type="button"
              onClick={() => void apply()}
              disabled={!dirty || busy}
              className="text-[10px] px-2 py-1 rounded border border-blue-700/60 bg-blue-600/20 text-blue-100 hover:bg-blue-600/30 disabled:opacity-40"
              title="Regenerate CUE source from this form and save to the draft"
            >
              Apply to Source
            </button>
          </div>
        </div>
        {caveats.length > 0 && (
          <div className="flex flex-col gap-1">
            {caveats.map((c, i) => (
              <div
                key={i}
                className="text-[10px] border border-amber-500/40 bg-amber-950/30 text-amber-200 rounded px-2 py-1"
              >
                {c.message}
                {c.lines && c.lines.length > 0 && (
                  <span className="text-amber-400/70 ml-1">
                    (lines {c.lines.slice(0, 6).join(', ')}
                    {c.lines.length > 6 ? '…' : ''})
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Blocks list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 flex flex-col gap-2">
        {form.blocks.length === 0 && (
          <div className="text-[11px] text-neutral-500 italic text-center py-6">
            No blocks. Click <span className="text-neutral-300">+ Block</span> to add one.
          </div>
        )}
        {form.blocks.map((block, idx) => (
          <BlockFormCard
            key={idx}
            block={block}
            onChange={(next) => updateBlock(idx, next)}
            onRemove={() => removeBlock(idx)}
            disabled={busy}
          />
        ))}
      </div>

      {/* Footer hint */}
      <div className="border-t border-neutral-800 px-3 py-1.5 text-[10px] text-neutral-500 shrink-0">
        Advanced fields (op, descriptors, tags, capabilities, ref bindings) are
        preserved opaquely. Edit them in the Source tab.
      </div>
    </div>
  );
}
