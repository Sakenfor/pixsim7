/**
 * World Info World Tool Plugin
 *
 * Displays current world state and debug information.
 */

import type { WorldToolPlugin } from '../../lib/worldTools/types';
import { Panel } from '@pixsim7/ui';

export const worldInfoTool: WorldToolPlugin = {
  id: 'world-info',
  name: 'World Info',
  description: 'View current world state and debug info',
  icon: '🌍',
  category: 'debug',

  // Always visible
  whenVisible: () => true,

  render: (context) => {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
              World
            </div>
            <div className="text-sm">
              {context.worldDetail?.name || '(none)'}
            </div>
            {context.selectedWorldId && (
              <div className="text-xs text-neutral-500">
                ID: {context.selectedWorldId}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
              Time
            </div>
            <div className="text-sm">
              Day {context.worldTime.day}, {context.worldTime.hour.toString().padStart(2, '0')}:00
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
              Location
            </div>
            <div className="text-sm">
              {context.locationDetail?.name || '(none)'}
            </div>
            {context.selectedLocationId && (
              <div className="text-xs text-neutral-500">
                ID: {context.selectedLocationId}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
              NPCs Present
            </div>
            <div className="text-sm">
              {context.locationNpcs.length}
            </div>
          </div>
        </div>

        {context.session && (
          <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3">
            <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
              Session Info
            </div>
            <div className="space-y-1">
              <div className="text-xs">
                <span className="text-neutral-500">Session ID:</span> {context.session.id}
              </div>
              <div className="text-xs">
                <span className="text-neutral-500">Relationships:</span>{' '}
                {Object.keys(context.relationships).length}
              </div>
            </div>
          </div>
        )}

        {context.npcSlotAssignments.length > 0 && (
          <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3">
            <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
              NPC Slots
            </div>
            <div className="space-y-1">
              {context.npcSlotAssignments.map((assignment, idx) => (
                <div key={idx} className="text-xs flex justify-between">
                  <span className="text-neutral-500">{assignment.slot.id}:</span>
                  <span>{assignment.npcId ? `NPC #${assignment.npcId}` : '(empty)'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  },
};
