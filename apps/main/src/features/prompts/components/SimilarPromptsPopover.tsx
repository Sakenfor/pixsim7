/**
 * SimilarPromptsPopover — semantic "find similar" for the prompt composer.
 *
 * Lists PromptVersions whose text is semantically close to the current composer
 * text (pgvector search via /prompts/search/similar?mode=vector). Header controls
 * tune the match set: a min-similarity slider, a result-count selector, and a
 * family scope (all families, or restrict to one). Clicking a result hands its
 * text back via `onUse` so the composer can load it.
 *
 * Presentational: search state lives in `useSimilarPromptsSearch` (owned by the
 * composer) so it persists across open/close and drives the trigger's status.
 * Family *options* are loaded here (UI selection data), lazily on first open.
 *
 * Part of plan embedding-service-generalization, Phase D (d3).
 */
import { Popover } from '@pixsim7/shared.ui';
import { useEffect, useState } from 'react';

import {
  listPromptFamilies,
  type PromptFamilySummary,
  type PromoteFamilyCandidateResult,
} from '@lib/api/prompts';
import { Icon } from '@lib/icons';

import {
  SIMILAR_LIMIT_OPTIONS,
  type SimilarPromptsSearch,
} from '../hooks/useSimilarPromptsSearch';

export interface SimilarPromptsPopoverProps {
  open: boolean;
  onClose: () => void;
  anchor: HTMLElement | null;
  triggerRef?: React.RefObject<HTMLElement | null>;
  /** Shared search state from useSimilarPromptsSearch. */
  search: SimilarPromptsSearch;
  /** Called with a result's text when the user picks it. */
  onUse?: (text: string) => void;
  /** Open the side-by-side compare view with this result vs the current prompt. */
  onCompare?: (otherText: string, label?: string) => void;
  /** Group the given prompt versions into a new family (the quick promote action). */
  onPromote?: (versionIds: string[], title: string) => Promise<PromoteFamilyCandidateResult>;
  /** Open the full Families review surface (Prompt Library → Analysis → Families). */
  onOpenFamilies?: () => void;
}

/** A short, editable-later family title from the current prompt's first words. */
function deriveFamilyTitle(query: string): string {
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 6);
  const title = words.join(' ').slice(0, 60).trim();
  return title || 'New family';
}

const SELECT_CLASS =
  'text-[10px] rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 ' +
  'text-neutral-600 dark:text-neutral-300 px-1 py-0.5 cursor-pointer focus:outline-none ' +
  'focus:ring-1 focus:ring-accent';

// A match this close to the query is effectively the same prompt tweaked — the
// signal that the current text is a "family candidate" (would cluster with an
// existing prompt). Mirrors the family-candidates clustering intent.
const NEAR_DUP_THRESHOLD = 0.9;

/** The popover's inner content, sans the `<Popover>` shell — so it can be
 *  hosted standalone (`SimilarPromptsPopover`) or as a tab inside
 *  `RelatedPromptsPopover`. */
export type SimilarPromptsBodyProps = Omit<SimilarPromptsPopoverProps, 'anchor' | 'triggerRef'>;

