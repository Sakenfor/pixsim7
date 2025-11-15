import { useEffect, useState } from 'react';
import { useAssets, type AssetSummary } from '../../hooks/useAssets';
import { useControlCubeStore } from '../../stores/controlCubeStore';
import type { CubeFace, CubeFaceContent } from './ControlCube';
import { BACKEND_BASE } from '../../lib/api/client';

interface GalleryCubeFaceContentProps {
  cubeId: string;
}

/**
 * Gallery Cube Face Content
 *
 * Renders asset thumbnails on cube faces. When docked to gallery panel,
 * syncs with recent assets. When undocked, shows pinned assets.
 */
export function useGalleryCubeFaceContent(cubeId: string): CubeFaceContent {
  const cube = useControlCubeStore((s) => s.cubes[cubeId]);
  const { items: assets, loading } = useAssets({ limit: 6 });

  // Get pinned assets or use recent assets
  const pinnedAssets = cube?.pinnedAssets || {};

  // Helper to render asset thumbnail
  const renderAssetThumbnail = (asset: AssetSummary | undefined, face: CubeFace) => {
    if (!asset) {
      return (
        <div className="flex flex-col items-center justify-center gap-1">
          <div className="text-2xl">
            {face === 'front' && '🖼️'}
            {face === 'back' && '🎨'}
            {face === 'left' && '◀️'}
            {face === 'right' && '▶️'}
            {face === 'top' && '⬆️'}
            {face === 'bottom' && '📥'}
          </div>
          <div className="text-[8px] text-white/40">{face}</div>
        </div>
      );
    }

    const thumbSrc = (() => {
      const url = asset.thumbnail_url;
      if (!url) return undefined;
      if (url.startsWith('http://') || url.startsWith('https://')) return url;
      if (url.startsWith('/')) return `${BACKEND_BASE}${url}`;
      return `${BACKEND_BASE}/${url}`;
    })();

    if (!thumbSrc) {
      return (
        <div className="flex flex-col items-center justify-center gap-1">
          <div className="text-2xl">
            {face === 'front' && 'dY-��,?'}
            {face === 'back' && 'dYZ"'}
            {face === 'left' && '�-?�,?'}
            {face === 'right' && '�-�,?'}
            {face === 'top' && '��+�,?'}
            {face === 'bottom' && 'dY"�'}
          </div>
          <div className="text-[8px] text-white/40">{face}</div>
        </div>
      );
    }

    return (
      <div className="relative w-full h-full overflow-hidden">
        {/* Thumbnail image */}
        <img
          src={thumbSrc}
          alt={`Asset ${asset.id}`}
          className="absolute inset-0 w-full h-full object-cover opacity-80"
        />

        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

        {/* Asset info */}
        <div className="absolute bottom-0 left-0 right-0 p-1.5 flex items-center gap-1">
          <div className="text-[10px] text-white/90 font-medium truncate">
            {asset.media_type === 'video' ? '🎬' : '📷'} #{asset.id}
          </div>
        </div>

        {/* Pin indicator */}
        {cube?.pinnedAssets?.[face] && (
          <div className="absolute top-1 right-1 text-xs">📌</div>
        )}
      </div>
    );
  };

  // Map faces to assets
  const faceContent: CubeFaceContent = {};
  const faces: CubeFace[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];

  faces.forEach((face, index) => {
    // Check if this face has a pinned asset
    const pinnedAssetId = pinnedAssets[face];

    if (pinnedAssetId) {
      // Find the pinned asset
      const pinnedAsset = assets.find((a) => String(a.id) === pinnedAssetId);
      faceContent[face] = renderAssetThumbnail(pinnedAsset, face);
    } else {
      // Use recent asset at this index
      const asset = assets[index];
      faceContent[face] = renderAssetThumbnail(asset, face);
    }
  });

  return faceContent;
}

/**
 * Get asset ID from a cube face
 */
export function getAssetFromCubeFace(cubeId: string, face: CubeFace): number | undefined {
  const cube = useControlCubeStore.getState().cubes[cubeId];
  const { items: assets } = useAssets({ limit: 6 });

  // Check pinned asset first
  const pinnedAssetId = cube?.pinnedAssets?.[face];
  if (pinnedAssetId) {
    return parseInt(pinnedAssetId, 10);
  }

  // Otherwise, map face to index
  const faces: CubeFace[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];
  const index = faces.indexOf(face);
  const asset = assets[index];

  return asset?.id;
}
