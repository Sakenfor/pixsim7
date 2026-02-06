/**
 * PromptInlineViewer Component
 *
 * Displays prompt text with inline span-based highlighting by role/category.
 * Uses position data from prompt analysis to create colored text candidates.
 *
 * Features:
 * - Color-coded spans by role (character, action, setting, mood, etc.)
 * - Hover tooltips showing candidate metadata (role, category)
 * - Fallback to plain text if no position data available
 *
 * Naming:
 * - PromptBlockCandidate = transient parsed output from API (not stored in DB)
 * - PromptBlock = stored entity in database (different from this)
 */

import { useMemo, useState, useCallback } from 'react';
import type { PromptBlockCandidate } from '../types';
import { getPromptRoleBadgeClass, getPromptRoleInlineClasses, getPromptRoleLabel } from '@/lib/promptRoleUi';
import { usePromptSettingsStore } from '../stores/promptSettingsStore';

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
}

// ─────────────────────────────────────────────────────────────────────────────
// Role Styling
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface TextSpan {
  text: string;
  start: number;
  end: number;
  candidate?: PromptCandidateDisplay;
}

/**
 * Build text spans from candidates with position data.
 * Fills gaps with unstyled spans for complete coverage.
 */
function buildSpans(prompt: string, candidates: PromptCandidateDisplay[]): TextSpan[] {
  // Filter to candidates with valid positions
  const positioned = candidates.filter(
    (s) => typeof s.start_pos === 'number' && typeof s.end_pos === 'number'
  );

  if (positioned.length === 0) {
    // No position data - return entire prompt as single span
    return [{ text: prompt, start: 0, end: prompt.length }];
  }

  // Sort by start position
  const sorted = [...positioned].sort((a, b) => a.start_pos! - b.start_pos!);

  const spans: TextSpan[] = [];
  let cursor = 0;

  for (const seg of sorted) {
    const start = seg.start_pos!;
    const end = seg.end_pos!;

    // Add gap span if there's unmatched text before this segment
    if (start > cursor) {
      spans.push({
        text: prompt.slice(cursor, start),
        start: cursor,
        end: start,
      });
    }

    // Add candidate span
    spans.push({
      text: prompt.slice(start, end),
      start,
      end,
      candidate: seg,
    });

    cursor = end;
  }

  // Add trailing gap if any
  if (cursor < prompt.length) {
    spans.push({
      text: prompt.slice(cursor),
      start: cursor,
      end: prompt.length,
    });
  }

  return spans;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function PromptInlineViewer({
  prompt,
  candidates,
  showLegend = false,
  className = '',
  onCandidateClick,
}: PromptInlineViewerProps) {
  const [hoveredCandidate, setHoveredCandidate] = useState<PromptCandidateDisplay | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const promptRoleColors = usePromptSettingsStore((state) => state.promptRoleColors);

  const spans = useMemo(() => buildSpans(prompt, candidates), [prompt, candidates]);

  // Get unique roles present in candidates
  const presentRoles = useMemo(() => {
    const roles = new Set<string>();
    for (const candidate of candidates) {
      if (candidate.role) {
        roles.add(candidate.role);
      }
    }
    return Array.from(roles);
  }, [candidates]);

  const handleMouseEnter = useCallback((e: React.MouseEvent, candidate: PromptCandidateDisplay) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setHoveredCandidate(candidate);
    setTooltipPos({ x: rect.left, y: rect.bottom + 4 });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredCandidate(null);
    setTooltipPos(null);
  }, []);

  return (
    <div className={`relative ${className}`}>
      {/* Prompt text with inline highlights */}
      <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap">
        {spans.map((span, idx) => {
          if (!span.candidate) {
            // Gap text - no styling
            return <span key={idx}>{span.text}</span>;
          }

          const style = getPromptRoleInlineClasses(span.candidate.role, promptRoleColors);

          return (
            <span
              key={idx}
              className={`
                inline rounded-sm px-0.5 py-px cursor-pointer transition-colors
                ${style.bg} ${style.hover}
              `}
              onMouseEnter={(e) => handleMouseEnter(e, span.candidate!)}
              onMouseLeave={handleMouseLeave}
              onClick={() => onCandidateClick?.(span.candidate!)}
            >
              {span.text}
            </span>
          );
        })}
      </div>

      {/* Tooltip */}
      {hoveredCandidate && tooltipPos && (
        <div
          className="fixed z-50 px-2 py-1 text-xs bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded shadow-lg pointer-events-none"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${getPromptRoleBadgeClass(hoveredCandidate.role, promptRoleColors)}`}
            />
            <span className="font-medium">{getPromptRoleLabel(hoveredCandidate.role)}</span>
            {hoveredCandidate.category && (
              <span className="text-neutral-400 dark:text-neutral-500">
                / {hoveredCandidate.category}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      {showLegend && presentRoles.length > 0 && (
        <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700">
          <div className="flex flex-wrap gap-3 text-xs">
            {presentRoles.map((role) => (
              <div key={role} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${getPromptRoleBadgeClass(role, promptRoleColors)}`} />
                <span className="text-neutral-600 dark:text-neutral-400">
                  {getPromptRoleLabel(role)}
                </span>
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
