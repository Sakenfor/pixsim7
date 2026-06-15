/**
 * PromptInlineViewer Component
 *
 * Read-only inspector that displays prompt text with inline span-based
 * highlighting by role/category. Shares its visual treatment and tooltip with
 * the editable ShadowTextarea via PromptHighlightedSpans + PromptSpanTooltip
 * — the only difference is that this viewer renders the text visibly and uses
 * native pointer events (no transparent backdrop / no editor on top).
 *
 * Naming:
 * - PromptBlockCandidate = transient parsed output from API (not stored in DB)
 * - PromptBlock = stored entity in database (different from this)
 */

import { Popover, useToast } from '@pixsim7/shared.ui';
import { useCallback, useMemo, useState } from 'react';

import { getPromptRoleBadgeClass, getPromptRoleInlineClasses, getPromptRoleLabel } from '@/lib/promptRoleUi';

import { usePromptVariables } from '../hooks/usePromptVariables';
import type { PromptTokenLine } from '../hooks/useShadowAnalysis';
import {
  buildCandidateSpans,
  buildVariableAwareSpans,
  type PromptVariableSpan,
  type VariableSpanInput,
} from '../lib/buildCandidateSpans';
import { collectVariableRangesFromString } from '../lib/variableTokenExtension';
import { usePromptSettingsStore } from '../stores/promptSettingsStore';
import type { PromptBlockCandidate } from '../types';

import { PromptHighlightedSpans } from './PromptHighlightedSpans';
import { PromptSpanTooltip } from './PromptSpanTooltip';
import { VariableEditPopover } from './VariableEditPopover';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A parsed prompt candidate for UI display.
 * This is transient data from the analyzer, NOT a stored PromptBlock entity.
 */
export type PromptCandidateDisplay = PromptBlockCandidate;

