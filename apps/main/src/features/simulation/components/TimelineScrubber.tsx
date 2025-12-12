/**
 * Timeline Scrubber
 *
 * Interactive timeline component for navigating simulation history.
 * Allows scrubbing through snapshots with visual feedback.
 */

import { useState, useRef, useEffect } from 'react';
import { formatWorldTime } from '@pixsim7/game.engine';
import type { SimulationSnapshot } from '@features/simulation/history';

interface TimelineScrubberProps {
  snapshots: SimulationSnapshot[];
  currentIndex: number;
  onSnapshotSelect: (index: number) => void;
}

export function TimelineScrubber({
  snapshots,
  currentIndex,
  onSnapshotSelect,
}: TimelineScrubberProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const percentage = Math.max(0, Math.min(1, x / width));
    const index = Math.floor(percentage * snapshots.length);

    setHoveredIndex(Math.min(index, snapshots.length - 1));

    if (isDragging) {
      onSnapshotSelect(Math.min(index, snapshots.length - 1));
    }
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
    setIsDragging(false);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const percentage = Math.max(0, Math.min(1, x / width));
    const index = Math.floor(percentage * snapshots.length);

    onSnapshotSelect(Math.min(index, snapshots.length - 1));
  };

  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseUp = () => setIsDragging(false);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }
  }, [isDragging]);

  if (snapshots.length === 0) {
    return (
      <div className="text-xs text-neutral-500 text-center py-4">
        No history snapshots available
      </div>
    );
  }

  const displayIndex = hoveredIndex !== null ? hoveredIndex : currentIndex;
  const displaySnapshot = snapshots[displayIndex];

  return (
    <div className="space-y-2">
      {/* Timeline Track */}
      <div
        ref={timelineRef}
        className="relative h-12 bg-neutral-200 dark:bg-neutral-700 rounded cursor-pointer select-none"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        {/* Snapshot Markers */}
        {snapshots.map((snapshot, idx) => {
          const position = (idx / (snapshots.length - 1)) * 100;
          const isCurrent = idx === currentIndex;
          const isHovered = idx === hoveredIndex;

          return (
            <div
              key={snapshot.id}
              className="absolute top-0 bottom-0 flex items-center"
              style={{ left: `${position}%` }}
            >
              <div
                className={`w-1 h-full transition-colors ${
                  isCurrent
                    ? 'bg-blue-600'
                    : isHovered
                    ? 'bg-blue-400'
                    : snapshot.events.length > 0
                    ? 'bg-neutral-400 dark:bg-neutral-500'
                    : 'bg-neutral-300 dark:bg-neutral-600'
                }`}
              />
            </div>
          );
        })}

        {/* Current Position Indicator */}
        <div
          className="absolute top-0 bottom-0 w-2 bg-blue-600 rounded-full shadow-lg transform -translate-x-1/2 pointer-events-none"
          style={{ left: `${(currentIndex / (snapshots.length - 1)) * 100}%` }}
        >
          <div className="absolute -top-1 -left-1 w-4 h-14 bg-blue-600 rounded-full opacity-50 shadow-lg shadow-blue-600/50" />
        </div>

        {/* Hover Indicator */}
        {hoveredIndex !== null && hoveredIndex !== currentIndex && (
          <div
            className="absolute top-0 bottom-0 w-1 bg-blue-400 transform -translate-x-1/2 pointer-events-none"
            style={{ left: `${(hoveredIndex / (snapshots.length - 1)) * 100}%` }}
          />
        )}
      </div>

      {/* Snapshot Info */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-neutral-700 dark:text-neutral-300">
            Snapshot #{displayIndex + 1} / {snapshots.length}
          </span>
          <span className="text-neutral-500">
            {formatWorldTime(displaySnapshot.worldTime, { shortDay: true })}
          </span>
        </div>
        <div className="text-neutral-500">
          {displaySnapshot.events.length} event{displaySnapshot.events.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => onSnapshotSelect(0)}
          disabled={currentIndex === 0}
          className="px-2 py-1 text-xs rounded bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          ⏮ Start
        </button>
        <button
          onClick={() => onSnapshotSelect(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
          className="px-2 py-1 text-xs rounded bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          ◀ Prev
        </button>
        <button
          onClick={() => onSnapshotSelect(Math.min(snapshots.length - 1, currentIndex + 1))}
          disabled={currentIndex === snapshots.length - 1}
          className="px-2 py-1 text-xs rounded bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Next ▶
        </button>
        <button
          onClick={() => onSnapshotSelect(snapshots.length - 1)}
          disabled={currentIndex === snapshots.length - 1}
          className="px-2 py-1 text-xs rounded bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          End ⏭
        </button>
      </div>
    </div>
  );
}
