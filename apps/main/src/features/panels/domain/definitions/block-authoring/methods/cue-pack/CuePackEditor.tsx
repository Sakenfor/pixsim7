/**
 * CuePackEditor
 *
 * The CUE pack authoring method's editor surface.
 *
 * Layout:
 *   [drafts list] | [editor (Source / Outline tabs) + diagnostics]
 *
 * All persistence goes through the existing prompt-pack drafts API
 * (apps/main/src/lib/api/promptPacks.ts). No new backend endpoints
 * are added in v1; the panel is purely a UI over existing services.
 *
 * Form-driven editing of #BlockSchema fields lives in v2 — for now
 * users edit the raw CUE source with parsed outline + diagnostics
 * for feedback. This matches the scope agreed for v1: "form fallback
 * for advanced fields", surfaced via the Source tab.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  compilePromptPackDraft,
  createPromptPackDraft,
  listPromptPackDrafts,
  replacePromptPackDraftSource,
  validatePromptPackDraft,
  type PromptPackCompileResponse,
  type PromptPackDraft,
} from '@lib/api/promptPacks';
import { DraftsList } from '@lib/ui/promptPacks';

import type { BlockAuthoringMethodProps } from '../types';

import { CueDiagnostics } from './CueDiagnostics';
import { CuePackOutline } from './CuePackOutline';
import { VersionsTab } from './VersionsTab';
import { findSelectionAnchor, offsetToLineColumn } from './blockMatch';
import { BuilderTab } from './form/BuilderTab';
import { buildStarterCueSource } from './starterTemplate';

type EditorTab = 'source' | 'builder' | 'outline' | 'versions';

interface CompileSnapshot {
  ok: boolean;
  status: string;
  diagnostics: Array<Record<string, unknown>>;
  blocks: Array<Record<string, unknown>>;
  /** Resolved `pack:` expression — feeds the Builder form. */
  pack: Record<string, unknown> | null;
  /** The source string that produced this snapshot, for staleness. */
  compiledSource: string | null;
  compiledAt?: string | null;
}

function snapshotFromResponse(
  res: PromptPackCompileResponse,
  compiledSource: string,
): CompileSnapshot {
  return {
    ok: res.ok,
    status: res.status,
    diagnostics: res.diagnostics ?? [],
    blocks: res.blocks_json ?? [],
    pack: res.pack_json ?? null,
    compiledSource,
    compiledAt: res.compiled_at ?? null,
  };
}

function snapshotFromDraft(draft: PromptPackDraft): CompileSnapshot {
  return {
    ok: draft.last_compile_status === 'compile_ok',
    status: draft.last_compile_status ?? 'unknown',
    diagnostics: draft.last_compile_errors ?? [],
    blocks: [],
    pack: null,
    compiledSource: null,
    compiledAt: draft.last_compiled_at ?? null,
  };
}

