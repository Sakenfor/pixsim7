/**
 * Simulation Playground
 *
 * A dedicated space for designers to simulate world/brain evolutions over time.
 * Allows defining scenarios, advancing time, and observing changes via brain/world tools.
 */

import { SECONDS_PER_DAY, SECONDS_PER_HOUR } from '@pixsim7/game.engine';
import { Button, Panel, Select } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  listGameLocations,
  listGameNpcs,
  listGameWorlds,
  type GameLocationSummary,
  type GameNpcSummary,
  type GameWorldSummary,
} from '@lib/api/game';
import {
  gameHooksRegistry,
  registerBuiltinGamePlugins,
  unregisterBuiltinGamePlugins,
  useActorPresence,
  useGameRuntime,
  type GameEvent,
  type GamePlugin,
} from '@lib/game/runtime';
import { usePixSim7Core } from '@lib/game/usePixSim7Core';
import { worldToolSelectors } from '@lib/plugins/catalogSelectors';

import type { BrainToolContext } from '@features/brainTools/lib/types';
import { ExportImportPanel } from '@features/panels/components/tools/ExportImportPanel';
import type { ConstraintEvaluationContext } from '@features/simulation';
// Legacy simulation hooks - kept for backward compatibility with existing plugins
import {
  registerBuiltinHooks,
  registerExamplePlugins as registerLegacyExamplePlugins,
  simulationHooksRegistry,
  type SimulationPlugin,
  unregisterBuiltinHooks,
  unregisterExamplePlugins as unregisterLegacyExamplePlugins,
} from '@features/simulation/hooks';
import {
  createHistory,
  goToSnapshot,
  loadHistory,
  type SimulationHistory,
} from '@features/simulation/lib/core/history';
import { loadSavedRuns } from '@features/simulation/lib/core/multiRunStorage';
import { loadScenarios } from '@features/simulation/lib/core/scenarios';
import { WorldToolsPanel, type WorldToolContext } from '@features/worldTools';

import { ConstraintRunner } from './ConstraintRunner';
import { LocationPresenceMap } from './LocationPresenceMap';
import { MultiRunComparison } from './MultiRunComparison';
import { NpcSelectionPanel } from './NpcSelectionPanel';
import { SavedRunsPanel } from './SavedRunsPanel';
import { ScenarioComparison } from './ScenarioComparison';
import { ScenariosPanel } from './ScenariosPanel';
import { SimulationEventLog } from './SimulationEventLog';
import { SimulationHistoryPanel } from './SimulationHistoryPanel';
import { SimulationPluginsPanel, type SimulationPluginSummary } from './SimulationPluginsPanel';
import { TimelineScrubber } from './TimelineScrubber';
import { useSimulationRuns } from './useSimulationRuns';
import { useSimulationScenarios } from './useSimulationScenarios';
import { useSimulationTime } from './useSimulationTime';
import { WorldStateOverview } from './WorldStateOverview';

