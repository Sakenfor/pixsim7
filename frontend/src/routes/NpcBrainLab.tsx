import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Panel, Button, Badge, Select, ProgressBar } from '@pixsim7/ui';
import { parseNpcKey } from '@pixsim7/game-core';
import type { NpcBrainState } from '@pixsim7/game-core';
import type { BrainFace } from '@pixsim7/semantic-shapes';
import { usePixSim7Core } from '../lib/game/usePixSim7Core';
import { getGameSession, listGameSessions, type GameSessionSummary } from '../lib/api/game';
import { BrainShape } from '../components/shapes/BrainShape';

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
  const [activeFace, setActiveFace] = useState<BrainFace>('cortex');
  const [hoveredFace, setHoveredFace] = useState<BrainFace | null>(null);
  const [visualStyle, setVisualStyle] = useState<'holographic' | 'organic' | 'circuit'>('holographic');
  const [showConnections, setShowConnections] = useState(true);

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

          {/* Right: Face Inspector */}
          <Panel className="p-6 space-y-4">
            <h2 className="text-lg font-semibold capitalize">
              {activeFace} Analysis
            </h2>

            {activeFace === 'cortex' && (
              <PersonalityInspector traits={brainState.traits} tags={brainState.personaTags} />
            )}
            {activeFace === 'memory' && (
              <MemoryInspector memories={brainState.memories} />
            )}
            {activeFace === 'emotion' && (
              <MoodInspector mood={brainState.mood} />
            )}
            {activeFace === 'logic' && (
              <LogicInspector logic={brainState.logic} />
            )}
            {activeFace === 'instinct' && (
              <InstinctInspector instincts={brainState.instincts} />
            )}
            {activeFace === 'social' && selectedNpcId && (
              <SocialInspector
                social={brainState.social}
                onUpdate={(updates) => {
                  core.updateNpcRelationship(selectedNpcId, updates);
                  // Refresh brain state
                  const updatedBrain = core.getNpcBrainState(selectedNpcId);
                  if (updatedBrain) setBrainState(updatedBrain);
                }}
              />
            )}
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

// ============================================================================
// Inspector Components (adapted from BrainShapeExample)
// ============================================================================

const PersonalityInspector: React.FC<{
  traits: Record<string, number>;
  tags: string[];
}> = ({ traits, tags }) => (
  <div className="space-y-4">
    <div>
      <h3 className="text-sm font-semibold mb-2">Personality Traits</h3>
      <div className="space-y-2">
        {Object.entries(traits).map(([trait, value]) => (
          <div key={trait} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="capitalize">{trait}</span>
              <span className="font-mono">{value.toFixed(0)}</span>
            </div>
            <ProgressBar value={value} max={100} variant="primary" />
          </div>
        ))}
      </div>
    </div>

    <div>
      <h3 className="text-sm font-semibold mb-2">Persona Tags</h3>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Badge key={tag} color="blue">
            {tag}
          </Badge>
        ))}
      </div>
    </div>
  </div>
);

const MemoryInspector: React.FC<{
  memories: any[];
}> = ({ memories }) => (
  <div className="space-y-3">
    <h3 className="text-sm font-semibold">Recent Memories</h3>
    {memories.length === 0 ? (
      <p className="text-xs text-neutral-500">No memories yet</p>
    ) : (
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {memories.slice(0, 10).map((memory) => (
          <div
            key={memory.id}
            className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 space-y-1"
          >
            <p className="text-sm">{memory.summary}</p>
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <span>{new Date(memory.timestamp).toLocaleDateString()}</span>
              {memory.tags.map((tag: string) => (
                <Badge key={tag} color="blue" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

const MoodInspector: React.FC<{
  mood: any;
}> = ({ mood }) => (
  <div className="space-y-4">
    <div>
      <h3 className="text-sm font-semibold mb-2">
        Current Mood: <span className="capitalize text-primary-500">{mood.label || 'Neutral'}</span>
      </h3>
    </div>

    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span>Valence (Pleasure)</span>
          <span className="font-mono">{mood.valence.toFixed(1)}</span>
        </div>
        <ProgressBar
          value={mood.valence}
          max={100}
          variant={mood.valence >= 50 ? 'success' : 'warning'}
        />
      </div>

      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span>Arousal (Energy)</span>
          <span className="font-mono">{mood.arousal.toFixed(1)}</span>
        </div>
        <ProgressBar value={mood.arousal} max={100} variant="primary" />
      </div>
    </div>
  </div>
);

const LogicInspector: React.FC<{
  logic: any;
}> = ({ logic }) => (
  <div className="space-y-3">
    <h3 className="text-sm font-semibold">Decision Strategies</h3>
    <div className="space-y-2">
      {logic.strategies.map((strategy: string) => (
        <div
          key={strategy}
          className="flex items-center gap-2 p-2 bg-neutral-50 dark:bg-neutral-800 rounded"
        >
          <Badge color="green">{strategy}</Badge>
        </div>
      ))}
    </div>
  </div>
);

const InstinctInspector: React.FC<{
  instincts: string[];
}> = ({ instincts }) => (
  <div className="space-y-3">
    <h3 className="text-sm font-semibold">Base Instincts</h3>
    <div className="flex flex-wrap gap-2">
      {instincts.map((instinct) => (
        <Badge key={instinct} color="orange">
          {instinct}
        </Badge>
      ))}
    </div>
  </div>
);

const SocialInspector: React.FC<{
  social: any;
  onUpdate: (updates: any) => void;
}> = ({ social, onUpdate }) => (
  <div className="space-y-4">
    <h3 className="text-sm font-semibold">Relationship Metrics</h3>

    <div className="space-y-3">
      <div>
        <label className="text-xs flex items-center justify-between mb-1">
          <span>Affinity</span>
          <span className="font-mono">{social.affinity}</span>
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={social.affinity}
          onChange={(e) => onUpdate({ affinity: Number(e.target.value) })}
          className="w-full"
        />
      </div>

      <div>
        <label className="text-xs flex items-center justify-between mb-1">
          <span>Trust</span>
          <span className="font-mono">{social.trust}</span>
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={social.trust}
          onChange={(e) => onUpdate({ trust: Number(e.target.value) })}
          className="w-full"
        />
      </div>

      <div>
        <label className="text-xs flex items-center justify-between mb-1">
          <span>Chemistry</span>
          <span className="font-mono">{social.chemistry}</span>
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={social.chemistry}
          onChange={(e) => onUpdate({ chemistry: Number(e.target.value) })}
          className="w-full"
        />
      </div>

      <div>
        <label className="text-xs flex items-center justify-between mb-1">
          <span>Tension</span>
          <span className="font-mono">{social.tension}</span>
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={social.tension}
          onChange={(e) => onUpdate({ tension: Number(e.target.value) })}
          className="w-full"
        />
      </div>
    </div>

    <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span>Tier:</span>
        <Badge color="blue">{social.tierId || 'unknown'}</Badge>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span>Intimacy:</span>
        <Badge color="purple">
          {social.intimacyLevelId !== null && social.intimacyLevelId !== undefined
            ? social.intimacyLevelId
            : 'none'}
        </Badge>
      </div>

      {social.flags.length > 0 && (
        <div className="pt-2">
          <h4 className="text-xs font-semibold mb-1">Flags:</h4>
          <div className="flex flex-wrap gap-1">
            {social.flags.map((flag: string) => (
              <Badge key={flag} color="gray" className="text-xs">
                {flag}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  </div>
);
