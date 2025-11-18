/**
 * Simulation Playground
 *
 * A dedicated space for designers to simulate world/brain evolutions over time.
 * Allows defining scenarios, advancing time, and observing changes via brain/world tools.
 */

import { useEffect, useState, useMemo } from 'react';
import { Panel, Button, Select, Input } from '@pixsim7/ui';
import { usePixSim7Core } from '../lib/game/usePixSim7Core';
import {
  listGameWorlds,
  getGameWorld,
  listGameNpcs,
  createGameSession,
  getGameSession,
  updateGameSession,
  advanceGameWorldTime,
  type GameWorldSummary,
  type GameWorldDetail,
  type GameNpcSummary,
  type GameSessionDTO,
} from '../lib/api/game';
import {
  parseWorldTime,
  composeWorldTime,
  addWorldTime,
  formatWorldTime,
  SECONDS_PER_HOUR,
  SECONDS_PER_DAY,
} from '@pixsim7/game-core';
import { WorldToolsPanel } from '../components/game/WorldToolsPanel';
import { BrainToolsPanel } from '../components/brain/BrainToolsPanel';
import { worldToolRegistry } from '../lib/worldTools/registry';
import { brainToolRegistry } from '../lib/brainTools/registry';
import type { WorldToolContext } from '../lib/worldTools/types';
import type { BrainToolContext } from '../lib/brainTools/types';
import {
  loadScenarios,
  createScenario,
  deleteScenario,
  createDefaultScenario,
  type SimulationScenario,
} from '../lib/simulation/scenarios';

