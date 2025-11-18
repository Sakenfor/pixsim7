/**
 * Turn History Viewer World Tool Plugin
 *
 * Displays turn history for turn-based game sessions.
 */

import type { WorldToolPlugin } from '../../lib/worldTools/types';
import type { TurnRecord, SessionFlags } from '@pixsim7/types';
import { Badge } from '@pixsim7/ui';

export const turnHistoryDebugTool: WorldToolPlugin = {
  id: 'turn-history-debug',
  name: 'Turn History',
  description: 'View turn-based game progression history',
  icon: '📜',
  category: 'debug',

  // Show when we have a session in turn-based mode
  whenVisible: (context) => {
    if (!context.session) return false;
    const flags = context.session.flags as SessionFlags;
    return flags.world?.mode === 'turn_based';
  },

  render: (context) => {
    const { session, sessionFlags } = context;

    if (!session) {
      return (
        <div className="text-sm text-neutral-500">
          No active game session
        </div>
      );
    }

    const flags = sessionFlags as SessionFlags;
    const worldFlags = flags.world;

    if (!worldFlags) {
      return (
        <div className="text-sm text-neutral-500">
          No world flags found
        </div>
      );
    }

    const turnHistory = worldFlags.turnHistory || [];
    const currentTurn = worldFlags.turnNumber || 0;
    const turnDelta = worldFlags.turnDeltaSeconds || 3600;

    return (
      <div className="space-y-3">
        {/* Current State */}
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded border border-blue-200 dark:border-blue-800">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-neutral-600 dark:text-neutral-400">Current Turn:</span>{' '}
              <span className="font-semibold">#{currentTurn}</span>
            </div>
            <div>
              <span className="text-neutral-600 dark:text-neutral-400">Turn Delta:</span>{' '}
              <span className="font-semibold">{turnDelta}s ({turnDelta / 3600}h)</span>
            </div>
          </div>
        </div>

        {/* Turn History */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
              Turn History
            </div>
            <Badge color="blue">{turnHistory.length} turns</Badge>
          </div>

          {turnHistory.length === 0 ? (
            <div className="text-sm text-neutral-500">
              No turn history recorded yet
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {turnHistory.slice().reverse().map((turn, idx) => (
                <TurnHistoryCard
                  key={turn.turnNumber}
                  turn={turn}
                  isLatest={idx === 0}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  },
};

interface TurnHistoryCardProps {
  turn: TurnRecord;
  isLatest: boolean;
}

function TurnHistoryCard({ turn, isLatest }: TurnHistoryCardProps) {
  const date = new Date(turn.timestamp);
  const worldDay = Math.floor(turn.worldTime / 86400);
  const worldHour = Math.floor((turn.worldTime % 86400) / 3600);

  return (
    <div className={`p-3 rounded border ${
      isLatest
        ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
        : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">Turn #{turn.turnNumber}</span>
          {isLatest && <Badge color="green">Latest</Badge>}
        </div>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {date.toLocaleString()}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-neutral-600 dark:text-neutral-400">World Time:</span>{' '}
          <span className="font-mono">
            Day {worldDay}, {worldHour.toString().padStart(2, '0')}:00
          </span>
        </div>
        {turn.locationId !== undefined && (
          <div>
            <span className="text-neutral-600 dark:text-neutral-400">Location:</span>{' '}
            <span className="font-mono">#{turn.locationId}</span>
          </div>
        )}
      </div>
    </div>
  );
}
