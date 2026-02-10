/**
 * useSimulationScenarios
 *
 * Encapsulates scenario CRUD state and handlers for the Simulation Playground.
 */

import { SessionId as toSessionId } from '@pixsim7/shared.types';
import { useCallback, useState } from 'react';

import { updateGameSession } from '@lib/api/game';
import type { UseGameRuntimeReturn } from '@lib/game/runtime';

import {
  createScenario,
  deleteScenario,
  loadScenarios,
  type SimulationScenario,
} from '@features/simulation/lib/core/scenarios';

export interface UseSimulationScenariosOptions {
  selectedWorldId: number | null;
  worldDetail: unknown; // GameWorldDetail | null
  worldTime: number;
  gameSession: { id: number; flags?: Record<string, unknown>; stats?: Record<string, unknown> } | null;
  sessionRelationships: Record<string, unknown>;
  selectedNpcIds: number[];
  setSelectedNpcIds: React.Dispatch<React.SetStateAction<number[]>>;
  handleSelectWorld: (worldId: number) => Promise<void>;
  runtime: Pick<UseGameRuntimeReturn, 'attachSession'>;
  setLocalLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setLocalError: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useSimulationScenarios(opts: UseSimulationScenariosOptions) {
  const {
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
  } = opts;

  const [scenarios, setScenarios] = useState<SimulationScenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [isCreatingScenario, setIsCreatingScenario] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState('');

  const handleCreateScenario = useCallback(() => {
    if (!selectedWorldId || !worldDetail) {
      setLocalError('No world selected');
      return;
    }

    const scenario = createScenario({
      name: newScenarioName || `Scenario ${scenarios.length + 1}`,
      worldId: selectedWorldId,
      initialWorldTime: worldTime,
      initialSessionFlags: gameSession?.flags || {},
      initialRelationships: sessionRelationships,
      npcIds: selectedNpcIds,
    });

    setScenarios(loadScenarios());
    setSelectedScenarioId(scenario.id);
    setIsCreatingScenario(false);
    setNewScenarioName('');
  }, [
    gameSession,
    newScenarioName,
    scenarios.length,
    selectedNpcIds,
    selectedWorldId,
    sessionRelationships,
    setLocalError,
    worldDetail,
    worldTime,
  ]);

  const handleLoadScenario = useCallback(
    async (scenarioId: string) => {
      const scenario = scenarios.find((s) => s.id === scenarioId);
      if (!scenario) {
        setLocalError('Scenario not found');
        return;
      }

      setLocalLoading(true);
      setLocalError(null);
      try {
        await handleSelectWorld(scenario.worldId);
        setSelectedNpcIds(scenario.npcIds);
        setSelectedScenarioId(scenarioId);

        if (gameSession) {
          const currentStats = (gameSession.stats || {}) as Record<string, Record<string, unknown>>;
          await updateGameSession(toSessionId(gameSession.id), {
            world_time: scenario.initialWorldTime,
            flags: scenario.initialSessionFlags,
            stats: {
              ...currentStats,
              relationships: scenario.initialRelationships,
            },
          });
          await runtime.attachSession(gameSession.id);
        }
      } catch (e: unknown) {
        setLocalError(String((e as Error)?.message ?? e));
      } finally {
        setLocalLoading(false);
      }
    },
    [gameSession, handleSelectWorld, runtime, scenarios, setLocalError, setLocalLoading, setSelectedNpcIds],
  );

  const handleDeleteScenario = useCallback(
    (scenarioId: string) => {
      if (confirm('Delete this scenario?')) {
        deleteScenario(scenarioId);
        setScenarios(loadScenarios());
        if (selectedScenarioId === scenarioId) {
          setSelectedScenarioId(null);
        }
      }
    },
    [selectedScenarioId],
  );

  return {
    scenarios,
    setScenarios,
    selectedScenarioId,
    setSelectedScenarioId,
    isCreatingScenario,
    setIsCreatingScenario,
    newScenarioName,
    setNewScenarioName,
    handleCreateScenario,
    handleLoadScenario,
    handleDeleteScenario,
  };
}
