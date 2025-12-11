/**
 * Playtesting Panel for Progression Arcs
 *
 * Interactive tool for testing progression arcs with simulated gameplay.
 * Allows stepping through stages, adjusting metrics, and analyzing results.
 *
 * @see apps/main/src/lib/intimacy/playtesting.ts
 * @see claude-tasks/12-intimacy-scene-composer-and-progression-editor.md (Phase 11)
 */

import React, { useState } from 'react';
import type { RelationshipProgressionArc } from '@/types';
import {
  startPlaytestSession,
  advanceStage,
  adjustState,
  resetPlaytest,
  autoPlay,
  analyzePlaytest,
  exportPlaytestSession,
  getPlaytestPreset,
  getPlaytestPresetList,
  type PlaytestSession,
  type PlaytestConfig,
  type PlaytestPresetKey,
} from '../lib/playtesting';
import { RelationshipStateEditor } from './RelationshipStateEditor';
import { createDefaultState, createStateFromTier } from '../lib/gateChecking';

interface PlaytestingPanelProps {
  /** Arc to playtest */
  arc: RelationshipProgressionArc;

  /** Callback when panel is closed */
  onClose?: () => void;
}

export function PlaytestingPanel({ arc, onClose }: PlaytestingPanelProps) {
  const [session, setSession] = useState<PlaytestSession | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [config, setConfig] = useState<PlaytestConfig>({
    arc,
    initialState: createDefaultState(),
    autoProgress: false,
    applyStageEffects: true,
    trackAnalytics: true,
  });

  const startSession = () => {
    const newSession = startPlaytestSession(config);
    setSession(newSession);
    setShowAnalysis(false);
  };

  const handleAdvance = () => {
    if (!session) return;
    const updated = advanceStage(session);
    setSession(updated);
  };

  const handleAdjustState = (newState: any) => {
    if (!session) return;
    const updated = adjustState(session, newState, 'Manual state adjustment');
    setSession(updated);
  };

  const handleReset = () => {
    if (!session) return;
    const updated = resetPlaytest(session);
    setSession(updated);
  };

  const handleAutoPlay = () => {
    if (!session) return;
    const updated = autoPlay(session);
    setSession(updated);
  };

  const handleExport = () => {
    if (!session) return;
    const json = exportPlaytestSession(session);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `playtest_${arc.name}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const analysis = session ? analyzePlaytest(session) : null;
  const currentStage = session ? arc.stages[session.currentStageIndex] : null;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-900">
      {/* Header */}
      <div className="p-4 border-b dark:border-neutral-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
              🎮 Playtesting: {arc.name}
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Simulate progression through this arc to test balance and flow
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 text-xl"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {!session ? (
          /* Session Configuration */
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="border dark:border-neutral-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-neutral-100">
                Configure Playtest
              </h3>

              <div className="space-y-4">
                {/* Initial State - Quick Presets */}
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Quick Test Presets
                  </label>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {getPlaytestPresetList().map((preset) => (
                      <button
                        key={preset.key}
                        onClick={() => setConfig({ ...config, initialState: getPlaytestPreset(preset.key) })}
                        className="px-3 py-2 text-left text-sm bg-gray-100 dark:bg-neutral-800 rounded hover:bg-gray-200 dark:hover:bg-neutral-700"
                        title={preset.description}
                      >
                        <div className="font-medium">{preset.name}</div>
                        <div className="text-xs text-neutral-600 dark:text-neutral-400 truncate">
                          {preset.description}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="text-xs text-neutral-500 dark:text-neutral-500 mb-2">
                    Or choose a basic tier:
                  </div>
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => setConfig({ ...config, initialState: createStateFromTier('stranger') })}
                      className="px-3 py-1 text-sm bg-gray-100 dark:bg-neutral-800 rounded hover:bg-gray-200"
                    >
                      Stranger
                    </button>
                    <button
                      onClick={() => setConfig({ ...config, initialState: createStateFromTier('acquaintance') })}
                      className="px-3 py-1 text-sm bg-gray-100 dark:bg-neutral-800 rounded hover:bg-gray-200"
                    >
                      Acquaintance
                    </button>
                    <button
                      onClick={() => setConfig({ ...config, initialState: createStateFromTier('friend') })}
                      className="px-3 py-1 text-sm bg-gray-100 dark:bg-neutral-800 rounded hover:bg-gray-200"
                    >
                      Friend
                    </button>
                  </div>
                  <RelationshipStateEditor
                    state={config.initialState}
                    onChange={(state) => setConfig({ ...config, initialState: state })}
                    showPresets={false}
                    compact={true}
                  />
                </div>

                {/* Options */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.applyStageEffects}
                      onChange={(e) => setConfig({ ...config, applyStageEffects: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm text-neutral-700 dark:text-neutral-300">
                      Apply stage effects (affinity/trust/chemistry changes)
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.trackAnalytics}
                      onChange={(e) => setConfig({ ...config, trackAnalytics: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm text-neutral-700 dark:text-neutral-300">
                      Track analytics for this playtest
                    </span>
                  </label>
                </div>
              </div>

              <button
                onClick={startSession}
                className="w-full mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Start Playtest
              </button>
            </div>
          </div>
        ) : (
          /* Active Playtest Session */
          <div className="space-y-6">
            {/* Session Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAdvance}
                  disabled={session.completed}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  ▶ Advance Stage
                </button>
                <button
                  onClick={handleAutoPlay}
                  disabled={session.completed}
                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300"
                >
                  ⏭ Auto-Play
                </button>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600"
                >
                  🔄 Reset
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAnalysis(!showAnalysis)}
                  className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
                >
                  📊 {showAnalysis ? 'Hide' : 'Show'} Analysis
                </button>
                <button
                  onClick={handleExport}
                  className="px-4 py-2 bg-neutral-500 text-white rounded hover:bg-neutral-600"
                >
                  💾 Export
                </button>
              </div>
            </div>

            {/* Progress Overview */}
            <div className="grid grid-cols-4 gap-4">
              <div className="border dark:border-neutral-700 rounded-lg p-4">
                <div className="text-sm text-neutral-600 dark:text-neutral-400">Current Stage</div>
                <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                  {session.currentStageIndex + 1} / {arc.stages.length}
                </div>
                <div className="text-xs text-neutral-500">{currentStage?.name}</div>
              </div>
              <div className="border dark:border-neutral-700 rounded-lg p-4">
                <div className="text-sm text-neutral-600 dark:text-neutral-400">Completed</div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {session.completedStages.length}
                </div>
                <div className="text-xs text-neutral-500">stages</div>
              </div>
              <div className="border dark:border-neutral-700 rounded-lg p-4">
                <div className="text-sm text-neutral-600 dark:text-neutral-400">Total Steps</div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {session.steps.length}
                </div>
                <div className="text-xs text-neutral-500">actions taken</div>
              </div>
              <div className="border dark:border-neutral-700 rounded-lg p-4">
                <div className="text-sm text-neutral-600 dark:text-neutral-400">Status</div>
                <div className="text-lg font-bold">
                  {session.completed ? (
                    <span className="text-green-600 dark:text-green-400">✓ Complete</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">⏳ In Progress</span>
                  )}
                </div>
              </div>
            </div>

            {/* Analysis Panel */}
            {showAnalysis && analysis && (
              <div className="border dark:border-neutral-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-neutral-100">
                  Playtest Analysis
                </h3>

                <div className="grid grid-cols-2 gap-6">
                  {/* Progression Stats */}
                  <div>
                    <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                      Progression
                    </h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-neutral-600 dark:text-neutral-400">Completion:</span>
                        <span className="font-medium">{analysis.completionPercentage.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-neutral-600 dark:text-neutral-400">Duration:</span>
                        <span className="font-medium">{analysis.durationFormatted}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-neutral-600 dark:text-neutral-400">Avg time/stage:</span>
                        <span className="font-medium">{(analysis.avgTimePerStage / 1000).toFixed(1)}s</span>
                      </div>
                    </div>
                  </div>

                  {/* Metric Changes */}
                  <div>
                    <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                      Metric Progression
                    </h4>
                    <div className="space-y-2">
                      <MetricDelta label="Affinity" data={analysis.metricProgression.affinity} />
                      <MetricDelta label="Trust" data={analysis.metricProgression.trust} />
                      <MetricDelta label="Chemistry" data={analysis.metricProgression.chemistry} />
                      <MetricDelta label="Tension" data={analysis.metricProgression.tension} />
                    </div>
                  </div>
                </div>

                {/* Blocking Gates */}
                {analysis.blockingGates.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                      Blocking Gates
                    </h4>
                    <div className="space-y-1">
                      {analysis.blockingGates.map((gate, idx) => (
                        <div key={idx} className="text-sm flex items-center justify-between p-2 bg-red-50 dark:bg-red-900/20 rounded">
                          <span className="text-neutral-900 dark:text-neutral-100">
                            {gate.stageName} → {gate.gateName}
                          </span>
                          <span className="text-red-600 dark:text-red-400 font-medium">
                            {gate.attempts} attempt{gate.attempts !== 1 ? 's' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Current State Editor */}
            <div className="border dark:border-neutral-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-neutral-100">
                Current Relationship State
              </h3>
              <RelationshipStateEditor
                state={session.currentState}
                onChange={handleAdjustState}
                readOnly={false}
                showPresets={true}
              />
            </div>

            {/* Stage Timeline */}
            <div className="border dark:border-neutral-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-neutral-100">
                Stage Timeline
              </h3>
              <div className="space-y-2">
                {arc.stages.map((stage, idx) => (
                  <div
                    key={stage.id}
                    className={`p-3 rounded-lg border transition-all ${
                      idx === session.currentStageIndex
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : session.completedStages.includes(stage.id)
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                        : 'border-gray-300 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-sm font-medium text-neutral-500">#{idx + 1}</div>
                        <div>
                          <div className="font-medium text-neutral-900 dark:text-neutral-100">
                            {stage.name}
                          </div>
                          <div className="text-xs text-neutral-600 dark:text-neutral-400">
                            Tier: {stage.tier}
                          </div>
                        </div>
                      </div>
                      <div>
                        {session.completedStages.includes(stage.id) ? (
                          <span className="text-green-600 dark:text-green-400">✓</span>
                        ) : idx === session.currentStageIndex ? (
                          <span className="text-blue-600 dark:text-blue-400">→</span>
                        ) : (
                          <span className="text-gray-400">○</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper component for metric delta display
function MetricDelta({ label, data }: { label: string; data: { start: number; end: number; delta: number } }) {
  const color = data.delta > 0 ? 'text-green-600 dark:text-green-400' : data.delta < 0 ? 'text-red-600 dark:text-red-400' : 'text-neutral-600';
  const arrow = data.delta > 0 ? '↑' : data.delta < 0 ? '↓' : '→';

  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-neutral-600 dark:text-neutral-400">{label}:</span>
      <span className={`font-medium ${color}`}>
        {data.start} {arrow} {data.end} ({data.delta > 0 ? '+' : ''}{data.delta})
      </span>
    </div>
  );
}
