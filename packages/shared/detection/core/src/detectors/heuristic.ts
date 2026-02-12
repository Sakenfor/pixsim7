/**
 * Heuristic Zone Detector
 *
 * Uses the alpha channel to find the character silhouette, then splits it into
 * horizontal bands mapped to body parts. Works best on images with a transparent
 * or near-uniform background.
 *
 * Algorithm:
 * 1. Draw image to an offscreen canvas
 * 2. Scan alpha channel to find the bounding silhouette
 * 3. For each scanline, find the left-most and right-most opaque pixel
 * 4. Divide the vertical extent into anatomical bands (head, torso, legs, etc.)
 * 5. Build rect zones from the band extents
 */

import type { NpcBodyZone } from '@pixsim7/shared.types';
import type { ZoneDetector, DetectionInput, DetectedZones } from '../types';

// Band definitions as fractions of silhouette height
const BODY_BANDS: { id: string; label: string; from: number; to: number; sensitivity: number; color: string }[] = [
  { id: 'head',      label: 'Head',       from: 0.00, to: 0.12, sensitivity: 0.5,  color: '#A78BFA' },
  { id: 'neck',      label: 'Neck',       from: 0.12, to: 0.16, sensitivity: 0.85, color: '#F9A8D4' },
  { id: 'shoulders', label: 'Shoulders',  from: 0.16, to: 0.22, sensitivity: 0.5,  color: '#93C5FD' },
  { id: 'chest',     label: 'Chest',      from: 0.22, to: 0.36, sensitivity: 0.7,  color: '#FDA4AF' },
  { id: 'stomach',   label: 'Stomach',    from: 0.36, to: 0.48, sensitivity: 0.6,  color: '#FCD34D' },
  { id: 'hips',      label: 'Hips',       from: 0.48, to: 0.56, sensitivity: 0.8,  color: '#F9A8D4' },
  { id: 'upper_legs',label: 'Upper Legs', from: 0.56, to: 0.75, sensitivity: 0.55, color: '#7DD3FC' },
  { id: 'lower_legs',label: 'Lower Legs', from: 0.75, to: 0.90, sensitivity: 0.5,  color: '#67E8F9' },
  { id: 'feet',      label: 'Feet',       from: 0.90, to: 1.00, sensitivity: 0.8,  color: '#FCD34D' },
];

const ALPHA_THRESHOLD = 30; // pixel alpha above this is considered opaque

function analyzeAlpha(image: HTMLImageElement): {
  silhouetteTop: number;
  silhouetteBottom: number;
  scanlines: { left: number; right: number }[];
  width: number;
  height: number;
} {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;

  const scanlines: { left: number; right: number }[] = [];
  let silhouetteTop = height;
  let silhouetteBottom = 0;

  for (let y = 0; y < height; y++) {
    let left = -1;
    let right = -1;
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > ALPHA_THRESHOLD) {
        if (left === -1) left = x;
        right = x;
      }
    }
    scanlines.push({ left, right });
    if (left !== -1) {
      if (y < silhouetteTop) silhouetteTop = y;
      if (y > silhouetteBottom) silhouetteBottom = y;
    }
  }

  return { silhouetteTop, silhouetteBottom, scanlines, width, height };
}

function buildZonesFromBands(analysis: ReturnType<typeof analyzeAlpha>): NpcBodyZone[] {
  const { silhouetteTop, silhouetteBottom, scanlines, width, height } = analysis;
  const silhouetteHeight = silhouetteBottom - silhouetteTop;
  if (silhouetteHeight <= 0) return [];

  const zones: NpcBodyZone[] = [];

  for (const band of BODY_BANDS) {
    const bandTopPx = silhouetteTop + band.from * silhouetteHeight;
    const bandBottomPx = silhouetteTop + band.to * silhouetteHeight;

    // Find the widest extent within this band
    let minLeft = width;
    let maxRight = 0;
    let hasPixels = false;

    for (let y = Math.floor(bandTopPx); y <= Math.min(Math.ceil(bandBottomPx), height - 1); y++) {
      const sl = scanlines[y];
      if (sl.left !== -1) {
        hasPixels = true;
        if (sl.left < minLeft) minLeft = sl.left;
        if (sl.right > maxRight) maxRight = sl.right;
      }
    }

    if (!hasPixels) continue;

    // Convert to percentage coordinates (0-100)
    const x = (minLeft / width) * 100;
    const y = (bandTopPx / height) * 100;
    const w = ((maxRight - minLeft) / width) * 100;
    const h = ((bandBottomPx - bandTopPx) / height) * 100;

    zones.push({
      id: band.id,
      label: band.label,
      shape: 'rect',
      coords: { type: 'rect', x, y, width: w, height: h },
      sensitivity: band.sensitivity,
      highlightColor: band.color,
    });
  }

  return zones;
}

export const heuristicDetector: ZoneDetector = {
  id: 'heuristic',
  name: 'Heuristic (Silhouette)',
  description: 'Alpha-channel silhouette analysis with horizontal band segmentation',
  kind: 'client',

  async detect(input: DetectionInput): Promise<DetectedZones> {
    const analysis = analyzeAlpha(input.image);
    const zones = buildZonesFromBands(analysis);

    return {
      zones,
      confidence: zones.length > 0 ? 0.6 : 0,
      method: 'template',
    };
  },

  isAvailable(): boolean {
    return typeof document !== 'undefined';
  },
};
