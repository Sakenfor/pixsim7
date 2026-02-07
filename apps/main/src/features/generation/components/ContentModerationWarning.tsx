/**
 * ContentModerationWarning Component
 *
 * Displays a warning banner when content moderation errors occur during generation.
 * Can be used in any generation-related UI context.
 */

import clsx from 'clsx';
import { useState, useMemo, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { GenerationModel } from '../models';
import { useGenerationsStore } from '../stores/generationsStore';

/** Pattern to detect content moderation errors (legacy fallback) */
const CONTENT_FILTERED_PATTERN = /Content filtered/i;

/** Structured error codes that represent content moderation issues */
const CONTENT_ERROR_CODES = new Set([
  'content_prompt_rejected',
  'content_text_rejected',
  'content_output_rejected',
  'content_image_rejected',
  'content_filtered',
]);

/** Check if a generation has a content moderation error */
function isContentModerationError(gen: GenerationModel): boolean {
  if (gen.errorCode && CONTENT_ERROR_CODES.has(gen.errorCode)) return true;
  // Legacy fallback: string pattern matching
  return !gen.errorCode && !!gen.errorMessage && CONTENT_FILTERED_PATTERN.test(gen.errorMessage);
}

/** Get friendly label from structured error_code or legacy error message */
function getModerationLabel(gen: GenerationModel): string {
  // Primary: structured errorCode
  if (gen.errorCode) {
    switch (gen.errorCode) {
      case 'content_prompt_rejected':
      case 'content_text_rejected':
        return 'Prompt rejected';
      case 'content_image_rejected':
        return 'Image rejected';
      case 'content_output_rejected':
        return 'Output rejected';
      case 'content_filtered':
      default:
        return 'Content filtered';
    }
  }

  // Legacy fallback: extract from error message string
  const match = gen.errorMessage?.match(/Content filtered \(([^)]+)\)/i);
  const type = match?.[1]?.toLowerCase();
  switch (type) {
    case 'prompt':
    case 'text':
      return 'Prompt rejected';
    case 'image':
      return 'Image rejected';
    case 'output':
      return 'Output rejected';
    default:
      return 'Content filtered';
  }
}

export interface ContentModerationWarningProps {
  /** Maximum number of warnings to show inline (rest are collapsed) */
  maxVisible?: number;
  /** Additional CSS classes */
  className?: string;
}

export function ContentModerationWarning({
  maxVisible = 1,
  className,
}: ContentModerationWarningProps) {
  // Track dismissed generation IDs
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());

  // Get all failed generations with content moderation errors
  // Use useShallow to prevent infinite re-renders from array reference changes
  const moderationWarnings = useGenerationsStore(
    useShallow((state) => {
      const warnings: GenerationModel[] = [];
      for (const gen of state.generations.values()) {
        if (gen.status === 'failed' && isContentModerationError(gen)) {
          warnings.push(gen);
        }
      }
      // Sort by most recent first
      return warnings.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    })
  );

  // Filter out dismissed warnings
  const activeWarnings = useMemo(
    () => moderationWarnings.filter((w) => !dismissedIds.has(w.id)),
    [moderationWarnings, dismissedIds]
  );

  // Dismiss a single warning
  const dismissWarning = useCallback((id: number) => {
    setDismissedIds((prev) => new Set([...prev, id]));
  }, []);

  // Dismiss all warnings
  const dismissAll = useCallback(() => {
    setDismissedIds((prev) => new Set([...prev, ...activeWarnings.map((w) => w.id)]));
  }, [activeWarnings]);

  // Don't render if no warnings
  if (activeWarnings.length === 0) {
    return null;
  }

  const visibleWarnings = activeWarnings.slice(0, maxVisible);
  const hiddenCount = activeWarnings.length - visibleWarnings.length;

  return (
    <div
      className={clsx(
        'flex items-center gap-1.5 px-2 py-0.5 rounded-md',
        'bg-amber-100/80 dark:bg-amber-900/40',
        'border border-amber-300/50 dark:border-amber-700/50',
        'text-amber-800 dark:text-amber-200',
        'text-[10px] font-medium',
        'animate-in fade-in slide-in-from-left-2 duration-200',
        className
      )}
      role="alert"
      aria-live="polite"
    >
      {/* Warning icon */}
      <span className="text-amber-600 dark:text-amber-400 flex-shrink-0">
        ⚠️
      </span>

      {/* Warning messages */}
      <div className="flex items-center gap-1 min-w-0 overflow-hidden">
        {visibleWarnings.map((warning, idx) => {
          const label = getModerationLabel(warning);

          return (
            <span key={warning.id} className="flex items-center gap-1 truncate">
              {idx > 0 && <span className="opacity-50">|</span>}
              <span className="truncate" title={warning.errorMessage || undefined}>
                {label}
              </span>
              <button
                onClick={() => dismissWarning(warning.id)}
                className="opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
                title="Dismiss"
                aria-label={`Dismiss warning for generation ${warning.id}`}
              >
                ×
              </button>
            </span>
          );
        })}

        {hiddenCount > 0 && (
          <span className="opacity-70 flex-shrink-0">
            +{hiddenCount} more
          </span>
        )}
      </div>

      {/* Dismiss all button (only if multiple) */}
      {activeWarnings.length > 1 && (
        <button
          onClick={dismissAll}
          className="ml-1 opacity-60 hover:opacity-100 transition-opacity text-[9px] underline flex-shrink-0"
          title="Dismiss all warnings"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
