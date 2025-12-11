/**
 * NPC Presence Map World Tool Plugin
 *
 * Shows which NPCs are present at which locations and NPC slot assignments.
 */

import type { WorldToolPlugin } from '../lib/types';
import { Badge } from '@pixsim7/shared.ui';

export const npcPresenceDebugTool: WorldToolPlugin = {
  id: 'npc-presence-debug',
  name: 'NPC Presence',
  description: 'View NPC locations and slot assignments',
  icon: '📍',
  category: 'debug',

  // Show when we have a world
  whenVisible: (context) => context.selectedWorldId !== null,

  render: (context) => {
    const { locationDetail, locationNpcs, npcSlotAssignments } = context;

    return (
      <div className="space-y-4">
        {/* Current Location */}
        {locationDetail && (
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded border border-blue-200 dark:border-blue-800">
            <div className="font-semibold text-sm mb-1">{locationDetail.name}</div>
            <div className="text-xs text-neutral-600 dark:text-neutral-400">
              Location ID: #{locationDetail.id}
            </div>
          </div>
        )}

        {/* NPC Slot Assignments */}
        {npcSlotAssignments.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
              NPC Slot Assignments ({npcSlotAssignments.length})
            </div>
            <div className="space-y-2">
              {npcSlotAssignments.map((assignment, idx) => (
                <div
                  key={idx}
                  className="bg-neutral-50 dark:bg-neutral-800 p-3 rounded border border-neutral-200 dark:border-neutral-700"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm font-semibold">
                      {assignment.slot.id}
                    </span>
                    {assignment.npcId ? (
                      <Badge color="green">NPC #{assignment.npcId}</Badge>
                    ) : (
                      <Badge color="gray">Empty</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-neutral-500">Position:</span>{' '}
                      <span className="font-mono">
                        ({assignment.slot.x.toFixed(2)}, {assignment.slot.y.toFixed(2)})
                      </span>
                    </div>
                    {assignment.slot.fixedNpcId && (
                      <div>
                        <span className="text-neutral-500">Fixed:</span>{' '}
                        <Badge color="purple">NPC #{assignment.slot.fixedNpcId}</Badge>
                      </div>
                    )}
                  </div>

                  {assignment.slot.roles && assignment.slot.roles.length > 0 && (
                    <div className="mt-2">
                      <div className="text-neutral-500 text-xs mb-1">Roles:</div>
                      <div className="flex flex-wrap gap-1">
                        {assignment.slot.roles.map((role, roleIdx) => (
                          <Badge key={roleIdx} color="blue">{role}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {assignment.slot.interactions && (
                    <div className="mt-2">
                      <div className="text-neutral-500 text-xs mb-1">Interactions:</div>
                      <div className="flex flex-wrap gap-1">
                        {assignment.slot.interactions.canTalk && (
                          <Badge color="green">Talk</Badge>
                        )}
                        {assignment.slot.interactions.canPickpocket && (
                          <Badge color="red">Pickpocket</Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* NPCs Present (from backend) */}
        {locationNpcs.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
              NPCs Present (Backend) ({locationNpcs.length})
            </div>
            <div className="space-y-2">
              {locationNpcs.map((presence) => (
                <div
                  key={presence.npc_id}
                  className="bg-neutral-50 dark:bg-neutral-800 p-3 rounded border border-neutral-200 dark:border-neutral-700"
                >
                  <div className="flex items-center justify-between mb-1">
                    <Badge color="green">NPC #{presence.npc_id}</Badge>
                    <span className="text-xs text-neutral-500">
                      Location #{presence.location_id}
                    </span>
                  </div>

                  {presence.state && Object.keys(presence.state).length > 0 && (
                    <div className="mt-2">
                      <div className="text-neutral-500 text-xs mb-1">State:</div>
                      <div className="bg-white dark:bg-neutral-900 p-2 rounded border border-neutral-200 dark:border-neutral-600 font-mono text-xs overflow-x-auto">
                        <pre>{JSON.stringify(presence.state, null, 2)}</pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {npcSlotAssignments.length === 0 && locationNpcs.length === 0 && (
          <div className="text-sm text-neutral-500">
            No NPCs or slot assignments at current location
          </div>
        )}
      </div>
    );
  },
};
