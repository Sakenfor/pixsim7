/**
 * Gizmo Playground
 *
 * Renders the currently selected gizmo in an interactive canvas.
 * When an asset is loaded, shows the asset image with a zone detection overlay.
 * Reads selection from gizmoLabStore.
 */

import type { GizmoResult, SceneGizmoConfig } from '@pixsim7/scene.gizmos';
import { Panel } from '@pixsim7/shared.ui';
import { Loader2, Play, AlertCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { zoneDetectorRegistry } from '@lib/detection';

import { SceneGizmoMiniGame } from '@/components/minigames/SceneGizmoMiniGame';

import { useGizmoLabStore, useSelectedGizmo } from '../../stores/gizmoLabStore';

import { AssetInput } from './AssetInput';
import { ZoneOverlay } from './ZoneOverlay';

export function GizmoPlayground() {
  const selectedGizmo = useSelectedGizmo();

  const assetUrl = useGizmoLabStore((s) => s.assetUrl);
  const detectedZones = useGizmoLabStore((s) => s.detectedZones);
  const activeDetectorId = useGizmoLabStore((s) => s.activeDetectorId);
  const isDetecting = useGizmoLabStore((s) => s.isDetecting);
  const detectionError = useGizmoLabStore((s) => s.detectionError);
  const setDetectorId = useGizmoLabStore((s) => s.setDetectorId);
  const runDetection = useGizmoLabStore((s) => s.runDetection);

  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  const detectors = useMemo(() => zoneDetectorRegistry.list(), []);

  // Reset image state when URL changes
  useEffect(() => {
    setImageLoaded(false);
  }, [assetUrl]);

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
  }, []);

  const handleDetect = useCallback(() => {
    if (imageRef.current && imageLoaded) {
      runDetection(imageRef.current);
    }
  }, [runDetection, imageLoaded]);

  // Auto-detect when detector changes or image loads
  useEffect(() => {
    if (imageLoaded && imageRef.current) {
      runDetection(imageRef.current);
    }
  }, [activeDetectorId, imageLoaded, runDetection]);

  const gizmoConfig = useMemo((): SceneGizmoConfig | null => {
    if (!selectedGizmo) return null;

    const baseConfig = selectedGizmo.defaultConfig || {};

    return {
      zones: baseConfig.zones || [
        { id: 'zone1', position: { x: 0, y: 0, z: 0 }, radius: 50, label: 'Zone 1' },
        { id: 'zone2', position: { x: 100, y: 0, z: 0 }, radius: 50, label: 'Zone 2' },
        { id: 'zone3', position: { x: 0, y: 100, z: 0 }, radius: 50, label: 'Zone 3' },
      ],
      style: (baseConfig.style ?? selectedGizmo.id) as any,
      visual: baseConfig.visual,
      physics: baseConfig.physics,
      audio: baseConfig.audio,
      gestures: baseConfig.gestures,
    };
  }, [selectedGizmo]);

  const handleGizmoResult = useCallback((result: GizmoResult) => {
    console.log('[GizmoLab] Gizmo result:', result);
  }, []);

  return (
    <Panel className="p-4 h-full flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-shrink-0">
        <h3 className="text-sm font-semibold">Gizmo Playground</h3>
      </div>

      {/* Asset picker */}
      <div className="flex-shrink-0">
        <AssetInput />
      </div>

      {/* Detector controls — only when asset is loaded */}
      {assetUrl && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            value={activeDetectorId}
            onChange={(e) => setDetectorId(e.target.value)}
            className="text-xs bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded px-2 py-1 flex-1"
          >
            {detectors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleDetect}
            disabled={isDetecting || !imageLoaded}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDetecting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            Detect
          </button>
        </div>
      )}

      {/* Detection error */}
      {detectionError && (
        <div className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400 flex-shrink-0">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          {detectionError}
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 min-h-0">
        {assetUrl ? (
          /* Asset with zone overlay */
          <div className="relative w-full h-full bg-neutral-100 dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-700 overflow-hidden flex items-center justify-center">
            <img
              ref={imageRef}
              src={assetUrl}
              alt="Asset"
              onLoad={handleImageLoad}
              className="max-w-full max-h-full object-contain"
              crossOrigin="anonymous"
            />
            {imageLoaded && detectedZones.length > 0 && (
              <ZoneOverlay zones={detectedZones} />
            )}
            {isDetecting && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              </div>
            )}
          </div>
        ) : selectedGizmo && gizmoConfig ? (
          /* Gizmo mini-game (no asset loaded) */
          <div className="space-y-3 h-full flex flex-col">
            <div className="bg-neutral-100 dark:bg-neutral-800 rounded p-2 text-sm flex-shrink-0">
              <div className="font-medium">{selectedGizmo.name}</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                {selectedGizmo.description || 'No description'}
              </div>
            </div>

            <div className="relative flex-1 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-700 overflow-hidden">
              <SceneGizmoMiniGame
                config={gizmoConfig}
                onResult={handleGizmoResult}
              />
            </div>

            <div className="text-xs text-neutral-500 dark:text-neutral-400 flex-shrink-0">
              Interact with the gizmo above. Load an asset to test zone detection.
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-500 dark:text-neutral-400 text-sm">
            Load an asset or select a gizmo to begin
          </div>
        )}
      </div>

      {/* Zone count */}
      {detectedZones.length > 0 && (
        <div className="text-xs text-neutral-500 dark:text-neutral-400 flex-shrink-0">
          {detectedZones.length} zone{detectedZones.length !== 1 ? 's' : ''} detected
          {activeDetectorId && ` via ${detectors.find((d) => d.id === activeDetectorId)?.name ?? activeDetectorId}`}
        </div>
      )}
    </Panel>
  );
}
