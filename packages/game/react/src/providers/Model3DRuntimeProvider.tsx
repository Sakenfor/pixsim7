/**
 * Model3D Runtime Provider
 *
 * Wraps 3D model components with the generic runtime context providers.
 * This allows using useViewport(), usePlayback(), useLoading() hooks
 * for consistent state management across 2D and 3D scenes.
 *
 * @example
 * ```tsx
 * import { Model3DRuntimeProvider } from '@pixsim7/game.react/providers';
 * import { useViewport, usePlayback, useLoading } from '@pixsim7/game.react/viewport';
 *
 * function ModelInspector() {
 *   return (
 *     <Model3DRuntimeProvider initialMode="zones">
 *       <ModelViewport />
 *       <AnimationControls />
 *     </Model3DRuntimeProvider>
 *   );
 * }
 *
 * function ModelViewport() {
 *   const { selectedElementId, select, hover } = useViewport();
 *   const { isPlaying, toggle } = usePlayback();
 *   const { status, error } = useLoading();
 *   // ...
 * }
 * ```
 */

import { type ReactNode } from 'react';
import {
  ViewportProvider,
  PlaybackProvider,
  LoadingProvider,
  type BaseMode,
} from '../viewport';

/**
 * Props for Model3DRuntimeProvider
 */
export interface Model3DRuntimeProviderProps {
  children: ReactNode;
  /** Initial base mode (default: 'view') */
  initialBaseMode?: BaseMode;
  /** Initial mode detail for 3D context (default: 'view') */
  initialModeDetail?: string;
  /** Initial playback speed (default: 1) */
  initialPlaybackSpeed?: number;
  /** Initial animation duration (default: 0) */
  initialDuration?: number;
}

/**
 * Provider that sets up all runtime contexts for 3D model components.
 * Composes ViewportProvider, PlaybackProvider, and LoadingProvider.
 */
export function Model3DRuntimeProvider({
  children,
  initialBaseMode = 'view',
  initialModeDetail = 'view',
  initialPlaybackSpeed = 1,
  initialDuration = 0,
}: Model3DRuntimeProviderProps) {
  return (
    <ViewportProvider
      initial={{
        baseMode: initialBaseMode,
        modeDetail: initialModeDetail,
      }}
    >
      <PlaybackProvider
        initial={{
          playbackSpeed: initialPlaybackSpeed,
          duration: initialDuration,
        }}
      >
        <LoadingProvider>{children}</LoadingProvider>
      </PlaybackProvider>
    </ViewportProvider>
  );
}
