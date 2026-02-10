/**
 * useSimulationTime
 *
 * Encapsulates time-advancement logic, tick sizing, auto-play state & interval,
 * and time-display formatting for the Simulation Playground.
 */

import {
  formatWorldTime,
  parseWorldTime,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
} from '@pixsim7/game.engine';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { GameEvent } from '@lib/game/runtime';

import {
  addSnapshot,
  clearHistory,
  saveHistory,
  type SimulationHistory,
} from '@features/simulation/lib/core/history';

export interface UseSimulationTimeOptions {
  selectedWorldId: number | null;
  worldDetail: unknown; // GameWorldDetail | null — opaque to this hook
  worldTime: number;
  runtimeAdvanceTime: (
    delta: number,
    opts: { origin: string; simulationContext: { selectedNpcIds: number[] } },
  ) => Promise<GameEvent[]>;
  selectedNpcIds: number[];
  gameSession: { flags?: Record<string, unknown>; [key: string]: unknown } | null;
  sessionRelationships: Record<string, unknown>;
  simulationHistory: SimulationHistory | null;
  setSimulationHistory: React.Dispatch<React.SetStateAction<SimulationHistory | null>>;
  setSimulationEvents: React.Dispatch<React.SetStateAction<GameEvent[]>>;
  isLoading: boolean;
  setLocalLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setLocalError: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useSimulationTime(opts: UseSimulationTimeOptions) {
  const {
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
  } = opts;

  // Tick sizing
  const [tickSize, setTickSize] = useState<number>(SECONDS_PER_HOUR);

  // Auto-play state
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [autoPlayInterval, setAutoPlayInterval] = useState<number>(2000);

  // ---- Core advance handler ----
  const handleAdvanceTime = useCallback(
    async (deltaSeconds: number) => {
      if (!selectedWorldId || !worldDetail) {
        setLocalError('No world selected');
        return;
      }

      setLocalLoading(true);
      setLocalError(null);
      try {
        const events = await runtimeAdvanceTime(deltaSeconds, {
          origin: 'simulation',
          simulationContext: { selectedNpcIds },
        });

        const newWorldTime = worldTime + deltaSeconds;

        setSimulationEvents((prev) => [...prev, ...events].slice(-100));

        if (simulationHistory) {
          const newHistory = addSnapshot(simulationHistory, {
            timestamp: Date.now(),
            worldTime: newWorldTime,
            worldId: selectedWorldId,
            sessionSnapshot: {
              flags: gameSession?.flags || {},
              relationships: sessionRelationships,
            },
            events,
          });
          setSimulationHistory(newHistory);
          saveHistory(newHistory);
        }
      } catch (e: unknown) {
        setLocalError(String((e as Error)?.message ?? e));
      } finally {
        setLocalLoading(false);
      }
    },
    [
      gameSession,
      runtimeAdvanceTime,
      worldTime,
      selectedNpcIds,
      selectedWorldId,
      sessionRelationships,
      simulationHistory,
      worldDetail,
      setLocalError,
      setLocalLoading,
      setSimulationEvents,
      setSimulationHistory,
    ],
  );

  const handleRunTicks = useCallback(
    async (numTicks: number) => {
      const totalDelta = tickSize * numTicks;
      await handleAdvanceTime(totalDelta);
    },
    [handleAdvanceTime, tickSize],
  );

  // Auto-play interval effect
  useEffect(() => {
    if (!isAutoPlaying) return;

    const interval = setInterval(async () => {
      if (!isLoading && selectedWorldId) {
        await handleAdvanceTime(tickSize);
      }
    }, autoPlayInterval);

    return () => clearInterval(interval);
  }, [autoPlayInterval, handleAdvanceTime, isAutoPlaying, isLoading, selectedWorldId, tickSize]);

  // ---- Clear handlers ----
  const handleClearEvents = useCallback(() => {
    setSimulationEvents([]);
  }, [setSimulationEvents]);

  const handleClearHistory = useCallback(() => {
    if (confirm('Clear simulation history? This cannot be undone.')) {
      if (simulationHistory) {
        const newHistory = clearHistory(simulationHistory);
        setSimulationHistory(newHistory);
        saveHistory(newHistory);
      }
      setSimulationEvents([]);
    }
  }, [simulationHistory, setSimulationHistory, setSimulationEvents]);

  // ---- Time display ----
  const worldTimeComponents = parseWorldTime(worldTime);
  const worldTimeForTools = useMemo(
    () => ({
      day: worldTimeComponents.dayOfWeek,
      hour: worldTimeComponents.hour,
    }),
    [worldTimeComponents.dayOfWeek, worldTimeComponents.hour],
  );
  const worldTimeDisplay = formatWorldTime(worldTime);

  return {
    // Tick sizing
    tickSize,
    setTickSize,
    // Auto-play
    isAutoPlaying,
    setIsAutoPlaying,
    autoPlayInterval,
    setAutoPlayInterval,
    // Handlers
    handleAdvanceTime,
    handleRunTicks,
    handleClearEvents,
    handleClearHistory,
    // Time display
    worldTimeComponents,
    worldTimeForTools,
    worldTimeDisplay,
    // Constants re-exported for convenience
    SECONDS_PER_HOUR,
    SECONDS_PER_DAY,
  };
}
