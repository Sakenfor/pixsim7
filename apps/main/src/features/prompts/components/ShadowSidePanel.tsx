/**
 * ShadowSidePanel
 *
 * Retractable right-side panel showing shadow analysis results grouped by role.
 * Uses DisclosureSection for collapsible nested categories.
 * Collapses to a thin strip with a sparkles icon toggle.
 */
import { DisclosureSection } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useMemo, useState } from 'react';

import { Icon } from '@lib/icons';

import { getPromptRoleBadgeClass, getPromptRoleLabel } from '@/lib/promptRoleUi';

import type { PromptTokenLine, ShadowAnalysisState } from '../hooks/useShadowAnalysis';
import {
  extractPrimitiveMatches,
  type CandidateWithPrimitiveMatch,
} from '../lib/parsePrimitiveMatch';
import { usePromptSettingsStore } from '../stores/promptSettingsStore';
import type { PromptBlockCandidate } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface ShadowSidePanelProps {
  analysis: ShadowAnalysisState;
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidate item
// ─────────────────────────────────────────────────────────────────────────────

function CandidateItem({ candidate }: { candidate: PromptBlockCandidate }) {
  return (
    <div
      className="px-1.5 py-1 rounded text-[10px] leading-tight text-neutral-600 dark:text-neutral-400 bg-white/60 dark:bg-neutral-800/40 line-clamp-2"
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
  count: number;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', dotClass)} />
      <span className="truncate">{label}</span>
      <span className="text-neutral-400 dark:text-neutral-500 ml-auto tabular-nums">
        {count}
      </span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Structure view helpers
// ─────────────────────────────────────────────────────────────────────────────

const PATTERN_BADGE: Record<string, string> = {
  assignment_arrow: '→',
  assignment: '=',
  colon: ':',
  angle_bracket: '‹›',
  freestanding: '¶',
};

function StructureLine({ line }: { line: PromptTokenLine }) {
  if (line.kind === 'header') {
    const badge = PATTERN_BADGE[line.pattern ?? ''] ?? '?';
    return (
      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-white/60 dark:bg-neutral-800/40">
        <span className="flex-shrink-0 font-mono text-sky-600 dark:text-sky-400 w-4 text-center">{badge}</span>
        <span className="font-mono text-neutral-800 dark:text-neutral-200 truncate">{line.label}</span>
      </div>
    );
  }

  if (line.kind === 'relation' && line.hops && line.hops.length > 0) {
    return (
      <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-white/60 dark:bg-neutral-800/40">
        {line.hops.map((hop, i) => (
          <span key={i} className="flex items-center gap-0.5">
            {hop.lhs && <span className="font-mono text-neutral-700 dark:text-neutral-300 truncate max-w-[48px]">{hop.lhs}</span>}
            <span className="font-mono text-amber-600 dark:text-amber-400 flex-shrink-0">
              {hop.raw}
              {hop.run > 1 && <span className="text-neutral-400 dark:text-neutral-500">({hop.run})</span>}
            </span>
            {hop.rhs && i === (line.hops?.length ?? 1) - 1 && (
              <span className="font-mono text-neutral-700 dark:text-neutral-300 truncate max-w-[48px]">{hop.rhs}</span>
            )}
          </span>
        ))}
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

export function ShadowSidePanel({ analysis }: ShadowSidePanelProps) {
  const { result, loading, refresh } = analysis;
  const promptRoleColors = usePromptSettingsStore((s) => s.promptRoleColors);
  const candidates = result?.candidates ?? [];
  const sequenceContext = result?.sequenceContext;
  const sequenceRole = sequenceContext?.role_in_sequence ?? 'unspecified';
  const hasSequenceRole = sequenceRole !== 'unspecified';
  const sequenceConfidencePct =
    typeof sequenceContext?.confidence === 'number'
      ? Math.round(sequenceContext.confidence * 100)
      : null;
  const [collapsed, setCollapsed] = useState(false);

  const primitiveMatches = useMemo(
    () => extractPrimitiveMatches(candidates),
    [candidates],
  );

  const tokenLines = result?.tokens?.lines;
  const structureLines = useMemo(
    () => (tokenLines ?? []).filter((l) => l.kind === 'header' || l.kind === 'relation'),
    [tokenLines],
  );

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

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar p-1.5 space-y-1">
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

        {/* Role groups */}
        {Object.entries(grouped).map(([role, roleCandidates]) => (
          <DisclosureSection
            key={role}
            label={
              <SectionLabel
                dotClass={getPromptRoleBadgeClass(role, promptRoleColors)}
                label={getPromptRoleLabel(role)}
                count={roleCandidates.length}
              />
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
        ))}

        {/* Primitive matches */}
        {primitiveMatches.length > 0 && (
          <>
            <div className="h-px bg-neutral-200 dark:bg-neutral-700 mx-0.5 my-1" />
            <DisclosureSection
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

        {/* Structure */}
        {structureLines.length > 0 && (
          <>
            <div className="h-px bg-neutral-200 dark:bg-neutral-700 mx-0.5 my-1" />
            <DisclosureSection
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
                  <StructureLine key={i} line={line} />
                ))}
              </div>
            </DisclosureSection>
          </>
        )}
      </div>
    </div>
  );
}
