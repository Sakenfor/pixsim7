import { useState, useEffect } from 'react';
import { Button } from '@pixsim7/ui';
import type { DraftSceneNode } from '../../modules/scene-builder';

interface MiniGameNodeEditorProps {
  node: DraftSceneNode;
  onUpdate: (patch: Partial<DraftSceneNode>) => void;
}

export function MiniGameNodeEditor({ node, onUpdate }: MiniGameNodeEditorProps) {
  const [gameType, setGameType] = useState<'reflex' | 'memory' | 'puzzle' | 'sceneGizmo'>('reflex');
  const [rounds, setRounds] = useState(3);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [timeLimit, setTimeLimit] = useState(30);

  // Scene Gizmo specific settings
  const [gizmoType, setGizmoType] = useState<'orb' | 'constellation' | 'rings'>('orb');
  const [zoneCount, setZoneCount] = useState(6);

  useEffect(() => {
    // Load mini-game config from node metadata
    const config = (node.metadata as any)?.miniGameConfig;
    if (config) {
      setGameType(config.gameType || 'reflex');
      setRounds(config.rounds || 3);
      setDifficulty(config.difficulty || 'medium');
      setTimeLimit(config.timeLimit || 30);

      // Gizmo-specific config
      if (config.gizmoConfig) {
        setGizmoType(config.gizmoConfig.type || 'orb');
        setZoneCount(config.gizmoConfig.zoneCount || 6);
      }
    }
  }, [node]);

  function handleApply() {
    const baseConfig = {
      gameType,
      rounds,
      difficulty,
      timeLimit,
    };

    // Add gizmo-specific config if applicable
    const miniGameConfig =
      gameType === 'sceneGizmo'
        ? {
            ...baseConfig,
            gizmoConfig: {
              type: gizmoType,
              zoneCount,
            },
          }
        : baseConfig;

    onUpdate({
      metadata: {
        ...node.metadata,
        miniGameConfig,
      },
    });
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-neutral-600 dark:text-neutral-400">
        Configure an interactive mini-game segment
      </div>

      {/* Game Type */}
      <div>
        <label className="block text-sm font-medium mb-1">Game Type</label>
        <select
          value={gameType}
          onChange={(e) => setGameType(e.target.value as any)}
          className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
        >
          <option value="reflex">Reflex Test</option>
          <option value="memory">Memory Challenge</option>
          <option value="puzzle">Puzzle Game</option>
          <option value="sceneGizmo">Scene Gizmo Controller</option>
        </select>
      </div>

      {/* Scene Gizmo Settings */}
      {gameType === 'sceneGizmo' && (
        <>
          <div>
            <label className="block text-sm font-medium mb-1">Gizmo Type</label>
            <select
              value={gizmoType}
              onChange={(e) => setGizmoType(e.target.value as any)}
              className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
            >
              <option value="orb">Crystal Orb (Rotation)</option>
              <option value="constellation">Star Field (Navigation)</option>
              <option value="rings">Orbital Rings</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Control Zones: {zoneCount}</label>
            <input
              type="range"
              min="3"
              max="12"
              value={zoneCount}
              onChange={(e) => setZoneCount(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-neutral-500">
              <span>3</span>
              <span>12</span>
            </div>
            <div className="text-xs text-neutral-500 mt-1">
              Number of selectable zones/segments in the gizmo
            </div>
          </div>

          <div className="text-xs text-neutral-500 dark:text-neutral-400 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded p-2">
            💡 Gizmo controls let players interact with scenes through 3D spatial controls
          </div>
        </>
      )}

      {/* Standard Settings (for non-gizmo games) */}
      {gameType !== 'sceneGizmo' && (
        <>
          {/* Rounds */}
          <div>
            <label className="block text-sm font-medium mb-1">Rounds: {rounds}</label>
            <input
              type="range"
              min="1"
              max="10"
              value={rounds}
              onChange={(e) => setRounds(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-neutral-500">
              <span>1</span>
              <span>10</span>
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <label className="block text-sm font-medium mb-1">Difficulty</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as any)}
              className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          {/* Time Limit */}
          <div>
            <label className="block text-sm font-medium mb-1">Time Limit (seconds): {timeLimit}</label>
            <input
              type="range"
              min="10"
              max="120"
              step="5"
              value={timeLimit}
              onChange={(e) => setTimeLimit(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-neutral-500">
              <span>10s</span>
              <span>120s</span>
            </div>
          </div>

          <div className="text-xs text-neutral-500 dark:text-neutral-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-2">
            💡 Use success handle for win, failure handle for lose/timeout
          </div>
        </>
      )}

      <Button variant="primary" onClick={handleApply} className="w-full">
        Apply Changes
      </Button>
    </div>
  );
}
