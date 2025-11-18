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
  listGameLocations,
  getNpcPresence,
  createGameSession,
  getGameSession,
  updateGameSession,
  advanceGameWorldTime,
  type GameWorldSummary,
  type GameWorldDetail,
  type GameNpcSummary,
  type GameSessionDTO,
  type GameLocationSummary,
  type NpcPresenceDTO,
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
import {
  simulationHooksRegistry,
  registerBuiltinHooks,
  unregisterBuiltinHooks,
  type SimulationEvent,
  type SimulationTickContext,
} from '../lib/simulation/hooks';
import {
  createHistory,
  addSnapshot,
  saveHistory,
  loadHistory,
  clearHistory,
  getHistoryStats,
  goToSnapshot,
  type SimulationHistory,
  type SimulationSnapshot,
} from '../lib/simulation/history';
import { LocationPresenceMap } from '../components/simulation/LocationPresenceMap';
import { TimelineScrubber } from '../components/simulation/TimelineScrubber';
import { ScenarioComparison } from '../components/simulation/ScenarioComparison';
import { WorldStateOverview } from '../components/simulation/WorldStateOverview';

export function SimulationPlayground() {
  const { core, session: coreSession, loadSession } = usePixSim7Core();

  // World and NPC data
  const [worlds, setWorlds] = useState<GameWorldSummary[]>([]);
  const [npcs, setNpcs] = useState<GameNpcSummary[]>([]);
  const [locations, setLocations] = useState<GameLocationSummary[]>([]);
  const [npcPresences, setNpcPresences] = useState<NpcPresenceDTO[]>([]);

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

  // Phase 2: Simulation hooks and history
  const [simulationHistory, setSimulationHistory] = useState<SimulationHistory | null>(null);
  const [simulationEvents, setSimulationEvents] = useState<SimulationEvent[]>([]);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [autoPlayInterval, setAutoPlayInterval] = useState<number>(2000); // ms between ticks
  const [showEventsLog, setShowEventsLog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Phase 3: Enhanced visualization
  const [showLocationMap, setShowLocationMap] = useState(false);
  const [showWorldOverview, setShowWorldOverview] = useState(true);
  const [showTimelineScrubber, setShowTimelineScrubber] = useState(false);
  const [showScenarioComparison, setShowScenarioComparison] = useState(false);
  const [comparisonScenario1, setComparisonScenario1] = useState<string | null>(null);
  const [comparisonScenario2, setComparisonScenario2] = useState<string | null>(null);

  // Register simulation hooks on mount
  useEffect(() => {
    registerBuiltinHooks();

    // Load or create simulation history
    const savedHistory = loadHistory();
    if (savedHistory) {
      setSimulationHistory(savedHistory);
    } else {
      setSimulationHistory(createHistory(null, null));
    }

    return () => {
      unregisterBuiltinHooks();
    };
  }, []);

  // Load initial data
  useEffect(() => {
    (async () => {
      try {
        const [worldList, npcList, locationList] = await Promise.all([
          listGameWorlds(),
          listGameNpcs(),
          listGameLocations(),
        ]);
        setWorlds(worldList);
        setNpcs(npcList);
        setLocations(locationList);
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

  // Fetch NPC presence when world time changes
  useEffect(() => {
    if (!selectedWorldId) {
      setNpcPresences([]);
      return;
    }

    (async () => {
      try {
        const presences = await getNpcPresence({
          world_time: worldTime,
          world_id: selectedWorldId,
        });
        setNpcPresences(presences);
      } catch (e: any) {
        console.error('Failed to fetch NPC presence', e);
        setNpcPresences([]);
      }
    })();
  }, [selectedWorldId, worldTime]);

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
    if (!selectedWorldId || !worldDetail) {
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

      // Phase 2: Run simulation hooks
      const tickContext: SimulationTickContext = {
        worldId: selectedWorldId,
        worldDetail: updatedWorld,
        worldTime: updatedWorld.world_time,
        deltaSeconds,
        session: gameSession,
        selectedNpcIds,
      };

      const events = await simulationHooksRegistry.runAll(tickContext);
      setSimulationEvents((prev) => [...prev, ...events].slice(-100)); // Keep last 100 events

      // Phase 2: Add snapshot to history
      if (simulationHistory) {
        const newHistory = addSnapshot(simulationHistory, {
          timestamp: Date.now(),
          worldTime: updatedWorld.world_time,
          worldId: selectedWorldId,
          sessionSnapshot: {
            flags: gameSession?.flags || {},
            relationships: gameSession?.relationships || {},
          },
          events,
        });
        setSimulationHistory(newHistory);
        saveHistory(newHistory);
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

  // Phase 2: Auto-play functionality
  useEffect(() => {
    if (!isAutoPlaying) return;

    const interval = setInterval(async () => {
      if (!isLoading && selectedWorldId) {
        await handleAdvanceTime(tickSize);
      }
    }, autoPlayInterval);

    return () => clearInterval(interval);
  }, [isAutoPlaying, autoPlayInterval, tickSize, selectedWorldId, isLoading]);

  const handleClearHistory = () => {
    if (confirm('Clear simulation history? This cannot be undone.')) {
      if (simulationHistory) {
        const newHistory = clearHistory(simulationHistory);
        setSimulationHistory(newHistory);
        saveHistory(newHistory);
      }
      setSimulationEvents([]);
    }
  };

  const handleClearEvents = () => {
    setSimulationEvents([]);
  };

  // Phase 3: Timeline navigation
  const handleTimelineNavigate = (index: number) => {
    if (!simulationHistory) return;

    const newHistory = goToSnapshot(simulationHistory, index);
    if (newHistory) {
      setSimulationHistory(newHistory);
      // Note: This doesn't actually change the world state, just the history view
      // In a full implementation, you'd restore the snapshot state
    }
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

      {/* Phase 3: Visualization Controls */}
      <Panel className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Visualization</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={showWorldOverview ? 'primary' : 'secondary'}
            onClick={() => setShowWorldOverview(!showWorldOverview)}
          >
            📊 World Overview
          </Button>
          <Button
            size="sm"
            variant={showLocationMap ? 'primary' : 'secondary'}
            onClick={() => setShowLocationMap(!showLocationMap)}
          >
            🗺️ Location Map ({npcPresences.length})
          </Button>
          <Button
            size="sm"
            variant={showTimelineScrubber ? 'primary' : 'secondary'}
            onClick={() => setShowTimelineScrubber(!showTimelineScrubber)}
            disabled={!simulationHistory || simulationHistory.snapshots.length === 0}
          >
            ⏱️ Timeline
          </Button>
          <Button
            size="sm"
            variant={showScenarioComparison ? 'primary' : 'secondary'}
            onClick={() => setShowScenarioComparison(!showScenarioComparison)}
            disabled={scenarios.length < 2}
          >
            🔄 Compare Scenarios
          </Button>
        </div>
      </Panel>

      {/* Phase 3: World State Overview */}
      {showWorldOverview && worldDetail && (
        <Panel className="p-4">
          <WorldStateOverview
            worldDetail={worldDetail}
            worldTime={worldTime}
            gameSession={gameSession}
            npcPresences={npcPresences}
            selectedNpcIds={selectedNpcIds}
          />
        </Panel>
      )}

      {/* Phase 3: Location Presence Map */}
      {showLocationMap && (
        <Panel className="p-4">
          <h2 className="text-sm font-semibold mb-3">NPC Locations</h2>
          <LocationPresenceMap
            locations={locations}
            npcPresences={npcPresences}
            selectedNpcIds={selectedNpcIds}
            onNpcClick={(npcId) => {
              if (selectedNpcIds.includes(npcId)) {
                setSelectedNpcIds(selectedNpcIds.filter((id) => id !== npcId));
              } else {
                setSelectedNpcIds([...selectedNpcIds, npcId]);
              }
            }}
          />
        </Panel>
      )}

      {/* Phase 3: Timeline Scrubber */}
      {showTimelineScrubber && simulationHistory && simulationHistory.snapshots.length > 0 && (
        <Panel className="p-4">
          <h2 className="text-sm font-semibold mb-3">Simulation Timeline</h2>
          <TimelineScrubber
            snapshots={simulationHistory.snapshots}
            currentIndex={simulationHistory.currentIndex}
            onSnapshotSelect={handleTimelineNavigate}
          />
        </Panel>
      )}

      {/* Phase 3: Scenario Comparison */}
      {showScenarioComparison && scenarios.length >= 2 && (
        <Panel className="p-4">
          <h2 className="text-sm font-semibold mb-3">Scenario Comparison</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <Select
              size="sm"
              value={comparisonScenario1 ?? ''}
              onChange={(e) => setComparisonScenario1(e.target.value || null)}
            >
              <option value="">Select Scenario A</option>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select
              size="sm"
              value={comparisonScenario2 ?? ''}
              onChange={(e) => setComparisonScenario2(e.target.value || null)}
            >
              <option value="">Select Scenario B</option>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <ScenarioComparison
            scenario1={scenarios.find((s) => s.id === comparisonScenario1) || null}
            scenario2={scenarios.find((s) => s.id === comparisonScenario2) || null}
          />
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

      {/* Phase 2: Auto-Play Controls */}
      <Panel className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Auto-Play & History</h2>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={showEventsLog ? 'primary' : 'secondary'}
              onClick={() => setShowEventsLog(!showEventsLog)}
            >
              Events ({simulationEvents.length})
            </Button>
            <Button
              size="sm"
              variant={showHistory ? 'primary' : 'secondary'}
              onClick={() => setShowHistory(!showHistory)}
            >
              History ({simulationHistory?.snapshots.length || 0})
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant={isAutoPlaying ? 'danger' : 'primary'}
            onClick={() => setIsAutoPlaying(!isAutoPlaying)}
            disabled={!selectedWorldId}
          >
            {isAutoPlaying ? '⏸ Pause' : '▶ Auto-Play'}
          </Button>
          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-600 dark:text-neutral-400">
              Interval:
            </label>
            <Select
              size="sm"
              value={autoPlayInterval}
              onChange={(e) => setAutoPlayInterval(Number(e.target.value))}
              className="w-auto"
              disabled={isAutoPlaying}
            >
              <option value={1000}>1s</option>
              <option value={2000}>2s</option>
              <option value={5000}>5s</option>
              <option value={10000}>10s</option>
            </Select>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleClearEvents}
            disabled={simulationEvents.length === 0}
          >
            Clear Events
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleClearHistory}
            disabled={!simulationHistory || simulationHistory.snapshots.length === 0}
          >
            Clear History
          </Button>
        </div>
      </Panel>

      {/* Phase 2: Events Log */}
      {showEventsLog && (
        <Panel className="p-4 space-y-3">
          <h2 className="text-sm font-semibold">Simulation Events</h2>
          {simulationEvents.length === 0 ? (
            <p className="text-xs text-neutral-500">No events yet. Advance time to generate events.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-2">
              {simulationEvents.slice().reverse().map((event, idx) => (
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
                      <p className="text-neutral-600 dark:text-neutral-400 mt-1">
                        {event.message}
                      </p>
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
      )}

      {/* Phase 2: History View */}
      {showHistory && simulationHistory && (
        <Panel className="p-4 space-y-3">
          <h2 className="text-sm font-semibold">Simulation History</h2>
          {simulationHistory.snapshots.length === 0 ? (
            <p className="text-xs text-neutral-500">No history yet. Advance time to create snapshots.</p>
          ) : (
            <>
              <div className="text-xs text-neutral-500 space-y-1">
                <p>Total Snapshots: {simulationHistory.snapshots.length}</p>
                <p>Events: {getHistoryStats(simulationHistory).totalEvents}</p>
                <p>Duration: {Math.floor(getHistoryStats(simulationHistory).duration / 1000)}s</p>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {simulationHistory.snapshots.slice().reverse().map((snapshot, idx) => {
                  const realIdx = simulationHistory.snapshots.length - 1 - idx;
                  return (
                    <div
                      key={snapshot.id}
                      className={`p-2 rounded text-xs border ${
                        realIdx === simulationHistory.currentIndex
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                          : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold">Snapshot #{realIdx + 1}</span>
                          <span className="ml-2 text-neutral-500">
                            {formatWorldTime(snapshot.worldTime, { shortDay: true })}
                          </span>
                        </div>
                        <span className="text-[10px] text-neutral-500">
                          {snapshot.events.length} events
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Panel>
      )}

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