export function SimilarPromptsBody({
  open,
  onClose,
  search,
  onUse,
  onCompare,
  onPromote,
  onOpenFamilies,
}: SimilarPromptsBodyProps) {
  const {
    threshold,
    setThreshold,
    limit,
    setLimit,
    familyId,
    setFamilyId,
    hybrid,
    setHybrid,
    triggerSearch,
    armed,
    query,
    results,
    loading,
    error,
    hasQuery,
    stale,
  } = search;
  // Show results unless they're stale AND we're not mid-session: when armed
  // (actively refining) keep the previous results visible until the new ones
  // land, to avoid a blank flash on each control change. When inert (just
  // opened / reopened) only show results that match the current params.
  const showResults = !stale || armed ? results : [];
  const noResults = showResults.length === 0;

  // Family options for the scope dropdown — loaded lazily the first time the
  // popover opens, then cached for the session.
  const [families, setFamilies] = useState<PromptFamilySummary[] | null>(null);
  useEffect(() => {
    if (!open || families !== null) return;
    let cancelled = false;
    listPromptFamilies({ limit: 200, is_active: true, offset: 0 })
      .then((rows) => {
        if (!cancelled) setFamilies(rows);
      })
      .catch(() => {
        if (!cancelled) setFamilies([]); // fail soft: scope stays "All families"
      });
    return () => {
      cancelled = true;
    };
  }, [open, families]);

  // Candidacy: does the current text look like a tweak of something that
  // already exists? Derived from the search results we already have — no extra
  // call. A near-duplicate in a family means "reuse that family"; ungrouped
  // near-duplicates mean "this is a candidate family".
  const nearDupes = showResults.filter((r) => r.similarity_score >= NEAR_DUP_THRESHOLD);
  const familyDupe = nearDupes.find((r) => r.family_id);
  const familyDupeTitle =
    familyDupe?.family_id != null
      ? (families?.find((f) => f.id === familyDupe.family_id)?.title ?? null)
      : null;
  const showCandidacy = armed && hasQuery && !loading && !error;

  // Quick "Create family" from the ungrouped near-duplicates (the visible ones).
  const [promoting, setPromoting] = useState(false);
  const [promoteMsg, setPromoteMsg] = useState<string | null>(null);
  const createFamily = async () => {
    if (!onPromote) return;
    const ids = nearDupes.filter((r) => !r.family_id).map((r) => r.version_id);
    if (!ids.length) return;
    setPromoting(true);
    setPromoteMsg(null);
    try {
      const r = await onPromote(ids, deriveFamilyTitle(query));
      setPromoteMsg(`Created “${r.title}” — grouped ${r.assigned}.`);
    } catch (e) {
      setPromoteMsg(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setPromoting(false);
    }
  };

  return (
      <div className="flex flex-col max-h-[60vh]">
        <div className="px-3 pt-2 pb-1.5 border-b border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
            <Icon name="sparkles" size={12} />
            Similar prompts (semantic)
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => triggerSearch()}
              disabled={!hasQuery || loading}
              title="Search for similar prompts"
              className="ml-auto flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon
                name={loading ? 'refresh' : 'search'}
                size={10}
                className={loading ? 'animate-spin' : undefined}
              />
              {loading ? 'Searching…' : armed ? 'Search again' : 'Find'}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500 shrink-0">
              Min similarity
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="flex-1 h-1 accent-accent cursor-pointer"
              title={`Min similarity: ${threshold.toFixed(2)}`}
            />
            <span className="text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400 w-7 text-right">
              {threshold.toFixed(2)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <select
              value={familyId ?? ''}
              onChange={(e) => setFamilyId(e.target.value || null)}
              className={`${SELECT_CLASS} flex-1 min-w-0`}
              title="Scope results to a prompt family"
            >
              <option value="">All families</option>
              {families?.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                  {typeof f.version_count === 'number' ? ` (${f.version_count})` : ''}
                </option>
              ))}
            </select>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className={SELECT_CLASS}
              title="Max results"
            >
              {SIMILAR_LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  Top {n}
                </option>
              ))}
            </select>
          </div>
          <label
            className="mt-2 flex items-center gap-1.5 text-[10px] text-neutral-500 dark:text-neutral-400 cursor-pointer select-none"
            title="Re-rank so prompts that produced successful generations surface higher among comparably-similar matches"
          >
            <input
              type="checkbox"
              checked={hybrid}
              onChange={(e) => setHybrid(e.target.checked)}
              className="accent-accent cursor-pointer"
            />
            Favor proven prompts
            <span className="text-neutral-400 dark:text-neutral-500">
              · boost by successful gens
            </span>
          </label>
        </div>

        {showCandidacy && (
          <div className="px-3 py-1.5 border-b border-neutral-100 dark:border-neutral-800 text-[10px] space-y-1">
            {nearDupes.length === 0 ? (
              <span className="flex items-center gap-1.5 text-neutral-400 dark:text-neutral-500">
                <Icon name="check" size={11} />
                No near-duplicates — looks original.
              </span>
            ) : familyDupe ? (
              <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <Icon name="layers" size={11} />
                Near-duplicate of family “{familyDupeTitle ?? 'an existing family'}” — consider reusing it.
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-accent">
                <Icon name="layers" size={11} />
                {nearDupes.length} ungrouped near-duplicate{nearDupes.length === 1 ? '' : 's'} — candidate family.
              </span>
            )}

            {nearDupes.length > 0 && (onPromote || onOpenFamilies) && (
              <div className="flex items-center gap-2 pt-0.5">
                {!familyDupe && onPromote && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void createFamily()}
                    disabled={promoting}
                    title="Group these ungrouped near-duplicates into a new family"
                    className="flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 font-medium text-white hover:bg-accent/90 disabled:opacity-50"
                  >
                    <Icon
                      name={promoting ? 'refresh' : 'layers'}
                      size={9}
                      className={promoting ? 'animate-spin' : undefined}
                    />
                    {promoting ? 'Creating…' : 'Create family'}
                  </button>
                )}
                {onOpenFamilies && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onOpenFamilies()}
                    title="Open the full Families review (computes the complete cluster)"
                    className="rounded px-1.5 py-0.5 text-neutral-500 hover:text-accent hover:bg-accent/10"
                  >
                    Review in Families →
                  </button>
                )}
              </div>
            )}
            {promoteMsg && (
              <div className="text-emerald-600 dark:text-emerald-400">{promoteMsg}</div>
            )}
          </div>
        )}

        <div className="overflow-y-auto py-1">
          {!hasQuery && (
            <div className="px-3 py-4 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
              Type a prompt to find similar versions.
            </div>
          )}
          {hasQuery && loading && noResults && (
            <div className="px-3 py-4 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
              Searching…
            </div>
          )}
          {hasQuery && !loading && error && (
            <div className="px-3 py-4 text-center text-[11px] text-red-500">{error}</div>
          )}
          {hasQuery && !loading && !error && noResults && (
            <div className="px-3 py-4 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
              {armed
                ? 'No similar prompts above this threshold.'
                : 'Press “Find” to search for similar prompts.'}
            </div>
          )}
          {hasQuery &&
            !error &&
            showResults.map((r) => (
              <div
                key={r.version_id}
                className="px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors flex items-start gap-1"
              >
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onUse?.(r.prompt_text);
                    onClose();
                  }}
                  className="flex-1 min-w-0 text-left flex items-start gap-2"
                  title="Load this prompt into the composer"
                >
                  <span className="mt-0.5 shrink-0 text-[10px] tabular-nums px-1 rounded bg-accent/10 text-accent">
                    {Math.round(r.similarity_score * 100)}%
                  </span>
                  {(r.successful_assets ?? 0) > 0 && (
                    <span
                      className="mt-0.5 shrink-0 flex items-center gap-0.5 text-[10px] tabular-nums px-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      title={`${r.successful_assets} successful generation${r.successful_assets === 1 ? '' : 's'}`}
                    >
                      <Icon name="check" size={9} />
                      {r.successful_assets}
                    </span>
                  )}
                  <span className="text-[11px] text-neutral-700 dark:text-neutral-300 line-clamp-2">
                    {r.prompt_text}
                  </span>
                </button>
                {onCompare && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      onCompare(
                        r.prompt_text,
                        `Similar (${Math.round(r.similarity_score * 100)}%)`,
                      )
                    }
                    title="Compare with current prompt (side-by-side)"
                    className="mt-0.5 shrink-0 rounded p-0.5 text-neutral-400 hover:text-accent hover:bg-accent/10"
                  >
                    <Icon name="columns" size={12} />
                  </button>
                )}
              </div>
            ))}
        </div>
      </div>
  );
}

/** Standalone popover: the `SimilarPromptsBody` in its own `<Popover>` shell. */
export function SimilarPromptsPopover({
  open,
  onClose,
  anchor,
  triggerRef,
  ...body
}: SimilarPromptsPopoverProps) {
  return (
    <Popover
      open={open}
      onClose={onClose}
      anchor={anchor}
      triggerRef={triggerRef}
      placement="bottom"
      align="end"
      offset={6}
      className="w-[340px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl"
    >
      <SimilarPromptsBody open={open} onClose={onClose} {...body} />
    </Popover>
  );
}
