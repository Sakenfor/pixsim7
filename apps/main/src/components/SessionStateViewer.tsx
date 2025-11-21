import { useState, useEffect } from 'react';
import { Button, Select, useToast } from '@pixsim7/shared.ui';
import { getGameSession, listGameSessions, type GameSessionDTO } from '../lib/api/game';
import { parseNpcKey, parseArcKey, parseQuestKey } from '@pixsim7/game.engine';

/**
 * Session State Viewer
 *
 * Debug panel for inspecting GameSession state including:
 * - Flags (arcs, quests, inventory, events)
 * - Relationships (NPC affinity/trust, NPC pairs)
 * - World time and session metadata
 *
 * Useful for debugging scene effects and tracking game state progression.
 */
export function SessionStateViewer() {
  const toast = useToast();
  const [sessions, setSessions] = useState<Array<{ id: number; created_at: string }>>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [session, setSession] = useState<GameSessionDTO | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [filter, setFilter] = useState<'all' | 'arcs' | 'quests' | 'relationships' | 'inventory'>('all');

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  // Auto-refresh when enabled
  useEffect(() => {
    if (!autoRefresh || !selectedSessionId) return;

    const interval = setInterval(() => {
      loadSession(selectedSessionId);
    }, 2000); // Refresh every 2 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, selectedSessionId]);

  const loadSessions = async () => {
    try {
      const data = await listGameSessions();
      setSessions(data);
      if (data.length > 0 && !selectedSessionId) {
        setSelectedSessionId(data[0].id);
        loadSession(data[0].id);
      }
    } catch (error) {
      toast.error(`Failed to load sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const loadSession = async (sessionId: number) => {
    setIsLoading(true);
    try {
      const data = await getGameSession(sessionId);
      setSession(data);
    } catch (error) {
      toast.error(`Failed to load session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSessionChange = (sessionId: number) => {
    setSelectedSessionId(sessionId);
    loadSession(sessionId);
  };

  const formatWorldTime = (seconds: number): string => {
    const totalHours = Math.floor(seconds / 3600);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const minutes = Math.floor((seconds % 3600) / 60);
    return `Day ${days + 1}, ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  const renderFlags = () => {
    if (!session || !session.flags) return null;

    const flags = session.flags as Record<string, any>;
    const arcs = flags.arcs || {};
    const quests = flags.quests || {};
    const inventory = flags.inventory || {};
    const events = flags.events || {};
    const sessionKind = flags.sessionKind;
    const world = flags.world;

    return (
      <div className="space-y-3">
        {/* Session Kind & World */}
        {(sessionKind || world) && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
            <h4 className="text-sm font-semibold mb-2">Session Info</h4>
            <div className="text-xs space-y-1">
              {sessionKind && (
                <div>
                  <span className="text-neutral-600 dark:text-neutral-400">Kind:</span>{' '}
                  <span className="font-mono">{sessionKind}</span>
                </div>
              )}
              {world && (
                <div>
                  <span className="text-neutral-600 dark:text-neutral-400">World:</span>{' '}
                  <pre className="inline font-mono text-xs">{JSON.stringify(world)}</pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Arcs */}
        {(filter === 'all' || filter === 'arcs') && Object.keys(arcs).length > 0 && (
          <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded">
            <h4 className="text-sm font-semibold mb-2">Story Arcs</h4>
            <div className="space-y-2">
              {Object.entries(arcs).map(([arcId, arcData]: [string, any]) => (
                <div key={arcId} className="text-xs">
                  <div className="font-semibold text-purple-900 dark:text-purple-300">{arcId}</div>
                  <pre className="mt-1 p-2 bg-white dark:bg-neutral-800 rounded font-mono text-xs overflow-x-auto">
                    {JSON.stringify(arcData, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quests */}
        {(filter === 'all' || filter === 'quests') && Object.keys(quests).length > 0 && (
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
            <h4 className="text-sm font-semibold mb-2">Quests</h4>
            <div className="space-y-2">
              {Object.entries(quests).map(([questId, questData]: [string, any]) => (
                <div key={questId} className="text-xs">
                  <div className="font-semibold text-amber-900 dark:text-amber-300">{questId}</div>
                  <pre className="mt-1 p-2 bg-white dark:bg-neutral-800 rounded font-mono text-xs overflow-x-auto">
                    {JSON.stringify(questData, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Inventory */}
        {(filter === 'all' || filter === 'inventory') && inventory.items && inventory.items.length > 0 && (
          <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
            <h4 className="text-sm font-semibold mb-2">Inventory</h4>
            <div className="space-y-1">
              {inventory.items.map((item: any, idx: number) => (
                <div key={idx} className="text-xs flex justify-between">
                  <span className="font-mono">{item.id}</span>
                  <span className="text-neutral-600 dark:text-neutral-400">×{item.qty}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Events */}
        {Object.keys(events).length > 0 && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
            <h4 className="text-sm font-semibold mb-2">World Events</h4>
            <div className="space-y-2">
              {Object.entries(events).map(([eventId, eventData]: [string, any]) => (
                <div key={eventId} className="text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-red-900 dark:text-red-300">{eventId}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${eventData.active ? 'bg-red-500 text-white' : 'bg-neutral-300 dark:bg-neutral-600 text-neutral-700 dark:text-neutral-300'}`}>
                      {eventData.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {eventData.triggeredAt && (
                    <div className="text-neutral-600 dark:text-neutral-400 mt-1">
                      Triggered: {new Date(eventData.triggeredAt * 1000).toLocaleString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Other Flags */}
        {(() => {
          const otherFlags = Object.entries(flags).filter(
            ([key]) => !['arcs', 'quests', 'inventory', 'events', 'sessionKind', 'world'].includes(key)
          );
          return otherFlags.length > 0 ? (
            <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded">
              <h4 className="text-sm font-semibold mb-2">Other Flags</h4>
              <pre className="text-xs font-mono overflow-x-auto">
                {JSON.stringify(Object.fromEntries(otherFlags), null, 2)}
              </pre>
            </div>
          ) : null;
        })()}
      </div>
    );
  };

  const renderRelationships = () => {
    if (!session || !session.relationships) return null;

    const relationships = session.relationships as Record<string, any>;
    const entries = Object.entries(relationships);

    if (entries.length === 0) return null;

    const npcRelationships = entries.filter(([key]) => parseNpcKey(key) !== null);
    const otherRelationships = entries.filter(([key]) => parseNpcKey(key) === null);

    return (
      <div className="space-y-3">
        {/* NPC Relationships */}
        {(filter === 'all' || filter === 'relationships') && npcRelationships.length > 0 && (
          <div className="p-3 bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800 rounded">
            <h4 className="text-sm font-semibold mb-2">NPC Relationships</h4>
            <div className="space-y-2">
              {npcRelationships.map(([key, data]: [string, any]) => {
                const npcId = parseNpcKey(key);
                return (
                  <div key={key} className="text-xs">
                    <div className="font-semibold text-pink-900 dark:text-pink-300">
                      NPC #{npcId}
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      {data.affinity !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-neutral-600 dark:text-neutral-400">Affinity:</span>
                          <span className={`font-mono ${data.affinity >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {data.affinity.toFixed(2)}
                          </span>
                        </div>
                      )}
                      {data.trust !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-neutral-600 dark:text-neutral-400">Trust:</span>
                          <span className={`font-mono ${data.trust >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                            {data.trust.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                    {data.flags && data.flags.length > 0 && (
                      <div className="mt-1">
                        <div className="text-neutral-600 dark:text-neutral-400">Flags:</div>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {data.flags.map((flag: string, idx: number) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 bg-pink-200 dark:bg-pink-800 text-pink-900 dark:text-pink-200 rounded text-xs"
                            >
                              {flag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Other Relationships */}
        {otherRelationships.length > 0 && (
          <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded">
            <h4 className="text-sm font-semibold mb-2">Other Relationships</h4>
            <pre className="text-xs font-mono overflow-x-auto">
              {JSON.stringify(Object.fromEntries(otherRelationships), null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  };

  if (!session) {
    return (
      <div className="p-4 space-y-4 overflow-y-auto h-full">
        <h3 className="text-lg font-semibold">Session State Viewer</h3>
        {sessions.length === 0 ? (
          <p className="text-sm text-neutral-500">No sessions found. Start a game to create a session.</p>
        ) : (
          <p className="text-sm text-neutral-500">Select a session to view its state.</p>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Session State Viewer</h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Debug panel for inspecting game session state (flags, relationships, arcs, quests)
        </p>
      </div>

      {/* Session Selection */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">Session:</label>
        <Select
          value={selectedSessionId || ''}
          onChange={(e) => handleSessionChange(Number(e.target.value))}
          size="sm"
          className="flex-1"
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              Session #{s.id} - {new Date(s.created_at).toLocaleString()}
            </option>
          ))}
        </Select>
        <Button size="sm" variant="secondary" onClick={() => loadSession(selectedSessionId!)}>
          Refresh
        </Button>
      </div>

      {/* Auto-refresh Toggle */}
      <div className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          id="autoRefresh"
          checked={autoRefresh}
          onChange={(e) => setAutoRefresh(e.target.checked)}
          className="rounded"
        />
        <label htmlFor="autoRefresh" className="cursor-pointer">
          Auto-refresh (2s)
        </label>
      </div>

      {/* Filter */}
      <div className="flex gap-1">
        {(['all', 'arcs', 'quests', 'relationships', 'inventory'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2 py-1 text-xs rounded ${filter === f ? 'bg-blue-500 text-white' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'}`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* World Time */}
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
        <div className="flex justify-between items-center">
          <span className="text-sm font-semibold">World Time:</span>
          <span className="text-sm font-mono">{formatWorldTime(session.world_time)}</span>
        </div>
        <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
          {session.world_time} seconds total
        </div>
      </div>

      {/* Flags */}
      {(filter === 'all' || filter === 'arcs' || filter === 'quests' || filter === 'inventory') && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Flags</h4>
          {renderFlags()}
          {(!session.flags || Object.keys(session.flags).length === 0) && (
            <p className="text-xs text-neutral-500 text-center py-4">No flags set</p>
          )}
        </div>
      )}

      {/* Relationships */}
      {(filter === 'all' || filter === 'relationships') && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Relationships</h4>
          {renderRelationships()}
          {(!session.relationships || Object.keys(session.relationships).length === 0) && (
            <p className="text-xs text-neutral-500 text-center py-4">No relationships tracked</p>
          )}
        </div>
      )}

      {/* Loading Indicator */}
      {isLoading && (
        <div className="text-xs text-center text-neutral-500">Loading...</div>
      )}
    </div>
  );
}
