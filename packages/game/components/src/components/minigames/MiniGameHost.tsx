/**
 * MiniGameHost - Generic host component for all mini-games
 *
 * This component acts as a bridge between the ScenePlayer and registered mini-games.
 * It looks up the mini-game by ID from the registry and renders the appropriate component.
 */

import React from 'react';
import { getMiniGame } from '@pixsim7/interaction.gizmos';

// ============================================================================
// Error Boundary for Mini-Games
// ============================================================================

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback: (error: Error, errorInfo: React.ErrorInfo) => React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class MiniGameErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[MiniGameHost] Mini-game crashed:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError && this.state.error && this.state.errorInfo) {
      return this.props.fallback(this.state.error, this.state.errorInfo);
    }

    return this.props.children;
  }
}

// ============================================================================
// Error UI Component
// ============================================================================

function MiniGameErrorUI({
  error,
  errorInfo,
  onSkip
}: {
  error: Error;
  errorInfo: React.ErrorInfo;
  onSkip: () => void;
}) {
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
      <div style={{ maxWidth: '600px' }}>
        <h2 style={{ marginBottom: '1rem', color: '#ff6b6b' }}>
          ⚠️ Mini-Game Error
        </h2>
        <p style={{ marginBottom: '1rem', color: '#ffd43b' }}>
          The mini-game encountered an error and crashed.
        </p>
        <details style={{
          textAlign: 'left',
          background: 'rgba(0, 0, 0, 0.5)',
          padding: '1rem',
          borderRadius: '4px',
          marginBottom: '1rem',
          fontSize: '0.875rem',
        }}>
          <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>
            Error Details
          </summary>
          <pre style={{
            overflow: 'auto',
            fontSize: '0.75rem',
            color: '#ff6b6b',
          }}>
            {error.toString()}
          </pre>
          <pre style={{
            overflow: 'auto',
            fontSize: '0.75rem',
            marginTop: '0.5rem',
            color: '#ffd43b',
          }}>
            {errorInfo.componentStack}
          </pre>
        </details>
        <button
          onClick={onSkip}
          style={{
            padding: '0.5rem 1rem',
            background: '#ff6b6b',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          Skip Mini-Game
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// MiniGameHost Props
// ============================================================================

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

  // Validate config if validation function exists
  if (miniGameDef.validate) {
    const validationError = miniGameDef.validate(effectiveConfig);
    if (validationError) {
      console.error(`[MiniGameHost] Config validation failed for ${miniGameId}:`, validationError);
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
            <h2 style={{ marginBottom: '1rem', color: '#ffd43b' }}>
              Invalid Configuration
            </h2>
            <p style={{ color: '#ff6b6b' }}>{validationError}</p>
            <button
              onClick={() => onResult({ type: 'error', error: 'invalid-config', message: validationError })}
              style={{
                marginTop: '1rem',
                padding: '0.5rem 1rem',
                background: '#ffd43b',
                color: '#000',
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
  }

  // Render the mini-game component with error boundary
  return (
    <MiniGameErrorBoundary
      fallback={(error, errorInfo) => (
        <MiniGameErrorUI
          error={error}
          errorInfo={errorInfo}
          onSkip={() => onResult({ error: 'mini-game-crashed', message: error.message })}
        />
      )}
    >
      <MiniGameComponent
        config={effectiveConfig}
        onResult={onResult}
        videoElement={videoElement}
        gameState={gameState}
      />
    </MiniGameErrorBoundary>
  );
}
