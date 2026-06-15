/**
 * ShadowSidePanel
 *
 * Retractable right-side panel showing shadow analysis results grouped by role.
 * Uses DisclosureSection for collapsible nested categories.
 * Collapses to a thin strip with a sparkles icon toggle.
 */
import { Button, DisclosureSection, Input, Modal, useToast, useUiCollapsed } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Icon } from '@lib/icons';

import { getPromptRoleBadgeClass, getPromptRoleLabel } from '@/lib/promptRoleUi';

import { usePromptVariables } from '../hooks/usePromptVariables';
import type { PromptTokenLine, ShadowAnalysisState } from '../hooks/useShadowAnalysis';
import {
  extractPrimitiveMatches,
  type CandidateWithPrimitiveMatch,
} from '../lib/parsePrimitiveMatch';
import { groupVariablesByEntity } from '../lib/promptVariableName';
import {
  buildVariableTransformMap,
  buildVariableValueMap,
  resolvePromptVariables,
} from '../lib/resolvePromptVariables';
import { getVariableClassVisual } from '../lib/variableClassVisuals';
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
    loading: loadingSavedVariables,
    saveVariable,
    renameVariable,
    deleteVariable,
  } = usePromptVariables();
  const [editingVariable, setEditingVariable] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [valueDraft, setValueDraft] = useState('');
  const [variableError, setVariableError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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
  // Stats view: saved + detected grouped by entity (ACTOR1 → DETAILS, POSE, …).
  // Derived only — see lib/promptVariableName.
  const variableGroups = useMemo(
    () => groupVariablesByEntity(savedEntries, detectedVariables),
    [savedEntries, detectedVariables],
  );
  // Phase-2 resolved preview: expand variables that have a value. Null when
  // resolution is a no-op (no var with a value appears in the prompt), so the
  // section only shows when there's something to preview.
  const resolvedPreview = useMemo(() => {
    const source = result?.analyzedPrompt ?? '';
    if (!source) return null;
    const resolved = resolvePromptVariables(
      source,
      buildVariableValueMap(savedEntries),
      buildVariableTransformMap(savedEntries),
    );
    return resolved !== source ? resolved : null;
  }, [result?.analyzedPrompt, savedEntries]);

  const openVariableModal = (name: string) => {
    const entry = savedEntries.find((item) => item.name === name);
    setEditingVariable(name);
    setRenameDraft(name);
    setDescriptionDraft(entry?.description ?? '');
    setValueDraft(entry?.value ?? '');
    setVariableError(null);
    setConfirmingDelete(false);
  };
  const closeVariableModal = () => {
    setEditingVariable(null);
    setRenameDraft('');
    setDescriptionDraft('');
    setValueDraft('');
    setVariableError(null);
    setConfirmingDelete(false);
  };
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
  const handleSaveVariableEdit = async () => {
    if (!editingVariable) return;
    const nextName = renameDraft.trim().toUpperCase();
    if (!nextName) {
      setVariableError('Name is required.');
      return;
    }
    const original = savedEntries.find((item) => item.name === editingVariable);
    const nextDescription = descriptionDraft.trim();
    const nextValue = valueDraft.trim();
    const descriptionChanged = nextDescription !== (original?.description ?? '');
    const valueChanged = nextValue !== (original?.value ?? '');

    // Rename first (the backend preserves description/value through a rename),
    // then persist field changes via an allow-existing upsert.
    let finalName = editingVariable;
    if (nextName !== editingVariable) {
      const resultRename = await renameVariable(editingVariable, nextName);
      if (!resultRename.ok) {
        setVariableError(
          resultRename.code === 'duplicate'
            ? `"${nextName}" already exists. Delete it first or pick another name.`
            : resultRename.message ?? 'Rename failed.',
        );
        return;
      }
      finalName = nextName;
    }

    if (descriptionChanged || valueChanged || finalName !== editingVariable) {
      const resultDescription = await saveVariable(finalName, {
        allowExisting: true,
        description: nextDescription,
        value: nextValue,
      });
      if (!resultDescription.ok) {
        setVariableError(resultDescription.message ?? 'Failed to save variable.');
        return;
      }
    }

    toast.success(`Saved ${finalName}`);
    closeVariableModal();
  };
  const handleDeleteVariable = async () => {
    if (!editingVariable) return;
    // Two-step inline confirm in place of a blocking window.confirm.
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    const name = editingVariable;
    const resultDelete = await deleteVariable(name);
    if (resultDelete.ok) {
      toast.success(`Deleted ${name}`);
      closeVariableModal();
      return;
    }
    setConfirmingDelete(false);
    setVariableError(resultDelete.message ?? 'Delete failed.');
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

  const hasContent = loading || candidates.length > 0;

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
        {!hasContent && (
          <div className="text-[10px] text-neutral-400 dark:text-neutral-500 px-1 py-4 text-center">
            Type to analyze
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

        {/* Variables */}
        {(detectedVariables.length > 0 || savedVariables.length > 0 || loadingSavedVariables) && (
          <>
            <div className="h-px bg-neutral-200 dark:bg-neutral-700 mx-0.5 my-1" />
            <DisclosureSection
              persistKey={`${keyPrefix}:variables`}
              label={
                <SectionLabel
                  dotClass="bg-emerald-500"
                  label="Variables"
                  count={savedVariables.length}
                />
              }
              defaultOpen
              size="sm"
              bordered
            >
              <div className="space-y-1">
                {loadingSavedVariables && (
                  <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    Loading saved variables...
                  </div>
                )}
                {detectedVariables.length > 0 && (
                  <div className="space-y-0.5">
                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                      Detected
                    </div>
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
                            title={
                              isSaved
                                ? `${name} is saved`
                                : `Save ${name} as a known variable`
                            }
                          >
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {savedVariables.length > 0 && (
                  <div className="space-y-0.5">
                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                      Saved
                    </div>
                    <div className="space-y-0.5">
                      {savedEntries.map((entry) => (
                        <button
                          key={`saved-${entry.name}`}
                          type="button"
                          onClick={() => openVariableModal(entry.name)}
                          className="w-full flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] border border-neutral-300/70 dark:border-neutral-700/70 bg-white/70 dark:bg-neutral-800/40 hover:border-violet-300 dark:hover:border-violet-600 transition-colors"
                          title={entry.description ? `${entry.name} — ${entry.description}` : `Edit ${entry.name}`}
                        >
                          <span className="font-mono shrink-0">{entry.name}</span>
                          {entry.description && (
                            <span className="truncate text-neutral-500 dark:text-neutral-400 italic">
                              {entry.description}
                            </span>
                          )}
                          <Icon name="edit" size={10} className="ml-auto shrink-0 text-neutral-400" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {variableGroups.length > 1 && (
                  <div className="space-y-0.5">
                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                      By entity
                    </div>
                    <div className="space-y-1">
                      {variableGroups.map((group) => (
                        <div
                          key={`entity-${group.entity}`}
                          className="rounded border border-neutral-200/70 dark:border-neutral-700/60 px-1.5 py-1"
                        >
                          <div className="flex items-center gap-1 text-[10px]">
                            {(() => {
                              const visual = getVariableClassVisual(group.entity);
                              if (!visual) return null;
                              return (
                                <span className="inline-flex items-center gap-1">
                                  <span
                                    className={clsx('w-1.5 h-1.5 rounded-full', visual.dotClass)}
                                  />
                                  <Icon name={visual.icon} size={11} className="text-neutral-500" />
                                </span>
                              );
                            })()}
                            <span className="font-mono font-semibold text-neutral-700 dark:text-neutral-200">
                              {group.entity}
                            </span>
                            <span className="ml-auto text-neutral-400 tabular-nums">
                              {group.members.length}
                            </span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {group.members.map((member) => (
                              <button
                                key={`member-${member.name}`}
                                type="button"
                                onClick={() =>
                                  member.saved
                                    ? openVariableModal(member.name)
                                    : handleSaveVariable(member.name)
                                }
                                title={
                                  member.saved
                                    ? `Edit ${member.name}${member.description ? ` — ${member.description}` : ''}`
                                    : `Save ${member.name} as a known variable`
                                }
                                className={clsx(
                                  'px-1.5 py-0.5 rounded border text-[10px] font-mono transition-colors',
                                  member.saved
                                    ? 'border-emerald-300/80 dark:border-emerald-700/70 text-emerald-700 dark:text-emerald-300 bg-emerald-50/70 dark:bg-emerald-900/20'
                                    : 'border-dashed border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-violet-300 dark:hover:border-violet-600 hover:bg-violet-50/70 dark:hover:bg-violet-900/20',
                                )}
                              >
                                {member.facetPath || group.entity}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
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
      <Modal
        isOpen={!!editingVariable}
        onClose={closeVariableModal}
        title="Edit Variable"
        size="sm"
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Variable Name
            </label>
            <Input
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value.toUpperCase())}
              placeholder="ACTOR1"
              autoFocus
            />
            <p className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400">
              Uppercase letters, digits, underscore.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Description <span className="text-neutral-400">(optional)</span>
            </label>
            <Input
              value={descriptionDraft}
              onChange={(event) => setDescriptionDraft(event.target.value)}
              placeholder="the protagonist"
              maxLength={200}
            />
            <p className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400">
              A one-line reuse hint shown next to the variable.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Expands to <span className="text-neutral-400">(optional)</span>
            </label>
            <textarea
              value={valueDraft}
              onChange={(event) => setValueDraft(event.target.value)}
              rows={3}
              placeholder="Leave empty to keep it a literal symbol"
              maxLength={2000}
              className="w-full resize-y rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-2 py-1 text-xs text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-violet-400"
            />
            <p className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400">
              Substitution text — when set, the variable expands to this in the generated prompt.
            </p>
          </div>
          {variableError && (
            <div className="text-[11px] text-red-600 dark:text-red-400">
              {variableError}
            </div>
          )}
          <div className="flex items-center justify-between pt-1 border-t border-neutral-200 dark:border-neutral-700">
            <Button
              type="button"
              variant="danger"
              onClick={handleDeleteVariable}
            >
              {confirmingDelete ? 'Confirm delete' : 'Delete'}
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={closeVariableModal}>
                Cancel
              </Button>
              <Button type="button" variant="primary" onClick={handleSaveVariableEdit}>
                Save
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