export function CuePackEditor({ context }: BlockAuthoringMethodProps) {
  const [drafts, setDrafts] = useState<PromptPackDraft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PromptPackDraft | null>(null);
  const [source, setSource] = useState<string>('');
  const [tab, setTab] = useState<EditorTab>('source');
  const [snapshot, setSnapshot] = useState<CompileSnapshot | null>(null);
  const [busy, setBusy] = useState<'idle' | 'loading' | 'saving' | 'validating' | 'compiling' | 'creating'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const sourceRef = useRef<HTMLTextAreaElement | null>(null);

  // ── Load drafts list ──────────────────────────────────────────────
  const reloadDrafts = useCallback(async () => {
    setBusy('loading');
    setError(null);
    try {
      const list = await listPromptPackDrafts({ mine: true });
      setDrafts(list);
      // Auto-select first draft if none selected
      if (!selectedId && list.length > 0) {
        setSelectedId(list[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load drafts');
    } finally {
      setBusy('idle');
    }
  }, [selectedId]);

  useEffect(() => {
    void reloadDrafts();
    // run once on mount; reloadDrafts is stable enough for v1
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Bind selected draft to editor state ───────────────────────────
  useEffect(() => {
    if (!selectedId) {
      setDraft(null);
      setSource('');
      setSnapshot(null);
      setDirty(false);
      return;
    }
    const found = drafts.find((d) => d.id === selectedId) ?? null;
    setDraft(found);
    setSource(found?.cue_source ?? '');
    setSnapshot(found ? snapshotFromDraft(found) : null);
    setDirty(false);
  }, [selectedId, drafts]);

  // ── Actions ───────────────────────────────────────────────────────
  const saveSource = useCallback(async () => {
    if (!draft) return;
    setBusy('saving');
    setError(null);
    try {
      const updated = await replacePromptPackDraftSource(draft.id, source);
      setDrafts((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setDraft(updated);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy('idle');
    }
  }, [draft, source]);

  const validate = useCallback(async () => {
    if (!draft) return;
    if (dirty) {
      await saveSource();
    }
    setBusy('validating');
    setError(null);
    try {
      const res = await validatePromptPackDraft(draft.id);
      // Validate doesn't return pack_json/blocks — preserve any prior
      // compile output so the Builder/Outline tabs don't go blank.
      setSnapshot((prev) => {
        const fresh = snapshotFromResponse(res, source);
        return {
          ...fresh,
          blocks: prev?.blocks ?? fresh.blocks,
          pack: prev?.pack ?? fresh.pack,
          compiledSource: prev?.compiledSource ?? null,
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validate failed');
    } finally {
      setBusy('idle');
    }
  }, [draft, dirty, saveSource, source]);

  const compile = useCallback(async () => {
    if (!draft) return;
    if (dirty) {
      await saveSource();
    }
    setBusy('compiling');
    setError(null);
    try {
      const res = await compilePromptPackDraft(draft.id);
      setSnapshot(snapshotFromResponse(res, source));
      // Auto-switch to Outline on first successful compile so users
      // can immediately see structural output. Builder is opt-in.
      if (res.ok && (res.blocks_json?.length ?? 0) > 0 && tab === 'source') {
        setTab('outline');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compile failed');
    } finally {
      setBusy('idle');
    }
  }, [draft, dirty, saveSource, source, tab]);

  const applyBuilderSource = useCallback(
    async (nextSource: string) => {
      if (!draft) return;
      setBusy('saving');
      setError(null);
      try {
        const updated = await replacePromptPackDraftSource(draft.id, nextSource);
        setDrafts((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
        setDraft(updated);
        setSource(nextSource);
        setDirty(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Apply failed');
      } finally {
        setBusy('idle');
      }
    },
    [draft],
  );

  const createDraft = useCallback(async () => {
    const slug = window.prompt('Pack slug (lowercase, snake_case):', 'my_pack');
    if (!slug) return;
    const trimmed = slug.trim();
    if (!/^[a-z][a-z0-9_]*$/.test(trimmed)) {
      setError('Slug must match ^[a-z][a-z0-9_]*$');
      return;
    }
    setBusy('creating');
    setError(null);
    try {
      const created = await createPromptPackDraft({
        pack_slug: trimmed,
        cue_source: buildStarterCueSource(trimmed),
      });
      setDrafts((prev) => [created, ...prev]);
      setSelectedId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy('idle');
    }
  }, []);

  const onSourceChange = useCallback((value: string) => {
    setSource(value);
    setDirty(true);
  }, []);

  const jumpToLine = useCallback((line: number, column: number) => {
    setTab('source');
    queueMicrotask(() => {
      const ta = sourceRef.current;
      if (!ta) return;
      const lines = ta.value.split('\n');
      let pos = 0;
      for (let i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
      pos += Math.max(0, column - 1);
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  }, []);

  // ── Source-tab reaction to CAP_BLOCK_SELECTION ─────────────────────
  // When a block is selected (in Block Explorer or any other provider)
  // and the user is on the Source tab, select the matching id_prefix
  // substring so the textarea scrolls + visually flags it. Doesn't
  // auto-switch tabs — we respect the user's current view choice.
  // We intentionally don't depend on `source`, so typing in the
  // textarea doesn't keep yanking the cursor back to the selection.
  useEffect(() => {
    if (tab !== 'source') return;
    const sel = context.selectedBlockId;
    if (!sel) return;
    const ta = sourceRef.current;
    if (!ta) return;
    const anchor = findSelectionAnchor(ta.value, sel);
    if (!anchor) return;
    ta.focus();
    ta.setSelectionRange(anchor.offset, anchor.offset + anchor.matched.length);
    const { line } = offsetToLineColumn(ta.value, anchor.offset);
    // Approximate scroll: place the matched line near the top by
    // setting scrollTop in terms of average line height.
    const lineHeight = ta.scrollHeight / Math.max(1, ta.value.split('\n').length);
    ta.scrollTop = Math.max(0, (line - 3) * lineHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.selectedBlockId, tab]);

  // ── Filter drafts by Block Explorer selection (best-effort) ───────
  // If the user selects a block in the embedded Explorer, prefer the
  // draft whose source mentions that id_prefix. Non-binding hint only.
  const highlightDraftId = useMemo(() => {
    const sel = context.selectedBlockId;
    if (!sel) return null;
    const match = drafts.find((d) => d.cue_source?.includes(sel));
    return match?.id ?? null;
  }, [context.selectedBlockId, drafts]);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="h-full flex bg-neutral-900">
      {/* Drafts sidebar */}
      <div className="w-52 shrink-0 flex flex-col border-r border-neutral-800">
        <div className="px-2 py-2 border-b border-neutral-800 flex items-center gap-2">
          <h3 className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider flex-1">
            My Packs
          </h3>
          <button
            type="button"
            onClick={createDraft}
            disabled={busy === 'creating'}
            className="text-[10px] px-1.5 py-0.5 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
            title="Create a new draft from a starter template"
          >
            + New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          <DraftsList
            drafts={drafts}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={busy === 'loading' && drafts.length === 0}
            highlightId={highlightDraftId}
            compact
            emptyMessage="No drafts yet. Click + New to start."
          />
        </div>
      </div>

      {/* Editor + diagnostics */}
      <div className="flex-1 flex flex-col min-w-0">
        {!draft ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-neutral-500">
              {drafts.length === 0 ? 'Create a draft to begin authoring.' : 'Select a draft.'}
            </p>
          </div>
        ) : (
          <>
            {/* Tab strip + actions */}
            <div className="border-b border-neutral-800 flex items-center gap-1 px-2 py-1.5">
              <button
                type="button"
                onClick={() => setTab('source')}
                className={`text-[11px] px-2 py-1 rounded ${
                  tab === 'source'
                    ? 'bg-neutral-800 text-neutral-100'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Source (CUE)
              </button>
              <button
                type="button"
                onClick={() => setTab('builder')}
                className={`text-[11px] px-2 py-1 rounded ${
                  tab === 'builder'
                    ? 'bg-neutral-800 text-neutral-100'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
                title="Form-driven editor over the last compiled pack"
              >
                Builder
              </button>
              <button
                type="button"
                onClick={() => setTab('outline')}
                className={`text-[11px] px-2 py-1 rounded ${
                  tab === 'outline'
                    ? 'bg-neutral-800 text-neutral-100'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Outline
              </button>
              <button
                type="button"
                onClick={() => setTab('versions')}
                className={`text-[11px] px-2 py-1 rounded ${
                  tab === 'versions'
                    ? 'bg-neutral-800 text-neutral-100'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
                title="Snapshots, publication, and activation for this draft"
              >
                Versions
              </button>
              <div className="ml-auto flex items-center gap-1">
                {dirty && (
                  <span className="text-[10px] text-amber-400/80 mr-1">unsaved</span>
                )}
                <button
                  type="button"
                  onClick={() => void saveSource()}
                  disabled={!dirty || busy !== 'idle'}
                  className="text-[10px] px-2 py-1 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => void validate()}
                  disabled={busy !== 'idle'}
                  className="text-[10px] px-2 py-1 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
                >
                  Validate
                </button>
                <button
                  type="button"
                  onClick={() => void compile()}
                  disabled={busy !== 'idle'}
                  className="text-[10px] px-2 py-1 rounded border border-blue-700/60 bg-blue-600/20 text-blue-100 hover:bg-blue-600/30 disabled:opacity-40"
                >
                  Compile
                </button>
              </div>
            </div>

            {/* Editor body */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {tab === 'source' && (
                <textarea
                  ref={sourceRef}
                  value={source}
                  onChange={(e) => onSourceChange(e.target.value)}
                  spellCheck={false}
                  className="w-full h-full bg-neutral-950 text-neutral-100 font-mono text-[12px] leading-5 px-3 py-2 outline-none resize-none border-0"
                  placeholder="// CUE source for the pack — see tools/cue/prompt_packs/schema_v1.cue"
                />
              )}
              {tab === 'builder' && (
                <BuilderTab
                  compiledPack={snapshot?.pack ?? null}
                  compileOk={snapshot?.ok ?? false}
                  source={source}
                  sourceStale={
                    snapshot?.compiledSource !== null &&
                    snapshot?.compiledSource !== source
                  }
                  onApply={applyBuilderSource}
                  onRequestCompile={compile}
                  busy={busy !== 'idle'}
                  selectedBlockId={context.selectedBlockId ?? null}
                />
              )}
              {tab === 'outline' && (
                <div className="h-full overflow-y-auto">
                  <CuePackOutline
                    blocks={snapshot?.blocks ?? []}
                    highlightId={context.selectedBlockId ?? null}
                  />
                </div>
              )}
              {tab === 'versions' && <VersionsTab draft={draft} />}
            </div>

            {/* Error banner (transport-level) */}
            {error && (
              <div className="px-3 py-1.5 text-[11px] border-t border-red-500/40 bg-red-950/30 text-red-200">
                {error}
              </div>
            )}

            {/* Diagnostics */}
            {snapshot && (
              <CueDiagnostics
                diagnostics={snapshot.diagnostics}
                ok={snapshot.ok}
                status={snapshot.status}
                onJumpTo={jumpToLine}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
