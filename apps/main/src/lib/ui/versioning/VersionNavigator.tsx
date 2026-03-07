/**
 * VersionNavigator — compact version stepper + timeline picker.
 *
 * Generic component for any versioned entity (assets, characters, prompts).
 * Shows current version badge, +/- stepper buttons, and a button to open
 * a full version timeline dropdown.
 *
 * Usage:
 *   <VersionNavigator
 *     versions={versions}
 *     currentEntityId={42}
 *     onSelect={(entry) => switchToVersion(entry.entityId)}
 *   />
 */
import type { VersionEntry } from '@pixsim7/shared.api.client/domains';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '@lib/icons';


// ── Props ─────────────────────────────────────────────────────────────

export interface VersionNavigatorProps {
  /** All versions (sorted by version number ascending). */
  versions: VersionEntry[];
  /** Entity ID of the currently active version. */
  currentEntityId: string | number;
  /** Called when user picks a different version. */
  onSelect: (entry: VersionEntry) => void;
  /** Optional renderer for each row in the timeline dropdown. */
  renderEntry?: (entry: VersionEntry, isCurrent: boolean) => React.ReactNode;
  /** Compact mode hides the timeline button (just shows badge + steppers). */
  compact?: boolean;
  /** Extra className on the root container. */
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────

export function VersionNavigator({
  versions,
  currentEntityId,
  onSelect,
  renderEntry,
  compact,
  className = '',
}: VersionNavigatorProps) {
  const currentIndex = useMemo(
    () => versions.findIndex((v) => v.entityId === currentEntityId),
    [versions, currentEntityId],
  );

  const current = currentIndex >= 0 ? versions[currentIndex] : null;
  const canPrev = currentIndex > 0;
  const canNext = currentIndex >= 0 && currentIndex < versions.length - 1;

  const handlePrev = useCallback(() => {
    if (canPrev) onSelect(versions[currentIndex - 1]);
  }, [canPrev, currentIndex, onSelect, versions]);

  const handleNext = useCallback(() => {
    if (canNext) onSelect(versions[currentIndex + 1]);
  }, [canNext, currentIndex, onSelect, versions]);

  // Timeline dropdown
  const [showTimeline, setShowTimeline] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const openTimeline = useCallback(() => {
    if (triggerRef.current) {
      setAnchorRect(triggerRef.current.getBoundingClientRect());
    }
    setShowTimeline(true);
  }, []);

  const closeTimeline = useCallback(() => {
    setShowTimeline(false);
    setAnchorRect(null);
  }, []);

  if (versions.length <= 1) return null;

  return (
    <div className={`inline-flex items-center gap-0.5 ${className}`}>
      {/* Prev */}
      <button
        onClick={handlePrev}
        disabled={!canPrev}
        className="w-5 h-5 flex items-center justify-center rounded text-th-secondary hover:bg-th/10 disabled:opacity-25 disabled:cursor-default transition-colors"
        title="Previous version"
      >
        <Icon name="chevronLeft" size={11} />
      </button>

      {/* Version badge */}
      <span
        className="text-[10px] tabular-nums text-th-secondary select-none px-0.5"
        title={current?.versionMessage || `Version ${current?.versionNumber}`}
      >
        v{current?.versionNumber ?? '?'}
        <span className="text-th-muted">/{versions.length}</span>
      </span>

      {/* Next */}
      <button
        onClick={handleNext}
        disabled={!canNext}
        className="w-5 h-5 flex items-center justify-center rounded text-th-secondary hover:bg-th/10 disabled:opacity-25 disabled:cursor-default transition-colors"
        title="Next version"
      >
        <Icon name="chevronRight" size={11} />
      </button>

      {/* Timeline button */}
      {!compact && (
        <button
          ref={triggerRef}
          onClick={showTimeline ? closeTimeline : openTimeline}
          className="w-5 h-5 flex items-center justify-center rounded text-th-secondary hover:bg-th/10 transition-colors"
          title="Version timeline"
        >
          <Icon name="gitBranch" size={11} />
        </button>
      )}

      {/* Timeline dropdown */}
      {showTimeline && anchorRect && (
        <VersionTimelineDropdown
          versions={versions}
          currentEntityId={currentEntityId}
          onSelect={(entry) => {
            onSelect(entry);
            closeTimeline();
          }}
          onClose={closeTimeline}
          anchorRect={anchorRect}
          renderEntry={renderEntry}
        />
      )}
    </div>
  );
}

// ── Timeline Dropdown ─────────────────────────────────────────────────

interface VersionTimelineDropdownProps {
  versions: VersionEntry[];
  currentEntityId: string | number;
  onSelect: (entry: VersionEntry) => void;
  onClose: () => void;
  anchorRect: DOMRect;
  renderEntry?: (entry: VersionEntry, isCurrent: boolean) => React.ReactNode;
}

function VersionTimelineDropdown({
  versions,
  currentEntityId,
  onSelect,
  onClose,
  anchorRect,
  renderEntry,
}: VersionTimelineDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Position
  const style = useMemo(() => {
    const { innerWidth, innerHeight } = window;
    const width = 220;
    const maxHeight = 280;

    let top = anchorRect.bottom + 4;
    let left = anchorRect.left;

    if (top + maxHeight > innerHeight - 16) {
      top = anchorRect.top - maxHeight - 4;
    }
    if (top < 16) top = 16;
    if (left + width > innerWidth - 16) {
      left = innerWidth - width - 16;
    }
    if (left < 16) left = 16;

    return { top, left, width, maxHeight };
  }, [anchorRect]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Show newest first
  const reversed = useMemo(() => [...versions].reverse(), [versions]);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-popover bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-xl overflow-hidden flex flex-col"
      style={style}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
        <span className="text-[11px] font-medium text-th-secondary">
          Version Timeline
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400"
        >
          <Icon name="x" size={10} />
        </button>
      </div>

      {/* Version list */}
      <div className="flex-1 overflow-y-auto py-1">
        {reversed.map((entry) => {
          const isCurrent = entry.entityId === currentEntityId;

          if (renderEntry) {
            return (
              <button
                key={String(entry.entityId)}
                onClick={() => onSelect(entry)}
                className={`w-full text-left px-2.5 py-1.5 transition-colors ${
                  isCurrent
                    ? 'bg-accent/10'
                    : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                {renderEntry(entry, isCurrent)}
              </button>
            );
          }

          return (
            <button
              key={String(entry.entityId)}
              onClick={() => onSelect(entry)}
              className={`w-full text-left px-2.5 py-1.5 flex items-center gap-2 transition-colors ${
                isCurrent
                  ? 'bg-accent/10'
                  : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              {/* Version dot + line */}
              <div className="flex flex-col items-center w-3 shrink-0">
                <div
                  className={`w-2 h-2 rounded-full ${
                    entry.isHead
                      ? 'bg-accent'
                      : isCurrent
                        ? 'bg-accent/60'
                        : 'bg-neutral-400 dark:bg-neutral-600'
                  }`}
                />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className={`text-[11px] tabular-nums font-medium ${
                    isCurrent ? 'text-accent' : 'text-th-primary'
                  }`}>
                    v{entry.versionNumber}
                  </span>
                  {entry.isHead && (
                    <span className="text-[9px] uppercase tracking-wider font-semibold text-accent bg-accent/10 px-1 rounded">
                      HEAD
                    </span>
                  )}
                </div>
                {entry.versionMessage && (
                  <div className="text-[10px] text-th-muted truncate">
                    {entry.versionMessage}
                  </div>
                )}
              </div>

              {/* Timestamp */}
              {entry.createdAt && (
                <span className="text-[9px] text-th-muted tabular-nums shrink-0">
                  {formatShortDate(entry.createdAt)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
