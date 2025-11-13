import { useState, useEffect } from 'react';
import { Button } from '@pixsim7/ui';
import type { DraftSceneNode } from '../../modules/scene-builder';

interface MiniGameNodeEditorProps {
  node: DraftSceneNode;
  onUpdate: (patch: Partial<DraftSceneNode>) => void;
}

export function MiniGameNodeEditor({ node, onUpdate }: MiniGameNodeEditorProps) {
  const [gameType, setGameType] = useState<'reflex' | 'memory' | 'puzzle'>('reflex');
  const [rounds, setRounds] = useState(3);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [timeLimit, setTimeLimit] = useState(30);

  useEffect(() => {
    // Load mini-game config from node metadata
    const config = (node.metadata as any)?.miniGameConfig;
    if (config) {
      setGameType(config.gameType || 'reflex');
      setRounds(config.rounds || 3);
      setDifficulty(config.difficulty || 'medium');
      setTimeLimit(config.timeLimit || 30);
    }
  }, [node]);

  function handleApply() {
    onUpdate({
      metadata: {
        ...node.metadata,
        miniGameConfig: {
          gameType,
          rounds,
          difficulty,
          timeLimit,
        }
      }
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
        </select>
      </div>

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

      <Button variant="primary" onClick={handleApply} className="w-full">
        Apply Changes
      </Button>
    </div>
  );
}
