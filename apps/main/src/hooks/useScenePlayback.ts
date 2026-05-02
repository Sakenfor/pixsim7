import { useCallback, useState } from 'react';

import type { ScenePlaybackPhase } from '@pixsim7/game.engine';

import type { Scene } from '@lib/registries';

export interface UseScenePlaybackResult {
  currentScene: Scene | null;
  isSceneOpen: boolean;
  scenePhase: ScenePlaybackPhase | null;
  isLoadingScene: boolean;
  /** Set during async scene-fetch flows. */
  setIsLoadingScene: React.Dispatch<React.SetStateAction<boolean>>;
  /** Pass-through setter for ScenePlayer's onStateChange. */
  setScenePhase: React.Dispatch<React.SetStateAction<ScenePlaybackPhase | null>>;
  /** Open an already-fetched scene. Sets isSceneOpen=true, phase='playing'. */
  openScene: (scene: Scene) => void;
  /** Close the scene modal. Sets isSceneOpen=false and clears phase. */
  closeScene: () => void;
}

/**
 * Owns the scene-playback modal's state cluster: the active scene, whether
 * the modal is open, the current playback phase, and a loading flag for
 * async scene fetches.
 *
 * The async fetch + lazy-session-creation patterns intentionally stay at
 * call sites since they vary by entry point (URL auto-play, NPC slot click,
 * hotspot, dialogue start).
 */
export function useScenePlayback(): UseScenePlaybackResult {
  const [currentScene, setCurrentScene] = useState<Scene | null>(null);
  const [isSceneOpen, setIsSceneOpen] = useState(false);
  const [scenePhase, setScenePhase] = useState<ScenePlaybackPhase | null>(null);
  const [isLoadingScene, setIsLoadingScene] = useState(false);

  const openScene = useCallback((scene: Scene) => {
    setCurrentScene(scene);
    setIsSceneOpen(true);
    setScenePhase('playing');
  }, []);

  const closeScene = useCallback(() => {
    setIsSceneOpen(false);
    setScenePhase(null);
  }, []);

  return {
    currentScene,
    isSceneOpen,
    scenePhase,
    isLoadingScene,
    setIsLoadingScene,
    setScenePhase,
    openScene,
    closeScene,
  };
}