export function SimulationPlayground() {
  const { core, session: coreSession, loadSession } = usePixSim7Core();

  // World and NPC data
  const [worlds, setWorlds] = useState<GameWorldSummary[]>([]);
  const [npcs, setNpcs] = useState<GameNpcSummary[]>([]);

  // Current simulation state
  const [selectedWorldId, setSelectedWorldId] = useState<number | null>(null);
  const [worldDetail, setWorldDetail] = useState<GameWorldDetail | null>(null);
  const [worldTime, setWorldTime] = useState<number>(0);
  const [gameSession, setGameSession] = useState<GameSessionDTO | null>(null);
  const [selectedNpcIds, setSelectedNpcIds] = useState<number[]>([]);
  const [activeNpcId, setActiveNpcId] = useState<number | null>(null);

  // Scenarios
  const [scenarios, setScenarios] = useState<SimulationScenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [isCreatingScenario, setIsCreatingScenario] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState('');

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tickSize, setTickSize] = useState<number>(SECONDS_PER_HOUR);

  // Load initial data
  useEffect(() => {
    (async () => {
      try {
        const [worldList, npcList] = await Promise.all([
          listGameWorlds(),
          listGameNpcs(),
        ]);
        setWorlds(worldList);
        setNpcs(npcList);
        setScenarios(loadScenarios());

        // Auto-select first world if available
        if (worldList.length > 0 && !selectedWorldId) {
          await handleSelectWorld(worldList[0].id);
        }
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
    })();
  }, []);

  const handleSelectWorld = async (worldId: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const world = await getGameWorld(worldId);
      setSelectedWorldId(worldId);
      setWorldDetail(world);
      setWorldTime(world.world_time);

      // Create or load a session for this world
      if (!gameSession || gameSession.world_time !== world.world_time) {
        // For now, we'll create a minimal session or use existing one
        // The task says no backend changes needed, so we'll work with local state
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdvanceTime = async (deltaSeconds: number) => {
    if (!selectedWorldId) {
      setError('No world selected');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      // Advance world time via API
      const updatedWorld = await advanceGameWorldTime(selectedWorldId, deltaSeconds);
      setWorldDetail(updatedWorld);
      setWorldTime(updatedWorld.world_time);

      // Update session if it exists
      if (gameSession) {
        const updated = await updateGameSession(gameSession.id, {
          world_time: updatedWorld.world_time,
        });
        if (updated.session) {
          setGameSession(updated.session);
        }
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunTicks = async (numTicks: number) => {
    const totalDelta = tickSize * numTicks;
    await handleAdvanceTime(totalDelta);
  };

  const handleCreateScenario = () => {
    if (!selectedWorldId || !worldDetail) {
      setError('No world selected');
      return;
    }

    const scenario = createScenario({
      name: newScenarioName || `Scenario ${scenarios.length + 1}`,
      worldId: selectedWorldId,
      initialWorldTime: worldTime,
      initialSessionFlags: gameSession?.flags || {},
      initialRelationships: gameSession?.relationships || {},
      npcIds: selectedNpcIds,
    });

    setScenarios(loadScenarios());
    setSelectedScenarioId(scenario.id);
    setIsCreatingScenario(false);
    setNewScenarioName('');
  };

  const handleLoadScenario = async (scenarioId: string) => {
    const scenario = scenarios.find((s) => s.id === scenarioId);
    if (!scenario) {
      setError('Scenario not found');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await handleSelectWorld(scenario.worldId);
      setWorldTime(scenario.initialWorldTime);
      setSelectedNpcIds(scenario.npcIds);
      setSelectedScenarioId(scenarioId);

      // If we have a session, update it with scenario data
      if (gameSession) {
        const updated = await updateGameSession(gameSession.id, {
          world_time: scenario.initialWorldTime,
          flags: scenario.initialSessionFlags,
          relationships: scenario.initialRelationships,
        });
        if (updated.session) {
          setGameSession(updated.session);
        }
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteScenario = (scenarioId: string) => {
    if (confirm('Delete this scenario?')) {
      deleteScenario(scenarioId);
      setScenarios(loadScenarios());
      if (selectedScenarioId === scenarioId) {
        setSelectedScenarioId(null);
      }
    }
  };

  const handleToggleNpc = async (npcId: number) => {
    const newSelectedIds = selectedNpcIds.includes(npcId)
      ? selectedNpcIds.filter((id) => id !== npcId)
      : [...selectedNpcIds, npcId];

    setSelectedNpcIds(newSelectedIds);

    // If we don't have a session yet and we're adding the first NPC, create one
    if (!gameSession && newSelectedIds.length > 0 && !selectedNpcIds.includes(npcId)) {
      try {
        // Create a minimal session (scene_id can be 1 or any valid scene)
        // The task spec says we can work with local state, so this is just for brain state
        const session = await createGameSession(1, {
          sessionKind: 'simulation',
          world: { mode: 'simulation' },
        });
        setGameSession(session);

        // Load the session into PixSim7Core
        await loadSession(session.id);
      } catch (e: any) {
        console.error('Failed to create simulation session', e);
      }
    }
  };

  // Parse world time for display
  const worldTimeComponents = parseWorldTime(worldTime);
  const worldTimeDisplay = formatWorldTime(worldTime);

  // Build WorldToolContext
  const worldToolContext = useMemo<WorldToolContext>(
    () => ({
      session: gameSession,
      sessionFlags: gameSession?.flags || {},
      relationships: gameSession?.relationships || {},
      worldDetail,
      worldTime: worldTimeComponents,
      locationDetail: null,
      locationNpcs: [],
      npcSlotAssignments: [],
      selectedWorldId,
      selectedLocationId: null,
      activeNpcId,
    }),
    [gameSession, worldDetail, worldTimeComponents, selectedWorldId, activeNpcId]
  );

  // Preload persona when active NPC changes
  useEffect(() => {
    if (activeNpcId) {
      core.preloadNpcPersona(activeNpcId).catch((error) => {
        console.warn('Could not preload persona for NPC', activeNpcId, error);
      });
    }
  }, [activeNpcId, core]);

  // Build BrainToolContext for active NPC
  const brainToolContext = useMemo<BrainToolContext | null>(() => {
    if (!activeNpcId || !coreSession) {
      return null;
    }

    try {
      const brainState = core.getNpcBrainState(activeNpcId);
      return {
        npcId: activeNpcId,
        session: coreSession,
        brainState,
      };
    } catch (e) {
      console.error('Failed to build brain context', e);
      return null;
    }
  }, [activeNpcId, coreSession, core]);

  const visibleWorldTools = useMemo(
    () => worldToolRegistry.getVisible(worldToolContext),
    [worldToolContext]
  );

  const visibleBrainTools = useMemo(
    () => (brainToolContext ? brainToolRegistry.getVisible(brainToolContext) : []),
    [brainToolContext]
  );

  return (
    <div className="p-6 space-y-4 content-with-dock min-h-screen">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Simulation Playground</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Define scenarios, advance time, and observe world & brain state changes
          </p>
        </div>
      </div>

      {error && (
        <Panel className="p-4 border-red-500 bg-red-50 dark:bg-red-900/20">
          <p className="text-sm text-red-600 dark:text-red-400">Error: {error}</p>
        </Panel>
      )}

      {/* World Selection & Time Display */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Panel className="p-4 space-y-3">
          <h2 className="text-sm font-semibold">World</h2>
          <Select
            value={selectedWorldId ?? ''}
            onChange={(e) => {
              const worldId = Number(e.target.value);
              if (Number.isFinite(worldId)) {
                handleSelectWorld(worldId);
              }
            }}
            className="w-full"
            disabled={isLoading}
          >
            <option value="">Select a world</option>
            {worlds.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
          {worldDetail && (
            <div className="text-xs text-neutral-500 space-y-1">
              <p>World ID: {worldDetail.id}</p>
              <p>Name: {worldDetail.name}</p>
            </div>
          )}
        </Panel>

        <Panel className="p-4 space-y-3">
          <h2 className="text-sm font-semibold">Current Time</h2>
          <div className="text-lg font-mono">{worldTimeDisplay}</div>
          <div className="text-xs text-neutral-500">
            <p>Day: {worldTimeComponents.dayOfWeek + 1}</p>
            <p>Hour: {worldTimeComponents.hour}:00</p>
            <p>Total seconds: {worldTime}</p>
          </div>
        </Panel>

        <Panel className="p-4 space-y-3">
          <h2 className="text-sm font-semibold">Time Controls</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => handleAdvanceTime(SECONDS_PER_HOUR)}
              disabled={isLoading || !selectedWorldId}
            >
              +1 Hour
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => handleAdvanceTime(SECONDS_PER_DAY)}
              disabled={isLoading || !selectedWorldId}
            >
              +1 Day
            </Button>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-neutral-600 dark:text-neutral-400">
              Run Ticks
            </label>
            <div className="flex gap-2">
              <Select
                size="sm"
                value={tickSize}
                onChange={(e) => setTickSize(Number(e.target.value))}
                className="flex-1"
              >
                <option value={SECONDS_PER_HOUR}>1 hour/tick</option>
                <option value={SECONDS_PER_HOUR * 4}>4 hours/tick</option>
                <option value={SECONDS_PER_DAY}>1 day/tick</option>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleRunTicks(1)}
                disabled={isLoading || !selectedWorldId}
              >
                1 Tick
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleRunTicks(10)}
                disabled={isLoading || !selectedWorldId}
              >
                10 Ticks
              </Button>
            </div>
          </div>
        </Panel>
      </div>

      {/* Scenario Management */}
      <Panel className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Scenarios</h2>
          <Button
            size="sm"
            variant="primary"
            onClick={() => setIsCreatingScenario(true)}
            disabled={!selectedWorldId}
          >
            Create Scenario
          </Button>
        </div>

        {isCreatingScenario && (
          <div className="p-3 border border-neutral-300 dark:border-neutral-700 rounded space-y-2">
            <Input
              placeholder="Scenario name"
              value={newScenarioName}
              onChange={(e) => setNewScenarioName(e.target.value)}
              className="w-full"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={handleCreateScenario}>
                Save
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setIsCreatingScenario(false);
                  setNewScenarioName('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {scenarios.length === 0 && !isCreatingScenario && (
          <p className="text-xs text-neutral-500">
            No scenarios yet. Create one to save your simulation state.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {scenarios.map((scenario) => (
            <div
              key={scenario.id}
              className={`px-3 py-2 rounded border text-xs flex items-center gap-2 ${
                selectedScenarioId === scenario.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700'
              }`}
            >
              <button
                onClick={() => handleLoadScenario(scenario.id)}
                className="hover:underline"
              >
                {scenario.name}
              </button>
              <button
                onClick={() => handleDeleteScenario(scenario.id)}
                className="text-red-500 hover:text-red-700"
                title="Delete scenario"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </Panel>

      {/* NPC Selection */}
      <Panel className="p-4 space-y-3">
        <h2 className="text-sm font-semibold">NPCs in Simulation</h2>
        <div className="flex flex-wrap gap-2">
          {npcs.map((npc) => (
            <button
              key={npc.id}
              onClick={() => handleToggleNpc(npc.id)}
              className={`px-3 py-1 rounded text-xs border transition-colors ${
                selectedNpcIds.includes(npc.id)
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700'
              }`}
            >
              NPC #{npc.id}
            </button>
          ))}
        </div>
        {selectedNpcIds.length > 0 && (
          <div className="text-xs text-neutral-500">
            Selected: {selectedNpcIds.length} NPC(s)
          </div>
        )}
      </Panel>

      {/* World Tools */}
      {worldDetail && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">World State</h2>
          <WorldToolsPanel context={worldToolContext} tools={visibleWorldTools} />
        </div>
      )}

      {/* Brain Tools for Selected NPC */}
      {selectedNpcIds.length > 0 && (
        <Panel className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Brain Inspector</h2>
            <Select
              size="sm"
              value={activeNpcId ?? ''}
              onChange={(e) => {
                const npcId = Number(e.target.value);
                if (Number.isFinite(npcId)) {
                  setActiveNpcId(npcId);
                }
              }}
            >
              <option value="">Select NPC to inspect</option>
              {selectedNpcIds.map((npcId) => (
                <option key={npcId} value={npcId}>
                  NPC #{npcId}
                </option>
              ))}
            </Select>
          </div>

          {brainToolContext && (
            <BrainToolsPanel context={brainToolContext} tools={visibleBrainTools} />
          )}

          {!brainToolContext && activeNpcId && (
            <p className="text-xs text-neutral-500">
              Unable to load brain state. Ensure NPC has session data.
            </p>
          )}
        </Panel>
      )}

      {!selectedWorldId && (
        <Panel className="p-8 text-center">
          <p className="text-sm text-neutral-500">Select a world to begin simulation</p>
        </Panel>
      )}
    </div>
  );
}
