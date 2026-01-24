/**
 * Gizmo Surface - Interaction Surface Wrapper
 *
 * Renders a GenericSurfaceGizmo for interactions with surface === 'gizmo'.
 * Handles loading the profile, managing the session, and executing outcomes.
 */

import { getProfile } from '@pixsim7/scene.gizmos';
import type {
  InteractionInstance,
  InteractionDefinition,
  GizmoSessionResult,
  GizmoConfig,
} from '@pixsim7/shared.types';
import React, { useCallback, useState, useMemo } from 'react';

import { executeInteraction } from '@lib/api/interactions';

import { GenericSurfaceGizmo } from '@features/gizmos/lib/core/components/GenericSurfaceGizmo';

import './GizmoSurface.css';

// =============================================================================
// Types
// =============================================================================

export interface GizmoSurfaceProps {
  /** The interaction instance being executed */
  interaction: InteractionInstance;

  /** World ID */
  worldId: number;

  /** Session ID */
  sessionId: number;

  /** Callback when interaction completes */
  onComplete: (result: GizmoSessionResult) => void;

  /** Callback to cancel/close the surface */
  onCancel?: () => void;

  /** Optional override for gizmo config */
  gizmoConfigOverride?: Partial<GizmoConfig>;
}

// =============================================================================
// Component
// =============================================================================

export function GizmoSurface({
  interaction,
  worldId,
  sessionId,
  onComplete,
  onCancel,
  gizmoConfigOverride,
}: GizmoSurfaceProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get gizmo config from interaction definition
  // Note: InteractionInstance copies relevant fields from definition
  const gizmoConfig = useMemo(() => ({
    ...(interaction as unknown as InteractionDefinition).gizmoConfig,
    ...gizmoConfigOverride,
  }), [interaction, gizmoConfigOverride]);

  // Get profile (may be undefined)
  const profile = useMemo(() => {
    if (!gizmoConfig?.profileId) return undefined;
    return getProfile(gizmoConfig.profileId);
  }, [gizmoConfig?.profileId]);

  // Handle completion - defined before early returns
  const handleComplete = useCallback(async (result: GizmoSessionResult) => {
    if (isExecuting) return;

    setIsExecuting(true);
    setError(null);

    try {
      // Execute the interaction with gizmo result
      await executeInteraction({
        worldId,
        sessionId,
        interactionId: interaction.definitionId,
        target: interaction.target,
        participants: interaction.participants,
        primaryRole: interaction.primaryRole,
        gizmoResult: result,
      });

      onComplete(result);
    } catch (err) {
      console.error('Failed to execute gizmo interaction:', err);
      setError(err instanceof Error ? err.message : 'Failed to execute interaction');
    } finally {
      setIsExecuting(false);
    }
  }, [worldId, sessionId, interaction, isExecuting, onComplete]);

  // Handle cancel - defined before early returns
  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel();
    }
  }, [onCancel]);

  // Early return for missing config
  if (!gizmoConfig?.profileId) {
    return (
      <div className="gizmo-surface-error">
        <p>No gizmo profile configured for this interaction.</p>
        {onCancel && (
          <button onClick={onCancel} className="gizmo-cancel-btn">
            Close
          </button>
        )}
      </div>
    );
  }

  // Early return for missing profile
  if (!profile) {
    return (
      <div className="gizmo-surface-error">
        <p>Gizmo profile not found: {gizmoConfig.profileId}</p>
        {onCancel && (
          <button onClick={onCancel} className="gizmo-cancel-btn">
            Close
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="gizmo-surface">
      {/* Header */}
      <div className="gizmo-surface-header">
        <div className="gizmo-surface-title">
          <span className="gizmo-surface-icon">{interaction.icon || '\u{1F3AE}'}</span>
          <span className="gizmo-surface-label">{interaction.label}</span>
        </div>
        {onCancel && (
          <button
            onClick={handleCancel}
            className="gizmo-close-btn"
            disabled={isExecuting}
            title="Cancel"
          >
            {'\u2715'}
          </button>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="gizmo-surface-error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>{'\u2715'}</button>
        </div>
      )}

      {/* Gizmo component */}
      <div className="gizmo-surface-content">
        <GenericSurfaceGizmo
          profile={profile}
          activeInstrumentId={gizmoConfig.instrumentIds?.[0]}
          timeLimit={gizmoConfig.timeLimit}
          onComplete={handleComplete}
          showRegionLabels={true}
        />
      </div>

      {/* Footer with manual complete */}
      {profile.completionCriteria?.allowManualCompletion && (
        <div className="gizmo-surface-footer">
          <button
            onClick={() => handleComplete({
              finalDimensions: {},
              completionType: 'manual',
              sessionDuration: 0,
            })}
            className="gizmo-manual-complete-btn"
            disabled={isExecuting}
          >
            {isExecuting ? 'Completing...' : 'Finish Early'}
          </button>
        </div>
      )}

      {/* Loading overlay */}
      {isExecuting && (
        <div className="gizmo-surface-loading">
          <div className="gizmo-loading-spinner" />
          <span>Applying outcomes...</span>
        </div>
      )}
    </div>
  );
}

export default GizmoSurface;
