/**
 * Constraint Runner (Phase 7)
 *
 * UI for configuring and running constraint-driven simulations.
 * Allows users to define constraints and automatically advance simulation until conditions are met.
 */

import { useState, useEffect, useRef } from 'react';
import { Panel, Button, Select, Input } from '@pixsim7/shared.ui';
import { formatWorldTime } from '@pixsim7/game.engine';
import type {
  AnyConstraint,
  ConstraintEvaluationContext,
  ConstraintEvaluationResult,
} from '../../lib/simulation/constraints';
import {
  evaluateConstraint,
  createWorldTimeConstraint,
  createFlagConstraint,
  createNpcLocationConstraint,
  createTickCountConstraint,
  createEventConstraint,
} from '../../lib/simulation/constraints';

interface ConstraintRunnerProps {
  context: ConstraintEvaluationContext;
  onRunTick: () => Promise<void>;
  isRunning: boolean;
  onRunningChange: (running: boolean) => void;
}

export function ConstraintRunner({
  context,
  onRunTick,
  isRunning,
  onRunningChange,
}: ConstraintRunnerProps) {
  // Constraint configuration
  const [constraintType, setConstraintType] = useState<string>('worldTime');
  const [constraints, setConstraints] = useState<AnyConstraint[]>([]);
  const [maxTicks, setMaxTicks] = useState<number>(100);
  const [tickInterval, setTickInterval] = useState<number>(500); // ms between ticks

  // Constraint-specific parameters
  const [worldTimeOperator, setWorldTimeOperator] = useState<'gte' | 'lte' | 'eq'>('gte');
  const [worldTimeTarget, setWorldTimeTarget] = useState<number>(0);
  const [flagPath, setFlagPath] = useState<string>('');
  const [flagOperator, setFlagOperator] = useState<'eq' | 'neq' | 'exists' | 'notExists'>(
    'eq'
  );
  const [flagValue, setFlagValue] = useState<string>('');
  const [npcId, setNpcId] = useState<number>(1);
  const [locationId, setLocationId] = useState<number>(1);
  const [tickCount, setTickCount] = useState<number>(10);
  const [eventCategory, setEventCategory] = useState<string>('');
  const [eventTitlePattern, setEventTitlePattern] = useState<string>('');

  // Runtime state
  const [currentEvaluation, setCurrentEvaluation] = useState<ConstraintEvaluationResult | null>(
    null
  );
  const [runLog, setRunLog] = useState<string[]>([]);
  const intervalRef = useRef<number | null>(null);
  const ticksRunRef = useRef<number>(0);

  // Evaluate constraints whenever context changes
  useEffect(() => {
    if (constraints.length > 0) {
      const results = constraints.map((c) => evaluateConstraint(c, context));
      const allSatisfied = results.every((r) => r.satisfied);
      const satisfiedCount = results.filter((r) => r.satisfied).length;

      setCurrentEvaluation({
        satisfied: allSatisfied,
        progress: satisfiedCount / results.length,
        message: `${satisfiedCount}/${results.length} constraints satisfied`,
      });

      // Stop if all constraints satisfied
      if (allSatisfied && isRunning) {
        handleStop('All constraints satisfied!');
      }
    }
  }, [context, constraints, isRunning]);

  // Run loop
  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = window.setInterval(async () => {
      ticksRunRef.current += 1;

      if (ticksRunRef.current >= maxTicks) {
        handleStop('Max ticks reached');
        return;
      }

      try {
        await onRunTick();
      } catch (e: any) {
        handleStop(`Error: ${e.message}`);
      }
    }, tickInterval);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, maxTicks, tickInterval, onRunTick]);

  const handleStop = (reason: string) => {
    onRunningChange(false);
    setRunLog((prev) => [...prev, `[Stopped] ${reason} (${ticksRunRef.current} ticks)`]);
  };

  const handleStart = () => {
    if (constraints.length === 0) {
      setRunLog((prev) => [...prev, '[Error] No constraints defined']);
      return;
    }

    ticksRunRef.current = 0;
    setRunLog((prev) => [
      ...prev,
      `[Started] Running until constraints satisfied (max ${maxTicks} ticks)`,
    ]);
    onRunningChange(true);
  };

  const handleAddConstraint = () => {
    let constraint: AnyConstraint | null = null;

    switch (constraintType) {
      case 'worldTime':
        if (worldTimeTarget > 0) {
          constraint = createWorldTimeConstraint(worldTimeOperator, worldTimeTarget);
        }
        break;
      case 'flag':
        if (flagPath) {
          let parsedValue: unknown;
          try {
            parsedValue = JSON.parse(flagValue);
          } catch {
            parsedValue = flagValue;
          }
          constraint = createFlagConstraint(flagPath, flagOperator, parsedValue);
        }
        break;
      case 'npcLocation':
        constraint = createNpcLocationConstraint(npcId, locationId);
        break;
      case 'tickCount':
        constraint = createTickCountConstraint(tickCount);
        break;
      case 'event':
        if (eventCategory || eventTitlePattern) {
          constraint = createEventConstraint(eventCategory, eventTitlePattern);
        }
        break;
    }

    if (constraint) {
      setConstraints((prev) => [...prev, constraint!]);
      setRunLog((prev) => [...prev, `[Added] ${constraint!.description}`]);
    }
  };

  const handleRemoveConstraint = (id: string) => {
    setConstraints((prev) => prev.filter((c) => c.id !== id));
    setRunLog((prev) => [...prev, `[Removed] Constraint ${id}`]);
  };

  const handleClearConstraints = () => {
    setConstraints([]);
    setRunLog((prev) => [...prev, '[Cleared] All constraints removed']);
  };

  const handleClearLog = () => {
    setRunLog([]);
  };

  return (
    <div className="space-y-4">
      {/* Constraint Builder */}
      <Panel className="p-4">
        <h3 className="text-sm font-semibold mb-3">Add Constraint</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-xs w-24">Type:</label>
            <Select
              size="sm"
              value={constraintType}
              onChange={(e) => setConstraintType(e.target.value)}
              className="flex-1"
            >
              <option value="worldTime">World Time</option>
              <option value="flag">Session Flag</option>
              <option value="npcLocation">NPC Location</option>
              <option value="tickCount">Tick Count</option>
              <option value="event">Event</option>
            </Select>
          </div>

          {/* World Time Constraint */}
          {constraintType === 'worldTime' && (
            <div className="flex items-center gap-2">
              <label className="text-xs w-24">Condition:</label>
              <Select
                size="sm"
                value={worldTimeOperator}
                onChange={(e) => setWorldTimeOperator(e.target.value as any)}
                className="w-20"
              >
                <option value="gte">&gt;=</option>
                <option value="lte">&lt;=</option>
                <option value="eq">=</option>
              </Select>
              <Input
                type="number"
                size="sm"
                value={worldTimeTarget}
                onChange={(e) => setWorldTimeTarget(Number(e.target.value))}
                placeholder="Target time (seconds)"
                className="flex-1"
              />
            </div>
          )}

          {/* Flag Constraint */}
          {constraintType === 'flag' && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-xs w-24">Flag Path:</label>
                <Input
                  size="sm"
                  value={flagPath}
                  onChange={(e) => setFlagPath(e.target.value)}
                  placeholder="e.g., quest.stage"
                  className="flex-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs w-24">Operator:</label>
                <Select
                  size="sm"
                  value={flagOperator}
                  onChange={(e) => setFlagOperator(e.target.value as any)}
                  className="w-32"
                >
                  <option value="eq">Equals</option>
                  <option value="neq">Not Equals</option>
                  <option value="exists">Exists</option>
                  <option value="notExists">Not Exists</option>
                </Select>
                {(flagOperator === 'eq' || flagOperator === 'neq') && (
                  <Input
                    size="sm"
                    value={flagValue}
                    onChange={(e) => setFlagValue(e.target.value)}
                    placeholder="Value (JSON)"
                    className="flex-1"
                  />
                )}
              </div>
            </>
          )}

          {/* NPC Location Constraint */}
          {constraintType === 'npcLocation' && (
            <div className="flex items-center gap-2">
              <label className="text-xs w-24">NPC ID:</label>
              <Input
                type="number"
                size="sm"
                value={npcId}
                onChange={(e) => setNpcId(Number(e.target.value))}
                className="w-24"
              />
              <label className="text-xs">at Location ID:</label>
              <Input
                type="number"
                size="sm"
                value={locationId}
                onChange={(e) => setLocationId(Number(e.target.value))}
                className="w-24"
              />
            </div>
          )}

          {/* Tick Count Constraint */}
          {constraintType === 'tickCount' && (
            <div className="flex items-center gap-2">
              <label className="text-xs w-24">Tick Count:</label>
              <Input
                type="number"
                size="sm"
                value={tickCount}
                onChange={(e) => setTickCount(Number(e.target.value))}
                className="flex-1"
              />
            </div>
          )}

          {/* Event Constraint */}
          {constraintType === 'event' && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-xs w-24">Category:</label>
                <Input
                  size="sm"
                  value={eventCategory}
                  onChange={(e) => setEventCategory(e.target.value)}
                  placeholder="Optional"
                  className="flex-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs w-24">Title Pattern:</label>
                <Input
                  size="sm"
                  value={eventTitlePattern}
                  onChange={(e) => setEventTitlePattern(e.target.value)}
                  placeholder="Regex pattern (optional)"
                  className="flex-1"
                />
              </div>
            </>
          )}

          <Button size="sm" variant="primary" onClick={handleAddConstraint}>
            Add Constraint
          </Button>
        </div>
      </Panel>

      {/* Active Constraints */}
      <Panel className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Active Constraints ({constraints.length})</h3>
          {constraints.length > 0 && (
            <Button size="sm" variant="secondary" onClick={handleClearConstraints}>
              Clear All
            </Button>
          )}
        </div>

        {constraints.length === 0 && (
          <p className="text-xs text-neutral-500">No constraints added yet</p>
        )}

        {constraints.length > 0 && (
          <div className="space-y-2">
            {constraints.map((constraint) => {
              const result = evaluateConstraint(constraint, context);
              return (
                <div
                  key={constraint.id}
                  className={`p-2 rounded border text-xs ${
                    result.satisfied
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                      : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="font-semibold">{constraint.description}</div>
                      <div className="text-neutral-600 dark:text-neutral-400 mt-1">
                        {result.message}
                      </div>
                      {result.progress !== undefined && (
                        <div className="mt-1">
                          <div className="h-1 bg-neutral-200 dark:bg-neutral-700 rounded overflow-hidden">
                            <div
                              className="h-full bg-blue-500"
                              style={{ width: `${result.progress * 100}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveConstraint(constraint.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Run Controls */}
      <Panel className="p-4">
        <h3 className="text-sm font-semibold mb-3">Run Controls</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-xs w-24">Max Ticks:</label>
            <Input
              type="number"
              size="sm"
              value={maxTicks}
              onChange={(e) => setMaxTicks(Number(e.target.value))}
              disabled={isRunning}
              className="w-24"
            />
            <label className="text-xs ml-4">Interval (ms):</label>
            <Input
              type="number"
              size="sm"
              value={tickInterval}
              onChange={(e) => setTickInterval(Number(e.target.value))}
              disabled={isRunning}
              className="w-24"
            />
          </div>

          <div className="flex gap-2">
            {!isRunning ? (
              <Button
                size="sm"
                variant="primary"
                onClick={handleStart}
                disabled={constraints.length === 0}
              >
                ▶ Start Constraint Run
              </Button>
            ) : (
              <Button size="sm" variant="danger" onClick={() => handleStop('Manually stopped')}>
                ⏸ Stop
              </Button>
            )}
          </div>

          {isRunning && (
            <div className="text-xs text-neutral-600 dark:text-neutral-400">
              Running... {ticksRunRef.current} / {maxTicks} ticks
            </div>
          )}

          {currentEvaluation && (
            <div
              className={`p-2 rounded text-xs ${
                currentEvaluation.satisfied
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-300'
                  : 'bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-300'
              }`}
            >
              {currentEvaluation.message}
              {currentEvaluation.progress !== undefined && (
                <div className="mt-1">
                  <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded overflow-hidden">
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${currentEvaluation.progress * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Panel>

      {/* Run Log */}
      {runLog.length > 0 && (
        <Panel className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Run Log</h3>
            <Button size="sm" variant="secondary" onClick={handleClearLog}>
              Clear Log
            </Button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {runLog.slice().reverse().map((log, idx) => (
              <div key={idx} className="text-xs font-mono text-neutral-700 dark:text-neutral-300">
                {log}
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
