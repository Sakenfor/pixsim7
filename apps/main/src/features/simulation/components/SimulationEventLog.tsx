/**
 * SimulationEventLog
 *
 * Renders the events-log panel showing recent simulation events.
 */

import { formatWorldTime } from '@pixsim7/game.engine';
import { Panel } from '@pixsim7/shared.ui';

import type { GameEvent } from '@lib/game/runtime';

export interface SimulationEventLogProps {
  events: GameEvent[];
}

export function SimulationEventLog({ events }: SimulationEventLogProps) {
  return (
    <Panel className="p-4 space-y-3">
      <h2 className="text-sm font-semibold">Simulation Events</h2>
      {events.length === 0 ? (
        <p className="text-xs text-neutral-500">No events yet. Advance time to generate events.</p>
      ) : (
        <div className="max-h-64 overflow-y-auto space-y-2">
          {events
            .slice()
            .reverse()
            .map((event) => (
              <div
                key={event.id}
                className={`p-2 rounded text-xs border ${
                  event.type === 'error'
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
                    : event.type === 'warning'
                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700'
                    : event.type === 'success'
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                    : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{event.title}</span>
                      <span className="text-[10px] px-1 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700">
                        {event.category}
                      </span>
                    </div>
                    <p className="text-neutral-600 dark:text-neutral-400 mt-1">{event.message}</p>
                  </div>
                  <span className="text-[10px] text-neutral-500">
                    {formatWorldTime(event.worldTime, { shortDay: true })}
                  </span>
                </div>
              </div>
            ))}
        </div>
      )}
    </Panel>
  );
}
