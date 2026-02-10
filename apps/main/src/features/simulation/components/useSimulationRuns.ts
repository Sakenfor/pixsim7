/**
 * useSimulationRuns
 *
 * Encapsulates saved-run state and handlers (save, delete, toggle selection)
 * for the Simulation Playground.
 */

import { useCallback, useState } from 'react';

import type { SimulationHistory } from '@features/simulation/lib/core/history';
import {
  deleteSavedRun,
  loadSavedRuns,
  saveSimulationRun,
  type SavedSimulationRun,
} from '@features/simulation/lib/core/multiRunStorage';

export interface UseSimulationRunsOptions {
  selectedWorldId: number | null;
  worldDetail: { name: string } | null;
  simulationHistory: SimulationHistory | null;
  setLocalError: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useSimulationRuns(opts: UseSimulationRunsOptions) {
  const { selectedWorldId, worldDetail, simulationHistory, setLocalError } = opts;

  const [savedRuns, setSavedRuns] = useState<SavedSimulationRun[]>([]);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const [newRunName, setNewRunName] = useState('');
  const [newRunDescription, setNewRunDescription] = useState('');

  const handleSaveSimulationRun = useCallback(() => {
    if (!simulationHistory || !selectedWorldId || !worldDetail) {
      setLocalError('No simulation history to save');
      return;
    }

    if (simulationHistory.snapshots.length === 0) {
      setLocalError('No snapshots in history. Run some simulation ticks first.');
      return;
    }

    saveSimulationRun(
      newRunName || `Run ${savedRuns.length + 1}`,
      selectedWorldId,
      simulationHistory,
      {
        description: newRunDescription || undefined,
        worldName: worldDetail.name,
      },
    );

    setSavedRuns(loadSavedRuns());
    setIsCreatingRun(false);
    setNewRunName('');
    setNewRunDescription('');
  }, [newRunDescription, newRunName, savedRuns.length, selectedWorldId, setLocalError, simulationHistory, worldDetail]);

  const handleDeleteSavedRun = useCallback(
    (runId: string) => {
      if (confirm('Delete this simulation run?')) {
        deleteSavedRun(runId);
        setSavedRuns(loadSavedRuns());
        setSelectedRunIds((prev) => prev.filter((id) => id !== runId));
      }
    },
    [],
  );

  const handleToggleRunSelection = useCallback((runId: string) => {
    setSelectedRunIds((prev) => {
      if (prev.includes(runId)) {
        return prev.filter((id) => id !== runId);
      } else {
        return [...prev, runId];
      }
    });
  }, []);

  return {
    savedRuns,
    setSavedRuns,
    selectedRunIds,
    setSelectedRunIds,
    isCreatingRun,
    setIsCreatingRun,
    newRunName,
    setNewRunName,
    newRunDescription,
    setNewRunDescription,
    handleSaveSimulationRun,
    handleDeleteSavedRun,
    handleToggleRunSelection,
  };
}
