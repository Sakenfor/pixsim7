import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Panel, Button, Badge, Select, ProgressBar } from '@pixsim7/ui';
import { parseNpcKey } from '@pixsim7/game-core';
import type { NpcBrainState } from '@pixsim7/game-core';
import { usePixSim7Core } from '../lib/game/usePixSim7Core';
import { getGameSession, listGameSessions, type GameSessionSummary } from '../lib/api/game';

/**
 * NPC Brain Lab - Dev UI for inspecting NPC brain state
 *
 * Similar to GizmoLab, this provides a small UI to inspect NPC brain state
 * using PixSim7Core and buildNpcBrainState.
 *
 * Shows:
 * - NPC traits (personality)
 * - Persona tags
 * - Mood (valence/arousal + label)
 * - Social state (affinity/trust/chemistry/tension + tier/intimacy)
 * - Memories
 */
export function NpcBrainLab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { core, session, loadSession } = usePixSim7Core();

  const [sessions, setSessions] = useState<GameSessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [selectedNpcId, setSelectedNpcId] = useState<number | null>(null);
  const [brainState, setBrainState] = useState<NpcBrainState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load session from URL or default
  useEffect(() => {
    const sessionIdParam = searchParams.get('sessionId');
    if (sessionIdParam) {
      const sid = Number(sessionIdParam);
      if (Number.isFinite(sid) && sid !== selectedSessionId) {
        setSelectedSessionId(sid);
        handleLoadSession(sid);
      }
    }
  }, []);

  // Load available sessions
  useEffect(() => {
    (async () => {
      try {
        const sessionList = await listGameSessions();
        setSessions(sessionList);

        // Auto-select first session if none selected
        if (!selectedSessionId && sessionList.length > 0) {
          const firstId = sessionList[0].id;
          setSelectedSessionId(firstId);
          handleLoadSession(firstId);
        }
      } catch (e: any) {
        console.error('Failed to load sessions', e);
        setError(String(e?.message ?? e));
      }
    })();
  }, []);

  // Extract available NPCs from session relationships
  const availableNpcIds: number[] = [];
  if (session?.relationships) {
    for (const key of Object.keys(session.relationships)) {
      const npcId = parseNpcKey(key);
      if (npcId !== null) {
        availableNpcIds.push(npcId);
      }
    }
  }

  // Auto-select first NPC if none selected
  useEffect(() => {
    if (availableNpcIds.length > 0 && !selectedNpcId) {
      setSelectedNpcId(availableNpcIds[0]);
    }
  }, [availableNpcIds.length]);

  // Load brain state when NPC selection changes
  useEffect(() => {
    if (selectedNpcId !== null) {
      handleLoadBrainState(selectedNpcId);
    } else {
      setBrainState(null);
    }
  }, [selectedNpcId, session]);

  const handleLoadSession = async (sessionId: number) => {
    setIsLoading(true);
    setError(null);
    try {
      await loadSession(sessionId);
      setSearchParams({ sessionId: sessionId.toString() });
      setSelectedNpcId(null); // Reset NPC selection
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadBrainState = (npcId: number) => {
    try {
      const brain = core.getNpcBrainState(npcId);
      setBrainState(brain);
      setError(null);
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setBrainState(null);
    }
  };

  const handleSessionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sid = Number(e.target.value);
    if (Number.isFinite(sid)) {
      setSelectedSessionId(sid);
      handleLoadSession(sid);
    }
  };

  const handleNpcChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const npcId = Number(e.target.value);
    if (Number.isFinite(npcId)) {
      setSelectedNpcId(npcId);
    }
  };

  return (
    <div className="p-6 space-y-4 content-with-dock min-h-screen">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">NPC Brain Lab</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Inspect NPC brain state: traits, mood, social, and memories
          </p>
        </div>
      </div>

      {error && (
        <Panel className="p-4 border-red-500 bg-red-50 dark:bg-red-900/20">
          <p className="text-sm text-red-600 dark:text-red-400">Error: {error}</p>
        </Panel>
      )}

      {/* Session and NPC Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Session</h2>
            {isLoading && <span className="text-xs text-neutral-500">Loading...</span>}
          </div>
          <Select
            value={selectedSessionId ?? ''}
            onChange={handleSessionChange}
            className="w-full"
          >
            <option value="">Select a session</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                Session #{s.id} (World Time: {s.world_time}s)
              </option>
            ))}
          </Select>
          {session && (
            <div className="text-xs text-neutral-500 space-y-1">
              <p>Session ID: {session.id}</p>
              <p>World Time: {session.world_time}s</p>
              <p>NPCs: {availableNpcIds.length}</p>
            </div>
          )}
        </Panel>

        <Panel className="p-4 space-y-3">
          <h2 className="text-sm font-semibold">NPC</h2>
          <Select
            value={selectedNpcId ?? ''}
            onChange={handleNpcChange}
            className="w-full"
            disabled={availableNpcIds.length === 0}
          >
            <option value="">Select an NPC</option>
            {availableNpcIds.map((npcId) => (
              <option key={npcId} value={npcId}>
                NPC #{npcId}
              </option>
            ))}
          </Select>
          {availableNpcIds.length === 0 && (
            <p className="text-xs text-neutral-500">No NPCs found in this session</p>
          )}
        </Panel>
      </div>

      {/* Brain State Display */}
      {brainState && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Traits */}
          <Panel className="p-4 space-y-3">
            <h2 className="text-sm font-semibold">Personality Traits</h2>
            <div className="space-y-2">
              {Object.entries(brainState.traits).map(([trait, value]) => (
                <div key={trait} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="capitalize">{trait}</span>
                    <span className="font-mono">{value.toFixed(0)}</span>
                  </div>
                  <ProgressBar value={value} max={100} variant="primary" />
                </div>
              ))}
            </div>
          </Panel>

          {/* Persona Tags */}
          <Panel className="p-4 space-y-3">
            <h2 className="text-sm font-semibold">Persona Tags</h2>
            <div className="flex flex-wrap gap-2">
              {brainState.personaTags.length > 0 ? (
                brainState.personaTags.map((tag) => (
                  <Badge key={tag} color="blue">
                    {tag}
                  </Badge>
                ))
              ) : (
                <p className="text-xs text-neutral-500">No persona tags</p>
              )}
            </div>
            {brainState.conversationStyle && (
              <div className="mt-3">
                <h3 className="text-xs font-semibold mb-1">Conversation Style</h3>
                <Badge color="purple">{brainState.conversationStyle}</Badge>
              </div>
            )}
          </Panel>

          {/* Mood */}
          <Panel className="p-4 space-y-3">
            <h2 className="text-sm font-semibold">Mood</h2>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span>Valence (Pleasure)</span>
                  <span className="font-mono">{brainState.mood.valence.toFixed(1)}</span>
                </div>
                <ProgressBar
                  value={brainState.mood.valence}
                  max={100}
                  variant={brainState.mood.valence >= 50 ? 'success' : 'warning'}
                />
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span>Arousal (Energy)</span>
                  <span className="font-mono">{brainState.mood.arousal.toFixed(1)}</span>
                </div>
                <ProgressBar
                  value={brainState.mood.arousal}
                  max={100}
                  variant="primary"
                />
              </div>
              {brainState.mood.label && (
                <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700">
                  <span className="text-xs font-semibold">Current Mood: </span>
                  <Badge color="green" className="capitalize">
                    {brainState.mood.label}
                  </Badge>
                </div>
              )}
            </div>
          </Panel>

          {/* Social State */}
          <Panel className="p-4 space-y-3">
            <h2 className="text-sm font-semibold">Social State</h2>
            <div className="space-y-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>Affinity</span>
                  <span className="font-mono">{brainState.social.affinity.toFixed(0)}</span>
                </div>
                <ProgressBar value={brainState.social.affinity} max={100} variant="primary" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>Trust</span>
                  <span className="font-mono">{brainState.social.trust.toFixed(0)}</span>
                </div>
                <ProgressBar value={brainState.social.trust} max={100} variant="success" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>Chemistry</span>
                  <span className="font-mono">{brainState.social.chemistry.toFixed(0)}</span>
                </div>
                <ProgressBar value={brainState.social.chemistry} max={100} variant="warning" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>Tension</span>
                  <span className="font-mono">{brainState.social.tension.toFixed(0)}</span>
                </div>
                <ProgressBar value={brainState.social.tension} max={100} variant="danger" />
              </div>
            </div>
            <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold">Tier:</span>
                <Badge color="blue">{brainState.social.tierId || 'unknown'}</Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold">Intimacy Level:</span>
                <Badge color="purple">
                  {brainState.social.intimacyLevelId !== null && brainState.social.intimacyLevelId !== undefined
                    ? brainState.social.intimacyLevelId
                    : 'none'}
                </Badge>
              </div>
              {brainState.social.flags.length > 0 && (
                <div className="pt-2">
                  <h3 className="text-xs font-semibold mb-1">Flags:</h3>
                  <div className="flex flex-wrap gap-1">
                    {brainState.social.flags.map((flag) => (
                      <Badge key={flag} color="gray" className="text-xs">
                        {flag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Panel>

          {/* Memories */}
          <Panel className="p-4 space-y-3 lg:col-span-2">
            <h2 className="text-sm font-semibold">Memories</h2>
            {brainState.memories.length > 0 ? (
              <div className="space-y-2">
                {brainState.memories.map((memory) => (
                  <div
                    key={memory.id}
                    className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 space-y-1"
                  >
                    <div className="flex items-start justify-between">
                      <p className="text-xs font-mono text-neutral-500">{memory.id}</p>
                      {memory.source && (
                        <Badge color="gray" className="text-xs">
                          {memory.source}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm">{memory.summary}</p>
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                      <span>{memory.timestamp}</span>
                      {memory.tags.length > 0 && (
                        <div className="flex gap-1">
                          {memory.tags.map((tag) => (
                            <Badge key={tag} color="blue" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-500">No memories stored for this NPC</p>
            )}
          </Panel>

          {/* Instincts & Logic */}
          <Panel className="p-4 space-y-3">
            <h2 className="text-sm font-semibold">Instincts</h2>
            <div className="flex flex-wrap gap-2">
              {brainState.instincts.map((instinct) => (
                <Badge key={instinct} color="orange">
                  {instinct}
                </Badge>
              ))}
            </div>
          </Panel>

          <Panel className="p-4 space-y-3">
            <h2 className="text-sm font-semibold">Logic Strategies</h2>
            <div className="flex flex-wrap gap-2">
              {brainState.logic.strategies.map((strategy) => (
                <Badge key={strategy} color="green">
                  {strategy}
                </Badge>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {!brainState && selectedNpcId && (
        <Panel className="p-8 text-center">
          <p className="text-sm text-neutral-500">No brain state available for this NPC</p>
        </Panel>
      )}

      {!selectedNpcId && session && (
        <Panel className="p-8 text-center">
          <p className="text-sm text-neutral-500">Select an NPC to view brain state</p>
        </Panel>
      )}

      {!session && !isLoading && (
        <Panel className="p-8 text-center">
          <p className="text-sm text-neutral-500">Select a session to begin</p>
        </Panel>
      )}
    </div>
  );
}
