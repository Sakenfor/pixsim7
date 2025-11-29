/**
 * Scene Gizmo Mini-Game
 * Interactive control system for scene progression
 *
 * Architecture Note: This component lives in frontend (not game-ui) because:
 * - It's tightly coupled to frontend's gizmo implementations
 * - Uses frontend-specific gizmo renderer registry
 * - Keeps package boundaries clean
 */

import { useEffect, useState, useCallback, Suspense } from 'react';
import { Panel } from '@pixsim7/shared.ui';
import type { SceneGizmoConfig, GizmoResult, GizmoAction } from '@pixsim7/scene.gizmos';
import { getGizmoRenderer } from '@/lib/gizmos/renderers';

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

  // Get the appropriate gizmo component from the centralized renderer map
  const GizmoComponent = getGizmoRenderer(config.style || 'orb');

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
      <Suspense fallback={<div className="text-center">Loading gizmo...</div>}>
        <GizmoComponent
          config={config}
          state={gizmoState}
          onStateChange={handleStateChange}
          onAction={handleAction}
          videoElement={videoElement}
          isActive={isActive}
        />
      </Suspense>
    </div>
  );
}
