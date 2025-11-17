/**
 * Scene Gizmo Mini-Game
 * Interactive control system for scene progression
 * Follows the same pattern as ReflexMiniGame
 */

import { useEffect, useState, useCallback } from 'react';
import { Panel } from '@pixsim7/ui';
import type { SceneGizmoConfig, GizmoResult, GizmoAction } from './types';

interface SceneGizmoMiniGameProps {
  onResult: (result: GizmoResult) => void;
  config: SceneGizmoConfig;
  videoElement?: HTMLVideoElement;
}

export function SceneGizmoMiniGame({
  onResult,
  config,
  videoElement,
}: SceneGizmoMiniGameProps) {
  const [gizmoState, setGizmoState] = useState({
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1,
    activeZone: undefined as string | undefined,
  });

  const [isActive, setIsActive] = useState(true);
  const [currentSegment, setCurrentSegment] = useState<string | undefined>();
  const [intensity, setIntensity] = useState(0.5);

  // Handle gizmo state changes
  const handleStateChange = useCallback((newState: Partial<typeof gizmoState>) => {
    setGizmoState(prev => ({ ...prev, ...newState }));
  }, []);

  // Handle gizmo actions (segment selection, intensity changes, etc.)
  const handleAction = useCallback((action: GizmoAction) => {
    switch (action.type) {
      case 'segment':
        setCurrentSegment(action.value as string);
        break;
      case 'intensity':
        setIntensity(action.value as number);
        break;
      case 'flag':
        // Handle flag setting
        break;
    }
  }, []);

  // Emit result when segment changes
  useEffect(() => {
    if (!currentSegment) return;

    onResult({
      segmentId: currentSegment,
      intensity,
      transition: 'smooth',
    });
  }, [currentSegment, intensity, onResult]);

  // Dynamically import and render the appropriate gizmo component
  const GizmoComponent = useGizmoComponent(config.style || 'orb');

  if (!GizmoComponent) {
    return (
      <Panel className="p-4">
        <div className="text-center text-red-500">
          Gizmo type "{config.style}" not found
        </div>
      </Panel>
    );
  }

  return (
    <div className="scene-gizmo-minigame relative w-full h-full flex items-center justify-center">
      <GizmoComponent
        config={config}
        state={gizmoState}
        onStateChange={handleStateChange}
        onAction={handleAction}
        videoElement={videoElement}
        isActive={isActive}
      />
    </div>
  );
}

// Hook to dynamically load gizmo components
function useGizmoComponent(gizmoType: string) {
  const [Component, setComponent] = useState<any>(null);

  useEffect(() => {
    let mounted = true;

    async function loadComponent() {
      try {
        let module;
        switch (gizmoType) {
          case 'orb':
            module = await import('../../../../../frontend/src/components/gizmos/OrbGizmo');
            break;
          case 'constellation':
            module = await import('../../../../../frontend/src/components/gizmos/ConstellationGizmo');
            break;
          // Add more gizmo types as they're created
          default:
            console.warn(`Unknown gizmo type: ${gizmoType}`);
            return;
        }

        if (mounted && module) {
          setComponent(() => module.OrbGizmo || module.ConstellationGizmo || module.default);
        }
      } catch (error) {
        console.error(`Failed to load gizmo component: ${gizmoType}`, error);
      }
    }

    loadComponent();

    return () => {
      mounted = false;
    };
  }, [gizmoType]);

  return Component;
}