import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Panel, Button, Select } from '@pixsim7/shared.ui';
import { parseNpcKey } from '@pixsim7/game.engine';
import type { BrainState } from '@pixsim7/shared.types';
import type { BrainFace } from '@pixsim7/scene.shapes';
import { usePixSim7Core } from '../lib/game/usePixSim7Core';
import { getGameSession, listGameSessions, type GameSessionSummary } from '../lib/api/game';
import { BrainShape } from '../components/shapes/BrainShape';
import { BrainToolsPanel } from '../components/brain/BrainToolsPanel';
import { brainToolRegistry } from '../lib/brainTools/registry';
import type { BrainToolContext } from '../lib/brainTools/types';

export interface NpcBrainLabProps {
  npcId?: number;
  sessionId?: number;
  // Additional context can be added here as needed
}

/**
 * NPC Brain Lab - Dev UI for inspecting NPC brain state
 *
 * Similar to GizmoLab, this provides a small UI to inspect NPC brain state
 * using PixSim7Core.getNpcBrainState() and the data-driven BrainState model.
 *
 * Shows:
 * - NPC traits (personality)
 * - Persona tags
 * - Mood (valence/arousal + label)
 * - Social state (affinity/trust/chemistry/tension + tier/intimacy)
 * - Memories
 */
export function NpcBrainLab({ npcId: contextNpcId, sessionId: contextSessionId }: NpcBrainLabProps = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { core, session, loadSession } = usePixSim7Core();

  const [sessions, setSessions] = useState<GameSessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [selectedNpcId, setSelectedNpcId] = useState<number | null>(null);
  const [brainState, setBrainState] = useState<BrainState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeFace, setActiveFace] = useState<BrainFace>('cortex');
  const [hoveredFace, setHoveredFace] = useState<BrainFace | null>(null);
  const [visualStyle, setVisualStyle] = useState<'holographic' | 'organic' | 'circuit'>('holographic');
  const [showConnections, setShowConnections] = useState(true);

  // Load session from context, URL, or default
  useEffect(() => {
    // Priority: contextSessionId > URL param > auto-select first
    if (contextSessionId && contextSessionId !== selectedSessionId) {
      setSelectedSessionId(contextSessionId);
      handleLoadSession(contextSessionId);
      return;
    }

    const sessionIdParam = searchParams.get('sessionId');
    if (sessionIdParam) {
      const sid = Number(sessionIdParam);
      if (Number.isFinite(sid) && sid !== selectedSessionId) {
        setSelectedSessionId(sid);
        handleLoadSession(sid);
      }
    }
  }, [contextSessionId]);

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

  // Auto-select NPC from context or first available
  useEffect(() => {
    // Priority: contextNpcId > first available NPC
    if (contextNpcId && availableNpcIds.includes(contextNpcId) && selectedNpcId !== contextNpcId) {
      setSelectedNpcId(contextNpcId);
      return;
    }

    if (availableNpcIds.length > 0 && !selectedNpcId) {
      setSelectedNpcId(availableNpcIds[0]);
    }
  }, [availableNpcIds.length, contextNpcId]);

  // Load brain state when NPC selection changes
  useEffect(() => {
    if (selectedNpcId !== null) {
      // Preload persona if NpcPersonaProvider is configured
      core.preloadNpcPersona(selectedNpcId)
        .then(() => {
          handleLoadBrainState(selectedNpcId);
        })
        .catch((error) => {
          // Persona provider might not be configured, proceed anyway
          console.warn('Could not preload persona:', error);
          handleLoadBrainState(selectedNpcId);
        });
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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">NPC Brain Lab</h1>
            {contextNpcId && (
              <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 rounded">
                NPC #{contextNpcId}
              </span>
            )}
            {contextSessionId && (
              <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 rounded">
                Session #{contextSessionId}
              </span>
            )}
          </div>
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

      {/* Visual Style Controls */}
      {brainState && (
        <Panel className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Visual Style:</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={visualStyle === 'holographic' ? 'primary' : 'secondary'}
                  onClick={() => setVisualStyle('holographic')}
                >
                  Holographic
                </Button>
                <Button
                  size="sm"
                  variant={visualStyle === 'organic' ? 'primary' : 'secondary'}
                  onClick={() => setVisualStyle('organic')}
                >
                  Organic
                </Button>
                <Button
                  size="sm"
                  variant={visualStyle === 'circuit' ? 'primary' : 'secondary'}
                  onClick={() => setVisualStyle('circuit')}
                >
                  Circuit
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={showConnections}
                  onChange={(e) => setShowConnections(e.target.checked)}
                  className="rounded"
                />
                <span>Show Neural Connections</span>
              </label>
            </div>
          </div>
        </Panel>
      )}

      {/* Brain Visualization and Inspector */}
      {brainState && selectedNpcId && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Left: 3D Brain Visualization */}
          <Panel className="p-6 flex flex-col items-center justify-center">
            <BrainShape
              npcId={selectedNpcId}
              brainState={brainState}
              onFaceClick={setActiveFace}
              onFaceHover={setHoveredFace}
              activeFace={activeFace}
              showConnections={showConnections}
              style={visualStyle}
              size={400}
            />
            {hoveredFace && (
              <div className="mt-4 text-center">
                <p className="text-sm font-semibold capitalize">{hoveredFace}</p>
                <p className="text-xs text-neutral-500">Click to inspect</p>
              </div>
            )}
          </Panel>

          {/* Right: Brain Tools Panel */}
          <div>
            <BrainToolsPanel
              context={{
                npcId: selectedNpcId,
                session: session,
                brainState: brainState,
              }}
              tools={brainToolRegistry.getVisible({
                npcId: selectedNpcId,
                session: session,
                brainState: brainState,
              })}
            />
          </div>
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
