/**
 * Scenario Comparison
 *
 * Side-by-side comparison of two scenarios or snapshots.
 * Highlights differences in world state, relationships, and flags.
 */

import { Panel } from '@pixsim7/shared.ui';
import { formatWorldTime } from '@pixsim7/game.engine';
import type { SimulationScenario } from '@features/simulation/lib/core/scenarios';
import type { SimulationSnapshot } from '@features/simulation/history';

interface ScenarioComparisonProps {
  scenario1: SimulationScenario | SimulationSnapshot | null;
  scenario2: SimulationScenario | SimulationSnapshot | null;
  label1?: string;
  label2?: string;
}

function isScenario(item: any): item is SimulationScenario {
  return item && 'initialWorldTime' in item;
}

function isSnapshot(item: any): item is SimulationSnapshot {
  return item && 'timestamp' in item && 'worldTime' in item;
}

export function ScenarioComparison({
  scenario1,
  scenario2,
  label1 = 'Scenario A',
  label2 = 'Scenario B',
}: ScenarioComparisonProps) {
  if (!scenario1 || !scenario2) {
    return (
      <div className="text-sm text-neutral-500 text-center py-8">
        Select two scenarios or snapshots to compare
      </div>
    );
  }

  // Extract data from scenarios or snapshots
  const getData = (item: SimulationScenario | SimulationSnapshot) => {
    if (isScenario(item)) {
      return {
        name: item.name,
        worldTime: item.initialWorldTime,
        flags: item.initialSessionFlags,
        relationships: item.initialRelationships,
        npcIds: item.npcIds,
      };
    } else if (isSnapshot(item)) {
      return {
        name: `Snapshot (${new Date(item.timestamp).toLocaleTimeString()})`,
        worldTime: item.worldTime,
        flags: item.sessionSnapshot.flags,
        relationships: item.sessionSnapshot.relationships,
        npcIds: [],
      };
    }
    return null;
  };

  const data1 = getData(scenario1);
  const data2 = getData(scenario2);

  if (!data1 || !data2) {
    return (
      <div className="text-sm text-neutral-500 text-center py-8">
        Invalid comparison data
      </div>
    );
  }

  // Calculate differences
  const timeDiff = data2.worldTime - data1.worldTime;
  const flagKeys = new Set([...Object.keys(data1.flags), ...Object.keys(data2.flags)]);
  const relationshipKeys = new Set([
    ...Object.keys(data1.relationships),
    ...Object.keys(data2.relationships),
  ]);

  return (
    <div className="space-y-4">
      {/* Headers */}
      <div className="grid grid-cols-2 gap-4">
        <Panel className="p-3 bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700">
          <div className="text-sm font-semibold text-blue-900 dark:text-blue-300">{label1}</div>
          <div className="text-xs text-blue-700 dark:text-blue-400 mt-1">{data1.name}</div>
        </Panel>
        <Panel className="p-3 bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700">
          <div className="text-sm font-semibold text-green-900 dark:text-green-300">{label2}</div>
          <div className="text-xs text-green-700 dark:text-green-400 mt-1">{data2.name}</div>
        </Panel>
      </div>

      {/* World Time */}
      <Panel className="p-3">
        <div className="text-sm font-semibold mb-2">World Time</div>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="text-neutral-700 dark:text-neutral-300">
            {formatWorldTime(data1.worldTime)}
          </div>
          <div className="text-neutral-700 dark:text-neutral-300">
            {formatWorldTime(data2.worldTime)}
            {timeDiff !== 0 && (
              <span className="ml-2 text-[10px] text-neutral-500">
                ({timeDiff > 0 ? '+' : ''}{timeDiff}s)
              </span>
            )}
          </div>
        </div>
      </Panel>

      {/* NPCs */}
      {(data1.npcIds.length > 0 || data2.npcIds.length > 0) && (
        <Panel className="p-3">
          <div className="text-sm font-semibold mb-2">NPCs</div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              {data1.npcIds.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {data1.npcIds.map((id) => (
                    <span
                      key={id}
                      className={`px-2 py-0.5 rounded text-[10px] ${
                        data2.npcIds.includes(id)
                          ? 'bg-neutral-200 dark:bg-neutral-700'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      }`}
                    >
                      NPC #{id}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-neutral-500">None</span>
              )}
            </div>
            <div className="space-y-1">
              {data2.npcIds.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {data2.npcIds.map((id) => (
                    <span
                      key={id}
                      className={`px-2 py-0.5 rounded text-[10px] ${
                        data1.npcIds.includes(id)
                          ? 'bg-neutral-200 dark:bg-neutral-700'
                          : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      }`}
                    >
                      NPC #{id}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-neutral-500">None</span>
              )}
            </div>
          </div>
        </Panel>
      )}

      {/* Session Flags */}
      {flagKeys.size > 0 && (
        <Panel className="p-3">
          <div className="text-sm font-semibold mb-2">Session Flags</div>
          <div className="space-y-1 text-xs">
            {Array.from(flagKeys).map((key) => {
              const value1 = data1.flags[key];
              const value2 = data2.flags[key];
              const isDifferent = JSON.stringify(value1) !== JSON.stringify(value2);

              return (
                <div
                  key={key}
                  className={`grid grid-cols-2 gap-4 py-1 ${
                    isDifferent ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''
                  }`}
                >
                  <div className="font-mono text-[10px]">
                    <span className="text-neutral-600 dark:text-neutral-400">{key}:</span>{' '}
                    <span className="text-neutral-800 dark:text-neutral-200">
                      {value1 !== undefined ? JSON.stringify(value1) : '—'}
                    </span>
                  </div>
                  <div className="font-mono text-[10px]">
                    <span className="text-neutral-600 dark:text-neutral-400">{key}:</span>{' '}
                    <span className="text-neutral-800 dark:text-neutral-200">
                      {value2 !== undefined ? JSON.stringify(value2) : '—'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Relationships */}
      {relationshipKeys.size > 0 && (
        <Panel className="p-3">
          <div className="text-sm font-semibold mb-2">
            Relationships ({relationshipKeys.size})
          </div>
          <div className="text-xs text-neutral-500">
            {relationshipKeys.size} relationship key(s) tracked
          </div>
        </Panel>
      )}
    </div>
  );
}
