/**
 * ShadowSidePanel
 *
 * Retractable right-side panel showing shadow analysis results grouped by role.
 * Uses DisclosureSection for collapsible nested categories.
 * Collapses to a thin strip with a sparkles icon toggle.
 */
import { DisclosureSection, useToast, useUiCollapsed } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';

import { Icon } from '@lib/icons';

import { getPromptRoleBadgeClass, getPromptRoleLabel } from '@/lib/promptRoleUi';

import { usePromptVariables } from '../hooks/usePromptVariables';
import type { PromptTokenLine, ShadowAnalysisState } from '../hooks/useShadowAnalysis';
import { extractInlineVarValues } from '../lib/inlineVarValues';
import {
  extractPrimitiveMatches,
  type CandidateWithPrimitiveMatch,
} from '../lib/parsePrimitiveMatch';
import {
  buildVariableTransformMap,
  buildVariableValueMap,
  resolvePromptVariables,
} from '../lib/resolvePromptVariables';
import { usePromptSettingsStore } from '../stores/promptSettingsStore';
import type { PromptBlockCandidate } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface ShadowSidePanelProps {
  analysis: ShadowAnalysisState;
  /**
   * Stable surface id ('promptBox', 'composer', …) used to derive the
   * `useUiCollapsed` keys for both the outer collapse-to-strip toggle and
   * each inner DisclosureSection. Lets every host keep its own remembered
   * state so the panel follows whatever dock/float renders it.
   */
  surfaceId: string;
  /**
   * Currently pinned role (already guarded against absent candidates by the
   * caller). The matching role section renders active + auto-expands +
   * scrolls into view, and the editor dims every other role. Same state the
   * legend chips drive — panel headers and chips are two handles on it.
   */
  pinnedRole?: string | null;
  /** Toggle the pin for a role (panel header pin button / legend chip click). */
  onRoleClick?: (role: string) => void;
  /** Ephemeral hover preview — emit the role on enter, null on leave. */
  onRoleHover?: (role: string | null) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidate item
// ─────────────────────────────────────────────────────────────────────────────

function CandidateItem({ candidate }: { candidate: PromptBlockCandidate }) {
  return (
    <div
      // Long candidates used to clip at 2 lines. Keep the block compact but let
      // it scroll its own overflow so the full text is reachable without
      // ballooning the panel. break-words avoids horizontal overflow on long
      // unbroken tokens.
      className="px-1.5 py-1 rounded text-[10px] leading-tight text-neutral-600 dark:text-neutral-400 bg-white/60 dark:bg-neutral-800/40 max-h-16 overflow-y-auto thin-scrollbar whitespace-pre-wrap break-words"
      title={candidate.text}
    >
      {candidate.text}
      {typeof candidate.confidence === 'number' && (
        <span className="ml-1 text-neutral-400 dark:text-neutral-500 tabular-nums">
          {Math.round(candidate.confidence * 100)}%
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Match item
// ─────────────────────────────────────────────────────────────────────────────

function MatchItem({ item }: { item: CandidateWithPrimitiveMatch }) {
  const { match, candidate } = item;
  const pct = Math.round(match.score * 100);

  return (
    <div
      className="flex items-center gap-1 px-1.5 py-1 rounded text-[10px] bg-white/60 dark:bg-neutral-800/40"
      title={`${match.block_id} — "${candidate.text}"`}
    >
      <span className="font-mono text-violet-600 dark:text-violet-400 truncate flex-1 min-w-0">
        {match.block_id}
      </span>
      <span
        className={clsx(
          'tabular-nums flex-shrink-0',
          pct >= 80
            ? 'text-green-600 dark:text-green-400'
            : pct >= 60
              ? 'text-yellow-600 dark:text-yellow-400'
              : 'text-neutral-400 dark:text-neutral-500',
        )}
      >
        {pct}%
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section label (shared layout for role & match headers)
// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({
  dotClass,
  label,
  count,
}: {
  dotClass: string;
  label: string;
  count?: number;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', dotClass)} />
      <span className="truncate">{label}</span>
      {typeof count === 'number' && (
        <span className="text-neutral-400 dark:text-neutral-500 ml-auto tabular-nums">
          {count}
        </span>
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Structure view helpers
// ─────────────────────────────────────────────────────────────────────────────

const HEADER_PATTERN_BADGE: Record<string, string> = {
  colon: ':',
  angle_bracket: '‹›',
  freestanding: '¶',
};

function StructureLine({
  line,
  savedVariables,
  onSaveVariable,
}: {
  line: PromptTokenLine;
  savedVariables: Set<string>;
  onSaveVariable: (name: string) => void;
}) {
  if (line.kind === 'header') {
    const badge = HEADER_PATTERN_BADGE[line.pattern ?? ''] ?? '?';
    return (
      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-white/60 dark:bg-neutral-800/40">
        <span className="flex-shrink-0 font-mono text-sky-600 dark:text-sky-400 w-4 text-center">{badge}</span>
        <span className="font-mono text-neutral-800 dark:text-neutral-200 truncate">{line.label}</span>
      </div>
    );
  }

  if (line.kind === 'chain' && line.elements && line.operators) {
    // Visual rule: any non-empty prose element → header-style (sky); else amber.
    const hasProse = line.elements.some((e) => e.kind === 'prose' && e.text.length > 0);
    const accentClass = hasProse
      ? 'text-sky-600 dark:text-sky-400'
      : 'text-amber-600 dark:text-amber-400';

    // Interleave elements and operators: e[0] op[0] e[1] op[1] ... e[n].
    const parts: ReactNode[] = [];
    line.elements.forEach((el, i) => {
      if (el.text.length > 0) {
        parts.push(
          el.kind === 'var' ? (
            <button
              type="button"
              key={`e${i}`}
              onClick={() => onSaveVariable(el.text)}
              className={clsx(
                'font-mono truncate max-w-[96px] rounded px-1 py-[1px] border transition-colors',
                savedVariables.has(el.text)
                  ? 'text-emerald-700 dark:text-emerald-300 border-emerald-300/80 dark:border-emerald-700/70 bg-emerald-50/80 dark:bg-emerald-900/20'
                  : 'text-neutral-700 dark:text-neutral-300 border-neutral-300/80 dark:border-neutral-700/80 hover:border-violet-300 dark:hover:border-violet-600 hover:bg-violet-50/70 dark:hover:bg-violet-900/20',
              )}
              title={
                savedVariables.has(el.text)
                  ? `${el.text} is saved`
                  : `Save ${el.text} as a known variable`
              }
            >
              {el.text}
            </button>
          ) : (
            <span
              key={`e${i}`}
              className="italic text-neutral-500 dark:text-neutral-400 truncate max-w-[80px]"
              title={el.text}
            >
              {el.text}
            </span>
          ),
        );
      }
      const op = line.operators?.[i];
      if (op) {
        parts.push(
          <span key={`o${i}`} className={clsx('font-mono flex-shrink-0', accentClass)}>
            {op.op}
            {op.run > 1 && (
              <span className="text-neutral-400 dark:text-neutral-500">({op.run})</span>
            )}
          </span>,
        );
      }
    });

    return (
      <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-white/60 dark:bg-neutral-800/40">
        {parts}
      </div>
    );
  }

  return null;
}

function getSequenceRoleLabel(role: string): string {
  switch (role) {
    case 'initial':
      return 'Initial';
    case 'continuation':
      return 'Continuation';
    case 'transition':
      return 'Transition';
    default:
      return 'Unspecified';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function ShadowSidePanel({
  analysis,
  surfaceId,
  pinnedRole = null,
  onRoleClick,
  onRoleHover,
}: ShadowSidePanelProps) {
  const { result, loading, refresh } = analysis;
  const promptRoleColors = usePromptSettingsStore((s) => s.promptRoleColors);
  const interactive = !!(onRoleClick || onRoleHover);
  const {
    variables: savedVariables,
    entries: savedEntries,
    saveVariable,
  } = usePromptVariables();
  const toast = useToast();

  // Scroll the pinned role section into view within the panel's own scroll
  // container only — never scrollIntoView(), which would scroll every ancestor
  // (incl. the document body) when the panel is partially clipped.
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRoleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pinnedRole) return;
    const container = scrollRef.current;
    const target = activeRoleRef.current;
    if (!container || !target) return;
    const cRect = container.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    if (tRect.top < cRect.top || tRect.bottom > cRect.bottom) {
      container.scrollTo({
        top: container.scrollTop + (tRect.top - cRect.top) - 8,
        behavior: 'smooth',
      });
    }
  }, [pinnedRole]);
  // Persist collapsed state per-surface so prompt-box and composer remember
  // independently across reloads / dock moves. Backed by the shared
  // useUiCollapsed primitive — keys follow the `<domain>:<surface>:<element>`
  // convention so future shadow-related toggles can extend the same prefix.
  const keyPrefix = `shadow:${surfaceId}`;
  const { collapsed, setCollapsed } = useUiCollapsed(keyPrefix, false);
  const candidates = result?.candidates ?? [];
  const sequenceContext = result?.sequenceContext;
  const sequenceRole = sequenceContext?.role_in_sequence ?? 'unspecified';
  const hasSequenceRole = sequenceRole !== 'unspecified';
  const sequenceConfidencePct =
    typeof sequenceContext?.confidence === 'number'
      ? Math.round(sequenceContext.confidence * 100)
      : null;

  const primitiveMatches = useMemo(
    () => extractPrimitiveMatches(candidates),
    [candidates],
  );

  const tokenLines = result?.tokens?.lines;
  const structureLines = useMemo(
    () => (tokenLines ?? []).filter((l) => l.kind === 'header' || l.kind === 'chain'),
    [tokenLines],
  );
  const savedVariableSet = useMemo(() => new Set(savedVariables), [savedVariables]);
  const detectedVariables = useMemo(() => {
    const hinted = result?.variableHints?.detected;
    if (Array.isArray(hinted) && hinted.length > 0) return hinted;

    const fallback: string[] = [];
    const seen = new Set<string>();
    for (const line of structureLines) {
      if (line.kind !== 'chain' || !Array.isArray(line.elements)) continue;
      for (const element of line.elements) {
        if (element.kind !== 'var' || !element.text) continue;
        const name = element.text.trim().toUpperCase();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        fallback.push(name);
      }
    }
    return fallback;
  }, [result?.variableHints?.detected, structureLines]);
  const unsavedDetected = useMemo(() => {
    const hinted = result?.variableHints?.unsaved_detected;
    if (Array.isArray(hinted)) return hinted;
    return detectedVariables.filter((name) => !savedVariableSet.has(name));
  }, [result?.variableHints?.unsaved_detected, detectedVariables, savedVariableSet]);
  // Phase-2 resolved preview: expand variables that have a value. Null when
  // resolution is a no-op (no var with a value appears in the prompt), so the
  // section only shows when there's something to preview.
  const resolvedPreview = useMemo(() => {
    const source = result?.analyzedPrompt ?? '';
    if (!source) return null;
    // Inline VAR(value) bindings from the prompt win over stored values
    // (mirrors the backend outbound path).
    const { values: inlineValues, collapsed } = extractInlineVarValues(source);
    const resolved = resolvePromptVariables(
      collapsed,
      { ...buildVariableValueMap(savedEntries), ...inlineValues },
      buildVariableTransformMap(savedEntries),
    );
    return resolved !== source ? resolved : null;
  }, [result?.analyzedPrompt, savedEntries]);

  const handleSaveVariable = async (rawName: string) => {
    const name = rawName.trim().toUpperCase();
    if (!name) return;
    const resultSave = await saveVariable(name);
    if (resultSave.ok) {
      toast.success(`Saved ${name}`);
      return;
    }
    if (resultSave.code === 'duplicate') {
      toast.info(`${name} is already saved`);
      return;
    }
    toast.error(resultSave.message ?? `Failed to save ${name}`);
  };

  // Group candidates by role
  const grouped = useMemo(() => {
    const groups: Record<string, PromptBlockCandidate[]> = {};
    for (const c of candidates) {
      const role = c.role ?? 'other';
      if (!groups[role]) groups[role] = [];
      groups[role].push(c);
    }
    return groups;
  }, [candidates]);

  // The panel shows several independent sections (role candidates, primitive
  // matches, detected variables, structure lines, resolved preview, sequence
  // role) — any one of them is "content". Keying the empty state on candidates
  // alone wrongly showed "Type to analyze" whenever a prompt had structure but
  // no role matches, contradicting the structure list rendered right below it.
  const hasAnyContent =
    candidates.length > 0 ||
    primitiveMatches.length > 0 ||
    detectedVariables.length > 0 ||
    structureLines.length > 0 ||
    resolvedPreview != null ||
    hasSequenceRole;

  // ── Collapsed strip ──
  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className={clsx(
          'flex-shrink-0 w-7 flex flex-col items-center pt-2 gap-1.5',
          'border-l border-neutral-200 dark:border-neutral-700',
          'bg-neutral-50 dark:bg-neutral-900/50',
          'hover:bg-neutral-100 dark:hover:bg-neutral-800',
          'transition-colors',
        )}
        title="Expand analysis panel"
      >
        <Icon name="sparkles" size={12} className="text-violet-500" />
        <Icon name="chevronLeft" size={10} className="text-neutral-400" />
      </button>
    );
  }

  // ── Expanded panel ──
  return (
    <div
      className={clsx(
        'flex-shrink-0 w-48 flex flex-col overflow-hidden',
        'border-l border-neutral-200 dark:border-neutral-700',
        'bg-neutral-50/50 dark:bg-neutral-900/30',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-neutral-200/60 dark:border-neutral-700/60 shrink-0">
        <Icon name="sparkles" size={12} className="text-violet-500 flex-shrink-0" />
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 flex-1 min-w-0">
          Analysis
        </span>
        {hasSequenceRole && (
          <span
            className="inline-flex items-center gap-1 px-1 py-0.5 rounded border border-cyan-200/70 dark:border-cyan-700/50 bg-cyan-50 dark:bg-cyan-900/20 text-[10px] text-cyan-700 dark:text-cyan-300 whitespace-nowrap"
            title={
              [
                `Sequence role: ${getSequenceRoleLabel(sequenceRole)}`,
                sequenceContext?.source ? `Source: ${sequenceContext.source}` : null,
                sequenceContext?.matched_block_id
                  ? `Block: ${sequenceContext.matched_block_id}`
                  : null,
              ]
                .filter(Boolean)
                .join(' | ')
            }
          >
            {getSequenceRoleLabel(sequenceRole)}
            {sequenceConfidencePct !== null && (
              <span className="tabular-nums text-cyan-500 dark:text-cyan-400">
                {sequenceConfidencePct}%
              </span>
            )}
          </span>
        )}
        {loading && (
          <Icon
            name="refresh"
            size={10}
            className="text-neutral-400 animate-spin flex-shrink-0"
          />
        )}
        {!loading && candidates.length > 0 && (
          <button
            type="button"
            onClick={refresh}
            title="Refresh"
            className="p-0.5 rounded text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
          >
            <Icon name="refresh" size={10} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Collapse panel"
          className="p-0.5 rounded text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
        >
          <Icon name="chevronRight" size={10} />
        </button>
      </div>

      {/* Focus bar — one active role at a time. Its own full-width row (rather
          than a chip in the header) so it reads as a single filter state, not
          one of several pinnable chips. */}
      {pinnedRole && (
        <div className="flex items-center gap-1.5 px-2 py-1 border-b border-violet-200/60 dark:border-violet-700/40 bg-violet-50/70 dark:bg-violet-900/15 text-[10px] shrink-0">
          <Icon name="target" size={11} className="text-violet-500 flex-shrink-0" />
          <span className="text-neutral-500 dark:text-neutral-400 flex-shrink-0">Focused</span>
          <span
            className={clsx(
              'w-1.5 h-1.5 rounded-full flex-shrink-0',
              getPromptRoleBadgeClass(pinnedRole, promptRoleColors),
            )}
          />
          <span className="font-medium text-neutral-700 dark:text-neutral-200 truncate">
            {getPromptRoleLabel(pinnedRole)}
          </span>
          <button
            type="button"
            onClick={() => onRoleClick?.(pinnedRole)}
            title="Clear focus"
            className="ml-auto p-0.5 rounded text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-violet-100 dark:hover:bg-violet-800/40 transition-colors flex-shrink-0"
          >
            <Icon name="x" size={10} />
          </button>
        </div>
      )}

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto thin-scrollbar p-1.5 space-y-1"
      >
        {!loading && !hasAnyContent && (
          <div className="text-[10px] text-neutral-400 dark:text-neutral-500 px-1 py-4 text-center">
            {result ? 'No structure or blocks detected.' : 'Type to analyze'}
          </div>
        )}

        {hasSequenceRole && sequenceContext && (
          <div className="px-1.5 py-1 rounded border border-cyan-200/70 dark:border-cyan-700/50 bg-cyan-50/70 dark:bg-cyan-900/20 text-[10px] text-cyan-800 dark:text-cyan-200 space-y-0.5">
            <div className="flex items-center gap-1">
              <span className="font-medium">Sequence</span>
              <span className="ml-auto">{getSequenceRoleLabel(sequenceRole)}</span>
              {sequenceConfidencePct !== null && (
                <span className="tabular-nums text-cyan-600 dark:text-cyan-300">
                  {sequenceConfidencePct}%
                </span>
              )}
            </div>
            {sequenceContext.source && sequenceContext.source !== 'none' && (
              <div className="text-cyan-700/80 dark:text-cyan-300/80 truncate">
                src: {sequenceContext.source}
              </div>
            )}
          </div>
        )}

        {/* Role groups — each header is a handle on the pin/emphasis state the
            legend chips also drive. Header click still toggles the disclosure;
            the dedicated pin button (in `actions`) toggles emphasis so the two
            intents never collide. A pinned role is force-open + ring-accented. */}
        {Object.entries(grouped).map(([role, roleCandidates]) => {
          const isPinned = pinnedRole === role;
          return (
            <div
              key={role}
              ref={isPinned ? activeRoleRef : undefined}
              className={clsx(
                'rounded transition-colors',
                isPinned &&
                  'ring-1 ring-violet-300 dark:ring-violet-600/60 bg-violet-50/50 dark:bg-violet-900/10',
              )}
            >
              <DisclosureSection
                persistKey={`${keyPrefix}:role:${role}`}
                isOpen={isPinned ? true : undefined}
                label={
                  <span
                    onMouseEnter={interactive ? () => onRoleHover?.(role) : undefined}
                    onMouseLeave={interactive ? () => onRoleHover?.(null) : undefined}
                  >
                    <SectionLabel
                      dotClass={getPromptRoleBadgeClass(role, promptRoleColors)}
                      label={getPromptRoleLabel(role)}
                      count={roleCandidates.length}
                    />
                  </span>
                }
                actions={
                  interactive ? (
                    <button
                      type="button"
                      onClick={() => onRoleClick?.(role)}
                      title={`${isPinned ? 'Unpin' : 'Pin'} ${getPromptRoleLabel(role)} — emphasize its spans`}
                      className={clsx(
                        'p-0.5 rounded transition-colors',
                        isPinned
                          ? 'text-violet-500 dark:text-violet-400'
                          : 'text-neutral-300 dark:text-neutral-600 hover:text-neutral-500 dark:hover:text-neutral-400',
                      )}
                    >
                      <Icon name="pin" size={11} />
                    </button>
                  ) : undefined
                }
                defaultOpen
                size="sm"
                bordered
              >
                <div className="space-y-0.5">
                  {roleCandidates.map((c, idx) => (
                    <CandidateItem key={idx} candidate={c} />
                  ))}
                </div>
              </DisclosureSection>
            </div>
          );
        })}

        {/* Primitive matches */}
        {primitiveMatches.length > 0 && (
          <>
            <div className="h-px bg-neutral-200 dark:bg-neutral-700 mx-0.5 my-1" />
            <DisclosureSection
              persistKey={`${keyPrefix}:matches`}
              label={
                <SectionLabel
                  dotClass="bg-violet-500"
                  label="Matches"
                  count={primitiveMatches.length}
                />
              }
              defaultOpen
              size="sm"
              bordered
            >
              <div className="space-y-0.5">
                {primitiveMatches.map((item) => (
                  <MatchItem
                    key={`${item.candidateIndex}-${item.match.block_id}`}
                    item={item}
                  />
                ))}
              </div>
            </DisclosureSection>
          </>
        )}

        {/* Variables detected in this prompt — click to save to your library.
            Library management (edit/value/transform/delete) lives in the
            composer's Variables menu. */}
        {detectedVariables.length > 0 && (
          <>
            <div className="h-px bg-neutral-200 dark:bg-neutral-700 mx-0.5 my-1" />
            <DisclosureSection
              persistKey={`${keyPrefix}:variables`}
              label={
                <SectionLabel
                  dotClass="bg-emerald-500"
                  label="Variables"
                  count={detectedVariables.length}
                />
              }
              defaultOpen
              size="sm"
              bordered
            >
              <div className="space-y-1">
                <div className="flex flex-wrap gap-1">
                  {detectedVariables.map((name) => {
                    const isSaved = !unsavedDetected.includes(name);
                    return (
                      <button
                        key={`detected-${name}`}
                        type="button"
                        onClick={() => handleSaveVariable(name)}
                        className={clsx(
                          'px-1.5 py-0.5 rounded border text-[10px] font-mono transition-colors',
                          isSaved
                            ? 'border-emerald-300/80 dark:border-emerald-700/70 text-emerald-700 dark:text-emerald-300 bg-emerald-50/70 dark:bg-emerald-900/20'
                            : 'border-neutral-300/80 dark:border-neutral-700/80 text-neutral-700 dark:text-neutral-300 hover:border-violet-300 dark:hover:border-violet-600 hover:bg-violet-50/70 dark:hover:bg-violet-900/20',
                        )}
                        title={isSaved ? `${name} is saved` : `Save ${name} as a known variable`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
                {unsavedDetected.length > 0 && (
                  <p className="text-[10px] text-neutral-400 italic">
                    Click an unsaved variable to add it to your library.
                  </p>
                )}
              </div>
            </DisclosureSection>
          </>
        )}

        {/* Resolved preview (phase-2 substitution) */}
        {resolvedPreview && (
          <>
            <div className="h-px bg-neutral-200 dark:bg-neutral-700 mx-0.5 my-1" />
            <DisclosureSection
              persistKey={`${keyPrefix}:resolved`}
              label={
                <SectionLabel dotClass="bg-violet-500" label="Resolved preview" />
              }
              size="sm"
              bordered
            >
              <div className="whitespace-pre-wrap break-words rounded border border-violet-200/70 dark:border-violet-800/50 bg-violet-50/40 dark:bg-violet-950/20 px-2 py-1.5 text-[11px] leading-snug text-neutral-700 dark:text-neutral-200">
                {resolvedPreview}
              </div>
              <p className="mt-1 text-[10px] text-neutral-400 italic">
                What the model receives — variables with a value are expanded at generation. The
                saved prompt stays symbolic.
              </p>
            </DisclosureSection>
          </>
        )}

        {/* Structure */}
        {structureLines.length > 0 && (
          <>
            <div className="h-px bg-neutral-200 dark:bg-neutral-700 mx-0.5 my-1" />
            <DisclosureSection
              persistKey={`${keyPrefix}:structure`}
              label={
                <SectionLabel
                  dotClass="bg-sky-500"
                  label="Structure"
                  count={structureLines.length}
                />
              }
              defaultOpen
              size="sm"
              bordered
            >
                <div className="space-y-0.5">
                  {structureLines.map((line, i) => (
                    <StructureLine
                      key={i}
                      line={line}
                      savedVariables={savedVariableSet}
                      onSaveVariable={handleSaveVariable}
                    />
                  ))}
                </div>
            </DisclosureSection>
          </>
        )}
      </div>
    </div>
  );
}
