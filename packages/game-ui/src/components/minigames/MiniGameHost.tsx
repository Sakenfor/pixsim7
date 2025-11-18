/**
 * MiniGameHost - Generic host component for all mini-games
 *
 * This component acts as a bridge between the ScenePlayer and registered mini-games.
 * It looks up the mini-game by ID from the registry and renders the appropriate component.
 */

import React from 'react';
import { getMiniGame } from '@pixsim7/scene-gizmos';

export interface MiniGameHostProps {
  /** Mini-game ID to look up in the registry */
  miniGameId: string;

  /** Configuration to pass to the mini-game */
  config?: Record<string, any>;

  /** Callback when mini-game completes */
  onResult: (result: any) => void;

  /** Optional video element for video-synced mini-games */
  videoElement?: HTMLVideoElement;

  /** Optional game state flags */
  gameState?: Record<string, any>;
}

/**
 * Host component that delegates to registered mini-games
 */
export function MiniGameHost({
  miniGameId,
  config,
  onResult,
  videoElement,
  gameState,
}: MiniGameHostProps) {
  // Look up the mini-game definition from the registry
  const miniGameDef = getMiniGame(miniGameId);

  // Handle missing mini-game
  if (!miniGameDef) {
    console.error(`[MiniGameHost] Mini-game not found in registry: ${miniGameId}`);
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '2rem',
          textAlign: 'center',
          fontFamily: 'system-ui',
        }}
      >
        <div>
          <h2 style={{ marginBottom: '1rem' }}>Mini-Game Not Found</h2>
          <p style={{ color: '#ff6b6b' }}>
            The mini-game "{miniGameId}" is not registered.
          </p>
          <button
            onClick={() => onResult({ error: 'mini-game-not-found' })}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              background: '#ff6b6b',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  // Get the component from the definition
  const MiniGameComponent = miniGameDef.component as React.ComponentType<any>;

  // Merge default config with provided config
  const effectiveConfig = {
    ...miniGameDef.defaultConfig,
    ...config,
  };

  // Render the mini-game component
  return (
    <MiniGameComponent
      config={effectiveConfig}
      onResult={onResult}
      videoElement={videoElement}
      gameState={gameState}
    />
  );
}
