/**
 * Multi-Run Comparison (Phase 6)
 *
 * Compare multiple simulation runs side-by-side with alignment by world time or tick index.
 * Shows metrics, deltas, and detailed snapshot comparisons.
 */

import { useState, useMemo } from 'react';
import { Panel, Button, Select } from '@pixsim7/shared.ui';
import { formatWorldTime } from '@pixsim7/game.engine';
import type { SavedSimulationRun } from '@/lib/simulation/multiRunStorage';
import {
  alignSnapshotsByWorldTime,
  alignSnapshotsByIndex,
  calculateSnapshotDeltas,
  getRunSummary,
} from '@/lib/simulation/multiRunStorage';

interface MultiRunComparisonProps {
  runs: SavedSimulationRun[];
  onRemoveRun?: (runId: string) => void;
}

type AlignmentMode = 'worldTime' | 'index';

export function MultiRunComparison({ runs, onRemoveRun }: MultiRunComparisonProps) {
  const [alignmentMode, setAlignmentMode] = useState<AlignmentMode>('worldTime');
  const [selectedAlignmentPoint, setSelectedAlignmentPoint] = useState<number>(0);
  const [showMetrics, setShowMetrics] = useState(true);
  const [showDeltas, setShowDeltas] = useState(true);

  // Calculate alignment
  const alignment = useMemo(() => {
    if (alignmentMode === 'worldTime') {
      return alignSnapshotsByWorldTime(runs);
    } else {
      return alignSnapshotsByIndex(runs);
    }
  }, [runs, alignmentMode]);

  const { worldTimes, alignedSnapshots, indices } = useMemo(() => {
    if (alignmentMode === 'worldTime') {
      const result = alignSnapshotsByWorldTime(runs);
      return { worldTimes: result.worldTimes, alignedSnapshots: result.alignedSnapshots, indices: [] };
    } else {
      const result = alignSnapshotsByIndex(runs);
      return { worldTimes: [], alignedSnapshots: result.alignedSnapshots, indices: result.indices };
    }
  }, [runs, alignmentMode]);

  // Calculate run summaries
  const runSummaries = useMemo(() => runs.map(getRunSummary), [runs]);

  // Get snapshots at selected alignment point
  const selectedSnapshots = useMemo(() => {
    if (selectedAlignmentPoint < 0) return [];
    return alignedSnapshots.map((snapshots) => snapshots[selectedAlignmentPoint] ?? null);
  }, [alignedSnapshots, selectedAlignmentPoint]);

  // Calculate deltas between consecutive runs at selected point
  const deltas = useMemo(() => {
    const result = [];
    for (let i = 0; i < selectedSnapshots.length - 1; i++) {
      result.push(calculateSnapshotDeltas(selectedSnapshots[i], selectedSnapshots[i + 1]));
    }
    return result;
  }, [selectedSnapshots]);

  if (runs.length === 0) {
    return (
      <div className="text-sm text-neutral-500 text-center py-8">
        No runs selected for comparison. Save some simulation runs to compare them.
      </div>
    );
  }

  const alignmentPoints = alignmentMode === 'worldTime' ? worldTimes : indices;
  const currentAlignmentValue =
    alignmentMode === 'worldTime'
      ? worldTimes[selectedAlignmentPoint]
      : selectedAlignmentPoint;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Panel className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold">Alignment:</label>
            <Select
              size="sm"
              value={alignmentMode}
              onChange={(e) => {
                setAlignmentMode(e.target.value as AlignmentMode);
                setSelectedAlignmentPoint(0);
              }}
            >
              <option value="worldTime">By World Time</option>
              <option value="index">By Tick Index</option>
            </Select>
          </div>

          {alignmentPoints.length > 0 && (
            <div className="flex items-center gap-2 flex-1">
              <label className="text-sm">Point:</label>
              <input
                type="range"
                min={0}
                max={alignmentPoints.length - 1}
                value={selectedAlignmentPoint}
                onChange={(e) => setSelectedAlignmentPoint(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-xs text-neutral-600 dark:text-neutral-400 min-w-[100px]">
                {alignmentMode === 'worldTime'
                  ? formatWorldTime(currentAlignmentValue as number)
                  : `Tick #${currentAlignmentValue}`}
              </span>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              variant={showMetrics ? 'primary' : 'secondary'}
              onClick={() => setShowMetrics(!showMetrics)}
            >
              Metrics
            </Button>
            <Button
              size="sm"
              variant={showDeltas ? 'primary' : 'secondary'}
              onClick={() => setShowDeltas(!showDeltas)}
            >
              Deltas
            </Button>
          </div>
        </div>
      </Panel>

      {/* Run Headers */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${runs.length}, 1fr)` }}>
        {runs.map((run, index) => {
          const colorClasses = [
            'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-300',
            'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-900 dark:text-green-300',
            'bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700 text-purple-900 dark:text-purple-300',
            'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700 text-orange-900 dark:text-orange-300',
          ];
          const colorClass = colorClasses[index % colorClasses.length];

          return (
            <Panel key={run.id} className={`p-3 ${colorClass}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{run.name}</div>
                  <div className="text-xs opacity-80 mt-1">
                    World: {run.worldName || `#${run.worldId}`}
                  </div>
                  {run.description && (
                    <div className="text-xs opacity-70 mt-1">{run.description}</div>
                  )}
                </div>
                {onRemoveRun && (
                  <button
                    onClick={() => onRemoveRun(run.id)}
                    className="text-xs opacity-70 hover:opacity-100"
                    title="Remove from comparison"
                  >
                    ✕
                  </button>
                )}
              </div>
            </Panel>
          );
        })}
      </div>

      {/* Metrics Summary */}
      {showMetrics && (
        <Panel className="p-4">
          <h3 className="text-sm font-semibold mb-3">Run Metrics</h3>
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${runs.length}, 1fr)` }}>
            {runSummaries.map((summary, index) => (
              <div key={runs[index].id} className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-neutral-600 dark:text-neutral-400">Snapshots:</span>
                  <span className="font-semibold">{summary.totalSnapshots}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600 dark:text-neutral-400">Events:</span>
                  <span className="font-semibold">{summary.totalEvents}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600 dark:text-neutral-400">Duration:</span>
                  <span className="font-semibold">{Math.floor(summary.duration / 1000)}s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600 dark:text-neutral-400">Time Range:</span>
                  <span className="font-mono text-[10px]">
                    {formatWorldTime(summary.startWorldTime, { shortDay: true })} →{' '}
                    {formatWorldTime(summary.endWorldTime, { shortDay: true })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600 dark:text-neutral-400">Flags:</span>
                  <span className="font-semibold">{summary.uniqueFlags}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600 dark:text-neutral-400">Relationships:</span>
                  <span className="font-semibold">{summary.uniqueRelationships}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Snapshot Comparison at Selected Point */}
      <Panel className="p-4">
        <h3 className="text-sm font-semibold mb-3">
          Snapshots at {alignmentMode === 'worldTime' ? 'World Time' : 'Tick'}{' '}
          {alignmentMode === 'worldTime'
            ? formatWorldTime(currentAlignmentValue as number)
            : `#${currentAlignmentValue}`}
        </h3>

        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${runs.length}, 1fr)` }}>
          {selectedSnapshots.map((snapshot, index) => (
            <div key={runs[index].id} className="space-y-2">
              {snapshot ? (
                <>
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-neutral-600 dark:text-neutral-400">World Time:</span>
                      <span className="font-mono text-[10px]">
                        {formatWorldTime(snapshot.worldTime)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-600 dark:text-neutral-400">Events:</span>
                      <span className="font-semibold">{snapshot.events.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-600 dark:text-neutral-400">Flags:</span>
                      <span className="font-semibold">
                        {Object.keys(snapshot.sessionSnapshot.flags).length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-600 dark:text-neutral-400">
                        Relationships:
                      </span>
                      <span className="font-semibold">
                        {Object.keys(snapshot.sessionSnapshot.relationships).length}
                      </span>
                    </div>
                  </div>

                  {/* Recent Events */}
                  {snapshot.events.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-neutral-300 dark:border-neutral-700">
                      <div className="text-xs font-semibold mb-1">Recent Events:</div>
                      <div className="space-y-1">
                        {snapshot.events.slice(0, 3).map((event, eventIdx) => (
                          <div
                            key={eventIdx}
                            className="text-[10px] text-neutral-600 dark:text-neutral-400 truncate"
                          >
                            • {event.title}
                          </div>
                        ))}
                        {snapshot.events.length > 3 && (
                          <div className="text-[10px] text-neutral-500">
                            +{snapshot.events.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-neutral-500 italic py-4 text-center">
                  No snapshot at this point
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>

      {/* Deltas */}
      {showDeltas && deltas.length > 0 && (
        <Panel className="p-4">
          <h3 className="text-sm font-semibold mb-3">Deltas Between Runs</h3>
          <div className="space-y-4">
            {deltas.map((delta, index) => {
              const hasChanges =
                delta.timeDelta !== 0 ||
                delta.flagChanges.length > 0 ||
                delta.relationshipChanges.length > 0 ||
                delta.eventCountDelta !== 0;

              if (!hasChanges) {
                return (
                  <div
                    key={index}
                    className="text-xs text-neutral-500 p-3 bg-neutral-50 dark:bg-neutral-800 rounded"
                  >
                    Run {index + 1} → Run {index + 2}: No differences
                  </div>
                );
              }

              return (
                <div
                  key={index}
                  className="p-3 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-300 dark:border-yellow-700 rounded"
                >
                  <div className="text-sm font-semibold mb-2">
                    Run {index + 1} ({runs[index].name}) → Run {index + 2} (
                    {runs[index + 1].name})
                  </div>

                  <div className="space-y-2 text-xs">
                    {delta.timeDelta !== 0 && (
                      <div>
                        <span className="text-neutral-600 dark:text-neutral-400">
                          Time Delta:
                        </span>{' '}
                        <span className="font-semibold">
                          {delta.timeDelta > 0 ? '+' : ''}
                          {delta.timeDelta}s
                        </span>
                      </div>
                    )}

                    {delta.eventCountDelta !== 0 && (
                      <div>
                        <span className="text-neutral-600 dark:text-neutral-400">
                          Event Count Delta:
                        </span>{' '}
                        <span className="font-semibold">
                          {delta.eventCountDelta > 0 ? '+' : ''}
                          {delta.eventCountDelta}
                        </span>
                      </div>
                    )}

                    {delta.flagChanges.length > 0 && (
                      <div>
                        <div className="font-semibold mb-1">
                          Flag Changes ({delta.flagChanges.length}):
                        </div>
                        <div className="space-y-1 ml-2">
                          {delta.flagChanges.slice(0, 5).map((change, i) => (
                            <div key={i} className="font-mono text-[10px]">
                              <span className="text-neutral-600 dark:text-neutral-400">
                                {change.key}:
                              </span>{' '}
                              <span className="text-red-600 dark:text-red-400">
                                {JSON.stringify(change.from)}
                              </span>{' '}
                              →{' '}
                              <span className="text-green-600 dark:text-green-400">
                                {JSON.stringify(change.to)}
                              </span>
                            </div>
                          ))}
                          {delta.flagChanges.length > 5 && (
                            <div className="text-[10px] text-neutral-500">
                              +{delta.flagChanges.length - 5} more changes
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {delta.relationshipChanges.length > 0 && (
                      <div>
                        <div className="font-semibold mb-1">
                          Relationship Changes ({delta.relationshipChanges.length}):
                        </div>
                        <div className="text-[10px] text-neutral-500 ml-2">
                          {delta.relationshipChanges.length} relationship(s) changed
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* World Coverage Map */}
      <Panel className="p-4">
        <h3 className="text-sm font-semibold mb-3">World Time Coverage</h3>
        <div className="space-y-2">
          {runs.map((run, index) => {
            const summary = runSummaries[index];
            return (
              <div key={run.id} className="flex items-center gap-2">
                <div className="text-xs w-32 truncate">{run.name}</div>
                <div className="flex-1 h-4 bg-neutral-200 dark:bg-neutral-700 rounded overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-green-500"
                    style={{
                      width: `${
                        summary.totalSnapshots > 0
                          ? Math.min(
                              100,
                              (summary.totalSnapshots /
                                Math.max(...runSummaries.map((s) => s.totalSnapshots))) *
                                100
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <div className="text-xs text-neutral-600 dark:text-neutral-400 w-20 text-right">
                  {summary.totalSnapshots} ticks
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
