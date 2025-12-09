import { Game2D } from '@/routes/Game2D';

/**
 * GameViewPanel
 *
 * Workspace-embedded wrapper around the Game2D Core Game View.
 * Used by the 'game' panel entry in the panel registry.
 */
export function GameViewPanel() {
  return (
    <div className="h-full w-full min-h-0 min-w-0 overflow-hidden bg-black">
      <Game2D />
    </div>
  );
}

