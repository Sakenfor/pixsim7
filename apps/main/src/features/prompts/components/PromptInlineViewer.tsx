/**
 * PromptInlineViewer Component
 *
 * Displays prompt text with inline span-based highlighting by role/category.
 * Uses position data from prompt analysis to create colored text segments.
 *
 * Features:
 * - Color-coded spans by role (character, action, setting, mood, etc.)
 * - Hover tooltips showing segment metadata (role, category)
 * - Fallback to plain text if no position data available
 *
 * Naming:
 * - PromptSegment = transient parsed output from API (not stored in DB)
 * - PromptBlock = stored entity in database (different from this)
 */

import { useMemo, useState, useCallback } from 'react';
import type { PromptSegmentRole } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A parsed prompt segment for UI display.
 * This is transient data from the analyzer, NOT a stored PromptBlock entity.
 */
export interface PromptSegment {
  role: PromptSegmentRole;
  text: string;
  start_pos?: number;
  end_pos?: number;
  category?: string;
  metadata?: Record<string, unknown>;
}

/** @deprecated Use PromptSegment instead */
export type PromptBlock = PromptSegment;

export interface PromptInlineViewerProps {
  /** Original prompt text */
  prompt: string;
  /** Parsed segments with position data */
  blocks: PromptSegment[];
  /** Show role legend below text */
  showLegend?: boolean;
  /** Custom class for the container */
  className?: string;
  /** Click handler for segment spans */
  onBlockClick?: (segment: PromptSegment) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Role Styling
// ─────────────────────────────────────────────────────────────────────────────

const roleStyles: Record<PromptSegmentRole, { bg: string; hover: string; label: string }> = {
  character: {
    bg: 'bg-blue-100/60 dark:bg-blue-900/40',
    hover: 'hover:bg-blue-200/80 dark:hover:bg-blue-800/60',
    label: 'Character',
  },
  action: {
    bg: 'bg-green-100/60 dark:bg-green-900/40',
    hover: 'hover:bg-green-200/80 dark:hover:bg-green-800/60',
    label: 'Action',
  },
  setting: {
    bg: 'bg-purple-100/60 dark:bg-purple-900/40',
    hover: 'hover:bg-purple-200/80 dark:hover:bg-purple-800/60',
    label: 'Setting',
  },
  mood: {
    bg: 'bg-yellow-100/60 dark:bg-yellow-900/40',
    hover: 'hover:bg-yellow-200/80 dark:hover:bg-yellow-800/60',
    label: 'Mood',
  },
  romance: {
    bg: 'bg-pink-100/60 dark:bg-pink-900/40',
    hover: 'hover:bg-pink-200/80 dark:hover:bg-pink-800/60',
    label: 'Romance',
  },
  other: {
    bg: 'bg-neutral-100/60 dark:bg-neutral-800/40',
    hover: 'hover:bg-neutral-200/80 dark:hover:bg-neutral-700/60',
    label: 'Other',
  },
};

const roleDotColors: Record<PromptSegmentRole, string> = {
  character: 'bg-blue-500',
  action: 'bg-green-500',
  setting: 'bg-purple-500',
  mood: 'bg-yellow-500',
  romance: 'bg-pink-500',
  other: 'bg-neutral-500',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface TextSpan {
  text: string;
  start: number;
  end: number;
  segment?: PromptSegment;
}

/**
 * Build text spans from segments with position data.
 * Fills gaps with unstyled spans for complete coverage.
 */
function buildSpans(prompt: string, segments: PromptSegment[]): TextSpan[] {
  // Filter to segments with valid positions
  const positioned = segments.filter(
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

    // Add segment span
    spans.push({
      text: prompt.slice(start, end),
      start,
      end,
      segment: seg,
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
  blocks,
  showLegend = false,
  className = '',
  onBlockClick,
}: PromptInlineViewerProps) {
  const [hoveredSegment, setHoveredSegment] = useState<PromptSegment | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const spans = useMemo(() => buildSpans(prompt, blocks), [prompt, blocks]);

  // Get unique roles present in segments
  const presentRoles = useMemo(() => {
    const roles = new Set<PromptSegmentRole>();
    for (const seg of blocks) {
      roles.add(seg.role);
    }
    return Array.from(roles);
  }, [blocks]);

  const handleMouseEnter = useCallback((e: React.MouseEvent, segment: PromptSegment) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setHoveredSegment(segment);
    setTooltipPos({ x: rect.left, y: rect.bottom + 4 });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredSegment(null);
    setTooltipPos(null);
  }, []);

  return (
    <div className={`relative ${className}`}>
      {/* Prompt text with inline highlights */}
      <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap">
        {spans.map((span, idx) => {
          if (!span.segment) {
            // Gap text - no styling
            return <span key={idx}>{span.text}</span>;
          }

          const style = roleStyles[span.segment.role] || roleStyles.other;

          return (
            <span
              key={idx}
              className={`
                inline rounded-sm px-0.5 py-px cursor-pointer transition-colors
                ${style.bg} ${style.hover}
              `}
              onMouseEnter={(e) => handleMouseEnter(e, span.segment!)}
              onMouseLeave={handleMouseLeave}
              onClick={() => onBlockClick?.(span.segment!)}
            >
              {span.text}
            </span>
          );
        })}
      </div>

      {/* Tooltip */}
      {hoveredSegment && tooltipPos && (
        <div
          className="fixed z-50 px-2 py-1 text-xs bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded shadow-lg pointer-events-none"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${roleDotColors[hoveredSegment.role]}`}
            />
            <span className="font-medium capitalize">{hoveredSegment.role}</span>
            {hoveredSegment.category && (
              <span className="text-neutral-400 dark:text-neutral-500">
                / {hoveredSegment.category}
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
                <span className={`w-2.5 h-2.5 rounded-full ${roleDotColors[role]}`} />
                <span className="text-neutral-600 dark:text-neutral-400">
                  {roleStyles[role]?.label || role}
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
// Segment List Fallback (when positions unavailable)
// ─────────────────────────────────────────────────────────────────────────────

export interface PromptSegmentListProps {
  segments: PromptSegment[];
  onSegmentClick?: (segment: PromptSegment) => void;
}

/** @deprecated Use PromptSegmentListProps instead */
export type PromptBlockListProps = PromptSegmentListProps;

/**
 * Fallback display when position data is unavailable.
 * Shows segments as a grouped list below the prompt.
 */
export function PromptBlockList({ segments, onSegmentClick }: PromptSegmentListProps) {
  // Group by role
  const grouped = useMemo(() => {
    const groups: Partial<Record<PromptSegmentRole, PromptSegment[]>> = {};
    for (const seg of segments) {
      if (!groups[seg.role]) {
        groups[seg.role] = [];
      }
      groups[seg.role]!.push(seg);
    }
    return groups;
  }, [segments]);

  return (
    <div className="space-y-3">
      {(Object.entries(grouped) as [PromptSegmentRole, PromptSegment[]][]).map(
        ([role, roleSegments]) => (
          <div key={role}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${roleDotColors[role]}`} />
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400 capitalize">
                {roleStyles[role]?.label || role}
              </span>
            </div>
            <div className="space-y-1 ml-4">
              {roleSegments.map((seg, idx) => (
                <button
                  key={idx}
                  onClick={() => onSegmentClick?.(seg)}
                  className={`
                    w-full text-left px-2 py-1 text-sm rounded
                    ${roleStyles[role].bg} ${roleStyles[role].hover}
                    transition-colors cursor-pointer
                  `}
                >
                  <span className="line-clamp-2">{seg.text}</span>
                </button>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}