export function SimulationPlayground() {
  const { core, session: coreSession, loadSession } = usePixSim7Core();

  // ========================================
  // Game Runtime (unified world/session/time management)
  // ========================================
  const runtime = useGameRuntime();
  const {
    state: runtimeState,
    world: worldDetail,
    session: gameSession,
    ensureSession,
    advanceTime: runtimeAdvanceTime,
    isLoading: runtimeLoading,
    error: runtimeError,
  } = runtime;

  // Derive values from runtime for backward compatibility
  const selectedWorldId = runtimeState.worldId;
  const worldTime = runtimeState.worldTimeSeconds;

  // ========================================
  // List data (worlds, NPCs, locations)
  // ========================================
  const [worlds, setWorlds] = useState<GameWorldSummary[]>([]);
  const [npcs, setNpcs] = useState<GameNpcSummary[]>([]);
  const [locations, setLocations] = useState<GameLocationSummary[]>([]);

  // Actor presence via unified hook (world-wide, no location filter)
  const { npcPresenceDTOs: npcPresences } = useActorPresence({
    worldId: selectedWorldId,
    worldTimeSeconds: worldTime,
    actorTypes: 'npc',
    enabled: !!selectedWorldId,
  });

  // ========================================
  // Simulation-specific state
  // ========================================
  const [selectedNpcIds, setSelectedNpcIds] = useState<number[]>([]);
  const [activeNpcId, setActiveNpcId] = useState<number | null>(null);

  // UI state
  const [localError, setLocalError] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(false);

  // Combine runtime and local loading/error states
  const isLoading = runtimeLoading || localLoading;
  const error = runtimeError || localError;

  // Phase 2: Simulation hooks and history
  const [simulationHistory, setSimulationHistory] = useState<SimulationHistory | null>(null);
  const [simulationEvents, setSimulationEvents] = useState<GameEvent[]>([]);
  const [showEventsLog, setShowEventsLog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Phase 3: Enhanced visualization
  const [showLocationMap, setShowLocationMap] = useState(false);
  const [showWorldOverview, setShowWorldOverview] = useState(true);
  const [showTimelineScrubber, setShowTimelineScrubber] = useState(false);
  const [showScenarioComparison, setShowScenarioComparison] = useState(false);
  const [comparisonScenario1, setComparisonScenario1] = useState<string | null>(null);
  const [comparisonScenario2, setComparisonScenario2] = useState<string | null>(null);

  // Phase 6: Multi-run comparison
  const [showMultiRunComparison, setShowMultiRunComparison] = useState(false);

  // Phase 7: Constraint-driven simulation
  const [showConstraintRunner, setShowConstraintRunner] = useState(false);
  const [isConstraintRunning, setIsConstraintRunning] = useState(false);

  // Phase 8: Plugin management
  const [showPluginsPanel, setShowPluginsPanel] = useState(false);
  const [plugins, setPlugins] = useState<SimulationPluginSummary[]>([]);

  // Phase 9: Export/Import
  const [showExportImport, setShowExportImport] = useState(false);
  const hasAutoSelectedWorld = useRef(false);

  const sessionRelationships = useMemo(
    () => (gameSession?.stats?.relationships ?? {}) as Record<string, unknown>,
    [gameSession]
  );

  // ========================================
  // Custom hooks for extracted logic
  // ========================================

  const time = useSimulationTime({
    selectedWorldId,
    worldDetail,
    worldTime,
    runtimeAdvanceTime,
    selectedNpcIds,
    gameSession,
    sessionRelationships,
    simulationHistory,
    setSimulationHistory,
    setSimulationEvents,
    isLoading,
    setLocalLoading,
    setLocalError,
  });

  const handleSelectWorld = useCallback(async (worldId: number) => {
    setLocalError(null);
    try {
      await ensureSession(worldId, { sessionKind: 'simulation' });
    } catch (e: unknown) {
      setLocalError(String((e as Error)?.message ?? e));
    }
  }, [ensureSession]);

  const scenariosHook = useSimulationScenarios({
    selectedWorldId,
    worldDetail,
    worldTime,
    gameSession,
    sessionRelationships,
    selectedNpcIds,
    setSelectedNpcIds,
    handleSelectWorld,
    runtime,
    setLocalLoading,
    setLocalError,
  });

  const runsHook = useSimulationRuns({
    selectedWorldId,
    worldDetail,
    simulationHistory,
    setLocalError,
  });

  // ========================================
  // Plugin management
  // ========================================

  const toPluginSummary = useCallback(
    (plugin: GamePlugin | SimulationPlugin): SimulationPluginSummary => ({
      id: plugin.id,
      name: plugin.name,
      description: plugin.description,
      version: plugin.version,
      author: plugin.author,
      enabled: plugin.enabled,
      hooks: plugin.hooks as Record<string, unknown>,
    }),
    []
  );

  const refreshPlugins = useCallback(() => {
    setPlugins([
      ...gameHooksRegistry.getPlugins(),
      ...simulationHooksRegistry.getPlugins(),
    ].map(toPluginSummary));
  }, [toPluginSummary]);

  // Register simulation hooks on mount
  useEffect(() => {
    registerBuiltinGamePlugins();
    registerBuiltinHooks();
    registerLegacyExamplePlugins();

    const savedHistory = loadHistory();
    if (savedHistory) {
      setSimulationHistory(savedHistory);
    } else {
      setSimulationHistory(createHistory(null, null));
    }

    refreshPlugins();

    return () => {
      unregisterBuiltinGamePlugins();
      unregisterBuiltinHooks();
      unregisterLegacyExamplePlugins();
    };
  }, [refreshPlugins]);

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
        scenariosHook.setScenarios(loadScenarios());
        runsHook.setSavedRuns(loadSavedRuns());

      } catch (e: unknown) {
        setLocalError(String((e as Error)?.message ?? e));
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hasAutoSelectedWorld.current) return;
    if (worlds.length === 0 || selectedWorldId) return;
    hasAutoSelectedWorld.current = true;
    void handleSelectWorld(worlds[0].id);
  }, [handleSelectWorld, selectedWorldId, worlds]);

  const handleToggleNpc = async (npcId: number) => {
    const newSelectedIds = selectedNpcIds.includes(npcId)
      ? selectedNpcIds.filter((id) => id !== npcId)
      : [...selectedNpcIds, npcId];

    setSelectedNpcIds(newSelectedIds);

    if (!gameSession && newSelectedIds.length > 0 && !selectedNpcIds.includes(npcId) && selectedWorldId) {
      try {
        await ensureSession(selectedWorldId, { sessionKind: 'simulation' });
        if (gameSession) {
          await loadSession(gameSession.id);
        }
      } catch (e: unknown) {
        console.error('Failed to create simulation session', e);
      }
    }
  };

  // Phase 8: Toggle plugin enabled/disabled
  const handleTogglePlugin = (pluginId: string, enabled: boolean) => {
    gameHooksRegistry.setPluginEnabled(pluginId, enabled);
    simulationHooksRegistry.setPluginEnabled(pluginId, enabled);
    refreshPlugins();
  };

  // Phase 9: Handle import complete
  const handleImportComplete = () => {
    scenariosHook.setScenarios(loadScenarios());
    runsHook.setSavedRuns(loadSavedRuns());
  };

  // Phase 3: Timeline navigation
  const handleTimelineNavigate = (index: number) => {
    if (!simulationHistory) return;
    const newHistory = goToSnapshot(simulationHistory, index);
    if (newHistory) {
      setSimulationHistory(newHistory);
    }
  };

  // Build WorldToolContext
  const worldToolContext = useMemo<WorldToolContext>(
    () => ({
      session: gameSession,
      sessionFlags: gameSession?.flags || {},
      relationships: sessionRelationships,
      worldDetail,
      worldTime: time.worldTimeForTools,
      locationDetail: null,
      locationNpcs: [],
      npcSlotAssignments: [],
      selectedWorldId,
      selectedLocationId: null,
      activeNpcId,
    }),
    [gameSession, worldDetail, time.worldTimeForTools, selectedWorldId, activeNpcId, sessionRelationships]
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
    () => worldToolSelectors.getVisible(worldToolContext),
    [worldToolContext]
  );

  // Phase 7: Build constraint evaluation context
  const constraintContext = useMemo<ConstraintEvaluationContext>(
    () => ({
      worldTime,
      worldDetail: worldDetail!,
      sessionFlags: gameSession?.flags || {},
      npcPresences,
      tickCount: simulationHistory?.snapshots.length || 0,
      snapshot: simulationHistory?.snapshots[simulationHistory.snapshots.length - 1],
    }),
    [worldTime, worldDetail, gameSession, npcPresences, simulationHistory]
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
            disabled={scenariosHook.scenarios.length < 2}
          >
            🔄 Compare Scenarios
          </Button>
          <Button
            size="sm"
            variant={showMultiRunComparison ? 'primary' : 'secondary'}
            onClick={() => setShowMultiRunComparison(!showMultiRunComparison)}
            disabled={runsHook.savedRuns.length === 0}
          >
            🔬 Multi-Run Comparison ({runsHook.savedRuns.length})
          </Button>
          <Button
            size="sm"
            variant={showConstraintRunner ? 'primary' : 'secondary'}
            onClick={() => setShowConstraintRunner(!showConstraintRunner)}
            disabled={!selectedWorldId}
          >
            🎯 Constraint Runner
          </Button>
          <Button
            size="sm"
            variant={showPluginsPanel ? 'primary' : 'secondary'}
            onClick={() => setShowPluginsPanel(!showPluginsPanel)}
          >
            🔌 Plugins ({plugins.filter((p) => p.enabled).length}/{plugins.length})
          </Button>
          <Button
            size="sm"
            variant={showExportImport ? 'primary' : 'secondary'}
            onClick={() => setShowExportImport(!showExportImport)}
          >
            📦 Export/Import
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
      {showScenarioComparison && scenariosHook.scenarios.length >= 2 && (
        <Panel className="p-4">
          <h2 className="text-sm font-semibold mb-3">Scenario Comparison</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <Select
              size="sm"
              value={comparisonScenario1 ?? ''}
              onChange={(e) => setComparisonScenario1(e.target.value || null)}
            >
              <option value="">Select Scenario A</option>
              {scenariosHook.scenarios.map((s) => (
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
              {scenariosHook.scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <ScenarioComparison
            scenario1={scenariosHook.scenarios.find((s) => s.id === comparisonScenario1) || null}
            scenario2={scenariosHook.scenarios.find((s) => s.id === comparisonScenario2) || null}
          />
        </Panel>
      )}

      {/* Phase 6: Multi-Run Comparison */}
      {showMultiRunComparison && runsHook.savedRuns.length > 0 && (
        <Panel className="p-4">
          <h2 className="text-sm font-semibold mb-3">Multi-Run Comparison</h2>

          {/* Run Selection */}
          <div className="mb-4">
            <div className="text-xs text-neutral-600 dark:text-neutral-400 mb-2">
              Select runs to compare ({runsHook.selectedRunIds.length} selected):
            </div>
            <div className="flex flex-wrap gap-2">
              {runsHook.savedRuns.map((run) => (
                <button
                  key={run.id}
                  onClick={() => runsHook.handleToggleRunSelection(run.id)}
                  className={`px-3 py-2 rounded border text-xs transition-colors ${
                    runsHook.selectedRunIds.includes(run.id)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                  }`}
                >
                  <div className="font-semibold">{run.name}</div>
                  <div className="text-[10px] opacity-80">
                    {run.worldName || `World #${run.worldId}`} •{' '}
                    {run.history.snapshots.length} snapshots
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Comparison View */}
          {runsHook.selectedRunIds.length > 0 && (
            <MultiRunComparison
              runs={runsHook.savedRuns.filter((run) => runsHook.selectedRunIds.includes(run.id))}
              onRemoveRun={(runId) => {
                runsHook.setSelectedRunIds(runsHook.selectedRunIds.filter((id) => id !== runId));
              }}
            />
          )}

          {runsHook.selectedRunIds.length === 0 && (
            <div className="text-xs text-neutral-500 text-center py-8">
              Select at least one run to view comparison
            </div>
          )}
        </Panel>
      )}

      {/* Phase 7: Constraint Runner */}
      {showConstraintRunner && worldDetail && (
        <ConstraintRunner
          context={constraintContext}
          onRunTick={async () => {
            await time.handleAdvanceTime(time.tickSize);
          }}
          isRunning={isConstraintRunning}
          onRunningChange={setIsConstraintRunning}
        />
      )}

      {/* Phase 8: Plugins Panel */}
      {showPluginsPanel && (
        <SimulationPluginsPanel plugins={plugins} onTogglePlugin={handleTogglePlugin} />
      )}

      {/* Phase 9: Export/Import Panel */}
      {showExportImport && (
        <ExportImportPanel
          scenarios={scenariosHook.scenarios}
          runs={runsHook.savedRuns}
          onImportComplete={handleImportComplete}
        />
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
          <div className="text-lg font-mono">{time.worldTimeDisplay}</div>
          <div className="text-xs text-neutral-500">
            <p>Day: {time.worldTimeComponents.dayOfWeek + 1}</p>
            <p>Hour: {time.worldTimeComponents.hour}:00</p>
            <p>Total seconds: {worldTime}</p>
          </div>
        </Panel>

        <Panel className="p-4 space-y-3">
          <h2 className="text-sm font-semibold">Time Controls</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => time.handleAdvanceTime(SECONDS_PER_HOUR)}
              disabled={isLoading || !selectedWorldId}
            >
              +1 Hour
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => time.handleAdvanceTime(SECONDS_PER_DAY)}
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
                value={time.tickSize}
                onChange={(e) => time.setTickSize(Number(e.target.value))}
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
                onClick={() => time.handleRunTicks(1)}
                disabled={isLoading || !selectedWorldId}
              >
                1 Tick
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => time.handleRunTicks(10)}
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
            variant={time.isAutoPlaying ? 'secondary' : 'primary'}
            onClick={() => time.setIsAutoPlaying(!time.isAutoPlaying)}
            disabled={!selectedWorldId}
          >
            {time.isAutoPlaying ? '⏸ Pause' : '▶ Auto-Play'}
          </Button>
          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-600 dark:text-neutral-400">
              Interval:
            </label>
            <Select
              size="sm"
              value={time.autoPlayInterval}
              onChange={(e) => time.setAutoPlayInterval(Number(e.target.value))}
              className="w-auto"
              disabled={time.isAutoPlaying}
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
            onClick={time.handleClearEvents}
            disabled={simulationEvents.length === 0}
          >
            Clear Events
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={time.handleClearHistory}
            disabled={!simulationHistory || simulationHistory.snapshots.length === 0}
          >
            Clear History
          </Button>
        </div>
      </Panel>

      {/* Phase 2: Events Log */}
      {showEventsLog && <SimulationEventLog events={simulationEvents} />}

      {/* Phase 2: History View */}
      {showHistory && simulationHistory && (
        <SimulationHistoryPanel simulationHistory={simulationHistory} />
      )}

      {/* Phase 6: Saved Simulation Runs */}
      <SavedRunsPanel
        savedRuns={runsHook.savedRuns}
        simulationHistory={simulationHistory}
        isCreatingRun={runsHook.isCreatingRun}
        setIsCreatingRun={runsHook.setIsCreatingRun}
        newRunName={runsHook.newRunName}
        setNewRunName={runsHook.setNewRunName}
        newRunDescription={runsHook.newRunDescription}
        setNewRunDescription={runsHook.setNewRunDescription}
        onSaveRun={runsHook.handleSaveSimulationRun}
        onDeleteRun={runsHook.handleDeleteSavedRun}
      />

      {/* Scenario Management */}
      <ScenariosPanel
        scenarios={scenariosHook.scenarios}
        selectedScenarioId={scenariosHook.selectedScenarioId}
        selectedWorldId={selectedWorldId}
        isCreatingScenario={scenariosHook.isCreatingScenario}
        setIsCreatingScenario={scenariosHook.setIsCreatingScenario}
        newScenarioName={scenariosHook.newScenarioName}
        setNewScenarioName={scenariosHook.setNewScenarioName}
        onCreateScenario={scenariosHook.handleCreateScenario}
        onLoadScenario={scenariosHook.handleLoadScenario}
        onDeleteScenario={scenariosHook.handleDeleteScenario}
      />

      {/* NPC Selection & Brain Inspector */}
      <NpcSelectionPanel
        npcs={npcs}
        selectedNpcIds={selectedNpcIds}
        activeNpcId={activeNpcId}
        brainToolContext={brainToolContext}
        onToggleNpc={handleToggleNpc}
        onSetActiveNpcId={setActiveNpcId}
      />

      {/* World Tools */}
      {worldDetail && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">World State</h2>
          <WorldToolsPanel context={worldToolContext} tools={visibleWorldTools} />
        </div>
      )}

      {!selectedWorldId && (
        <Panel className="p-8 text-center">
          <p className="text-sm text-neutral-500">Select a world to begin simulation</p>
        </Panel>
      )}
    </div>
  );
}