export interface PromptInlineViewerProps {
  /** Original prompt text */
  prompt: string;
  /** Parsed candidates with position data */
  candidates: PromptCandidateDisplay[];
  /** Show role legend below text */
  showLegend?: boolean;
  /** Custom class for the container */
  className?: string;
  /** Click handler for candidate spans */
  onCandidateClick?: (candidate: PromptCandidateDisplay) => void;
  /** When set, candidates of other roles render dimmed. */
  emphasizedRole?: string | null;
  /** Token lines from the same analysis response — the source of VAR-token
   *  ranges. Required for `enableVariableSave` to have anything to decorate. */
  tokenLines?: PromptTokenLine[];
  /** Opt in to the clickable VAR-token save/unsave popover (mirrors the
   *  CodeMirror viewer's `enableVariableSave`). Non-mutating to the prompt. */
  enableVariableSave?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface TooltipState {
  candidate: PromptCandidateDisplay;
  x: number;
  y: number;
}

export function PromptInlineViewer({
  prompt,
  candidates,
  showLegend = false,
  className = '',
  onCandidateClick,
  emphasizedRole = null,
  tokenLines,
  enableVariableSave = false,
}: PromptInlineViewerProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [hoveredSpanIdx, setHoveredSpanIdx] = useState<number | null>(null);
  const promptRoleColors = usePromptSettingsStore((state) => state.promptRoleColors);

  const { entries: savedVariableEntries, saveVariable, deleteVariable } = usePromptVariables();
  const toast = useToast();
  const savedVariableNames = useMemo(
    () => new Set(savedVariableEntries.map((entry) => entry.name)),
    [savedVariableEntries],
  );
  const [varPopover, setVarPopover] = useState<{
    anchor: HTMLElement;
    variable: PromptVariableSpan;
  } | null>(null);

  // VAR-token ranges from the backend tokenizer (same extraction the CodeMirror
  // surface uses), positioned against the original prompt text.
  const variableRanges = useMemo<VariableSpanInput[]>(() => {
    if (!enableVariableSave || !tokenLines) return [];
    return collectVariableRangesFromString({ tokenLines, savedNames: savedVariableNames }, prompt).map(
      (r) => ({ from: r.from, to: r.to, name: r.name, saved: r.saved, defaultClass: r.defaultClass }),
    );
  }, [enableVariableSave, tokenLines, savedVariableNames, prompt]);

  const spans = useMemo(
    () =>
      variableRanges.length > 0
        ? buildVariableAwareSpans(prompt, candidates, variableRanges)
        : buildCandidateSpans(prompt, candidates),
    [prompt, candidates, variableRanges],
  );

  const handleVariableClick = useCallback(
    (_event: React.MouseEvent<HTMLSpanElement>, variable: PromptVariableSpan, anchor: HTMLSpanElement) => {
      setVarPopover({ anchor, variable });
    },
    [],
  );

  // Unique roles present in candidates (drives the legend).
  const presentRoles = useMemo(() => {
    const roles = new Set<string>();
    for (const candidate of candidates) {
      if (candidate.role) roles.add(candidate.role);
    }
    return Array.from(roles);
  }, [candidates]);

  const handleSpanEnter = useCallback(
    (event: React.MouseEvent<HTMLSpanElement>, candidate: PromptCandidateDisplay) => {
      const target = event.currentTarget;
      const rect = target.getBoundingClientRect();
      const idxAttr = target.dataset.spanIdx;
      if (idxAttr) setHoveredSpanIdx(Number.parseInt(idxAttr, 10));
      setTooltip({ candidate, x: rect.left, y: rect.bottom });
    },
    [],
  );

  const handleSpanLeave = useCallback(() => {
    setHoveredSpanIdx(null);
    setTooltip(null);
  }, []);

  const handleSpanClick = useCallback(
    (_event: React.MouseEvent<HTMLSpanElement>, candidate: PromptCandidateDisplay) => {
      onCandidateClick?.(candidate);
    },
    [onCandidateClick],
  );

  return (
    <div className={`relative ${className}`}>
      <div className="text-base leading-relaxed whitespace-pre-wrap">
        <PromptHighlightedSpans
          spans={spans}
          roleColors={promptRoleColors}
          mode="visible"
          hoveredSpanIdx={hoveredSpanIdx}
          emphasizedRole={emphasizedRole}
          onSpanEnter={handleSpanEnter}
          onSpanLeave={handleSpanLeave}
          onSpanClick={onCandidateClick ? handleSpanClick : undefined}
          onVariableClick={enableVariableSave ? handleVariableClick : undefined}
        />
      </div>

      {enableVariableSave && (
        <Popover
          anchor={varPopover?.anchor ?? null}
          placement="bottom"
          align="start"
          offset={6}
          open={!!varPopover}
          onClose={() => setVarPopover(null)}
        >
          {varPopover &&
            (() => {
              const { variable } = varPopover;
              const entry = savedVariableEntries.find((e) => e.name === variable.name);
              const saved = savedVariableNames.has(variable.name);
              return (
                <VariableEditPopover
                  name={variable.name}
                  saved={saved}
                  defaultClass={variable.defaultClass}
                  description={entry?.description}
                  value={entry?.value}
                  transform={entry?.transform}
                  onCancel={() => setVarPopover(null)}
                  onSave={async (value, transform) => {
                    setVarPopover(null);
                    const result = await saveVariable(variable.name, {
                      allowExisting: true,
                      value,
                      transform: transform ?? '',
                    });
                    if (result.ok) toast.success(`Saved ${variable.name}`);
                    else if (result.code === 'duplicate')
                      toast.info(`${variable.name} is already saved`);
                    else toast.error(result.message ?? `Failed to save ${variable.name}`);
                  }}
                  onRemove={async () => {
                    setVarPopover(null);
                    const result = await deleteVariable(variable.name);
                    if (result.ok) toast.success(`Removed ${variable.name}`);
                    else toast.error(result.message ?? `Failed to remove ${variable.name}`);
                  }}
                />
              );
            })()}
        </Popover>
      )}

      {tooltip && (
        <PromptSpanTooltip
          candidate={tooltip.candidate}
          x={tooltip.x}
          y={tooltip.y}
          offsetY={4}
          roleColors={promptRoleColors}
        />
      )}

      {showLegend && presentRoles.length > 0 && (
        <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700">
          <div className="flex flex-wrap gap-3 text-xs">
            {presentRoles.map((role) => (
              <div key={role} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${getPromptRoleBadgeClass(role, promptRoleColors)}`} />
                <span className="text-neutral-600 dark:text-neutral-400">{getPromptRoleLabel(role)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidate List Fallback (when positions unavailable)
// ─────────────────────────────────────────────────────────────────────────────

export interface PromptCandidateListProps {
  candidates: PromptCandidateDisplay[];
  onCandidateClick?: (candidate: PromptCandidateDisplay) => void;
}

/**
 * Fallback display when position data is unavailable.
 * Shows candidates as a grouped list below the prompt.
 */
export function PromptCandidateList({ candidates, onCandidateClick }: PromptCandidateListProps) {
  const promptRoleColors = usePromptSettingsStore((state) => state.promptRoleColors);

  // Group by role
  const grouped = useMemo(() => {
    const groups: Record<string, PromptCandidateDisplay[]> = {};
    for (const candidate of candidates) {
      const roleKey = candidate.role ?? 'other';
      if (!groups[roleKey]) {
        groups[roleKey] = [];
      }
      groups[roleKey].push(candidate);
    }
    return groups;
  }, [candidates]);

  return (
    <div className="space-y-3">
      {(Object.entries(grouped) as [string, PromptCandidateDisplay[]][]).map(
        ([role, roleCandidates]) => {
          const inlineClasses = getPromptRoleInlineClasses(role, promptRoleColors);
          return (
            <div key={role}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${getPromptRoleBadgeClass(role, promptRoleColors)}`} />
                <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400 capitalize">
                  {getPromptRoleLabel(role)}
                </span>
              </div>
              <div className="space-y-1 ml-4">
                {roleCandidates.map((candidate, idx) => (
                  <button
                    key={idx}
                    onClick={() => onCandidateClick?.(candidate)}
                    className={`
                      w-full text-left px-2 py-1 text-sm rounded
                      ${inlineClasses.bg} ${inlineClasses.hover}
                      transition-colors cursor-pointer
                    `}
                  >
                    <span className="line-clamp-2">{candidate.text}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        }
      )}
    </div>
  );
}
