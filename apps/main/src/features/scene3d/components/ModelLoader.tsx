/**
 * ModelLoader
 *
 * Loads and displays a glTF/GLB model with animation support.
 * Extracts zones from mesh names and handles model parsing.
 */

import { useGLTF, useAnimations } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';

import { parseModelForZones } from '@lib/models/zoneUtils';

import { useModel3DStore } from '../stores/model3DStore';

export interface ModelLoaderProps {
  /** URL to the glTF/GLB model */
  url: string;
  /** Show wireframe overlay */
  wireframe?: boolean;
}

/**
 * glTF model loader with animation and zone detection.
 */
export function ModelLoader({ url, wireframe = false }: ModelLoaderProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Load glTF model
  const { scene, animations } = useGLTF(url);

  // Set up animations
  const { actions, mixer } = useAnimations(animations, groupRef);

  // Store actions
  const setModelLoaded = useModel3DStore((s) => s.setModelLoaded);
  const setError = useModel3DStore((s) => s.setError);
  const currentAnimation = useModel3DStore((s) => s.currentAnimation);
  const isPlaying = useModel3DStore((s) => s.isPlaying);
  const playbackSpeed = useModel3DStore((s) => s.playbackSpeed);
  const setCurrentTime = useModel3DStore((s) => s.setCurrentTime);

  // Clone scene to avoid mutation issues
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);

    // Apply wireframe if needed
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Ensure materials are cloned
        if (Array.isArray(child.material)) {
          child.material = child.material.map((m) => m.clone());
        } else if (child.material) {
          child.material = child.material.clone();
        }
      }
    });

    return clone;
  }, [scene]);

  // Apply wireframe mode
  useEffect(() => {
    if (!clonedScene) return;

    clonedScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];

        materials.forEach((mat) => {
          if (mat instanceof THREE.MeshStandardMaterial ||
              mat instanceof THREE.MeshBasicMaterial ||
              mat instanceof THREE.MeshPhongMaterial) {
            mat.wireframe = wireframe;
          }
        });
      }
    });
  }, [clonedScene, wireframe]);

  // Parse model on load
  useEffect(() => {
    try {
      const parseResult = parseModelForZones(scene, animations);
      setModelLoaded(parseResult);
    } catch (error) {
      console.error('Failed to parse model:', error);
      setError(error instanceof Error ? error.message : 'Failed to parse model');
    }
  }, [scene, animations, setModelLoaded, setError]);

  // Handle animation changes
  useEffect(() => {
    // Stop all current animations
    Object.values(actions).forEach((action) => {
      action?.stop();
    });

    // Play selected animation
    if (currentAnimation && actions[currentAnimation]) {
      const action = actions[currentAnimation];
      action.reset();
      action.setEffectiveTimeScale(playbackSpeed);

      if (isPlaying) {
        action.play();
      } else {
        // Set to first frame when paused
        action.play();
        action.paused = true;
      }
    }
  }, [currentAnimation, actions, isPlaying, playbackSpeed]);

  // Update playback speed
  useEffect(() => {
    if (mixer) {
      mixer.timeScale = playbackSpeed;
    }
  }, [mixer, playbackSpeed]);

  // Handle play/pause
  useEffect(() => {
    if (currentAnimation && actions[currentAnimation]) {
      const action = actions[currentAnimation];
      action.paused = !isPlaying;
    }
  }, [isPlaying, currentAnimation, actions]);

  // Update current time for timeline
  useFrame(() => {
    if (mixer && currentAnimation && actions[currentAnimation]) {
      const action = actions[currentAnimation];
      if (action) {
        setCurrentTime(action.time);
      }
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={clonedScene} />
    </group>
  );
}

// Preload helper
ModelLoader.preload = (url: string) => {
  useGLTF.preload(url);
};

export default ModelLoader;
