/**
 * Pose Zone Detector
 *
 * Uses MediaPipe Pose Landmarker to detect 33 body landmarks, then builds
 * polygon zones around body-part landmark groups.
 *
 * Lazily initialises the model on first detection. The WASM + model files
 * are loaded from the CDN so there is no bundling cost.
 *
 * Requires `@mediapipe/tasks-vision` as a peer dependency (optional).
 */

import type { NpcBodyZone } from '@pixsim7/shared.types';
import type { ZoneDetector, DetectionInput, DetectedZones } from '../types';

// ============================================================================
// Landmark → Zone Mapping
// ============================================================================

// MediaPipe Pose landmark indices (33 landmarks)
const LANDMARK = {
  NOSE: 0,
  LEFT_EYE_INNER: 1, LEFT_EYE: 2, LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4, RIGHT_EYE: 5, RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7, RIGHT_EAR: 8,
  MOUTH_LEFT: 9, MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_PINKY: 17, RIGHT_PINKY: 18,
  LEFT_INDEX: 19, RIGHT_INDEX: 20,
  LEFT_THUMB: 21, RIGHT_THUMB: 22,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
  LEFT_HEEL: 29, RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31, RIGHT_FOOT_INDEX: 32,
} as const;

interface ZoneTemplate {
  id: string;
  label: string;
  landmarks: number[];
  sensitivity: number;
  color: string;
  pad?: number;
}

const ZONE_TEMPLATES: ZoneTemplate[] = [
  { id: 'head',           label: 'Head',        landmarks: [LANDMARK.LEFT_EAR, LANDMARK.RIGHT_EAR, LANDMARK.NOSE, LANDMARK.LEFT_EYE, LANDMARK.RIGHT_EYE], sensitivity: 0.5,  color: '#A78BFA', pad: 3 },
  { id: 'neck',           label: 'Neck',        landmarks: [LANDMARK.LEFT_SHOULDER, LANDMARK.RIGHT_SHOULDER, LANDMARK.LEFT_EAR, LANDMARK.RIGHT_EAR], sensitivity: 0.85, color: '#F9A8D4' },
  { id: 'chest',          label: 'Chest',       landmarks: [LANDMARK.LEFT_SHOULDER, LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_HIP, LANDMARK.LEFT_HIP], sensitivity: 0.7,  color: '#FDA4AF' },
  { id: 'left_arm',       label: 'Left Arm',    landmarks: [LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_ELBOW, LANDMARK.LEFT_WRIST], sensitivity: 0.45, color: '#86EFAC', pad: 2 },
  { id: 'right_arm',      label: 'Right Arm',   landmarks: [LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_ELBOW, LANDMARK.RIGHT_WRIST], sensitivity: 0.45, color: '#86EFAC', pad: 2 },
  { id: 'left_hand',      label: 'Left Hand',   landmarks: [LANDMARK.LEFT_WRIST, LANDMARK.LEFT_PINKY, LANDMARK.LEFT_INDEX, LANDMARK.LEFT_THUMB], sensitivity: 0.7,  color: '#C4B5FD' },
  { id: 'right_hand',     label: 'Right Hand',  landmarks: [LANDMARK.RIGHT_WRIST, LANDMARK.RIGHT_PINKY, LANDMARK.RIGHT_INDEX, LANDMARK.RIGHT_THUMB], sensitivity: 0.7,  color: '#C4B5FD' },
  { id: 'left_upper_leg', label: 'Left Thigh',  landmarks: [LANDMARK.LEFT_HIP, LANDMARK.LEFT_KNEE], sensitivity: 0.55, color: '#7DD3FC', pad: 3 },
  { id: 'right_upper_leg',label: 'Right Thigh', landmarks: [LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE], sensitivity: 0.55, color: '#7DD3FC', pad: 3 },
  { id: 'left_lower_leg', label: 'Left Calf',   landmarks: [LANDMARK.LEFT_KNEE, LANDMARK.LEFT_ANKLE], sensitivity: 0.5,  color: '#67E8F9', pad: 2 },
  { id: 'right_lower_leg',label: 'Right Calf',  landmarks: [LANDMARK.RIGHT_KNEE, LANDMARK.RIGHT_ANKLE], sensitivity: 0.5,  color: '#67E8F9', pad: 2 },
  { id: 'left_foot',      label: 'Left Foot',   landmarks: [LANDMARK.LEFT_ANKLE, LANDMARK.LEFT_HEEL, LANDMARK.LEFT_FOOT_INDEX], sensitivity: 0.8,  color: '#FCD34D', pad: 2 },
  { id: 'right_foot',     label: 'Right Foot',  landmarks: [LANDMARK.RIGHT_ANKLE, LANDMARK.RIGHT_HEEL, LANDMARK.RIGHT_FOOT_INDEX], sensitivity: 0.8,  color: '#FCD34D', pad: 2 },
];

// ============================================================================
// Lazy Model Loading
// ============================================================================

let poseLandmarkerPromise: Promise<any> | null = null;

async function getPoseLandmarker() {
  if (poseLandmarkerPromise) return poseLandmarkerPromise;

  poseLandmarkerPromise = (async () => {
    const vision = await import('@mediapipe/tasks-vision');
    const { PoseLandmarker, FilesetResolver } = vision;

    const wasmFileset = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
    );

    return PoseLandmarker.createFromOptions(wasmFileset, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      numPoses: 1,
    });
  })();

  return poseLandmarkerPromise;
}

// ============================================================================
// Landmark → Zone Conversion
// ============================================================================

function landmarksToZones(
  landmarks: Array<{ x: number; y: number; z: number; visibility?: number }>,
): { zones: NpcBodyZone[]; landmarkMap: Record<string, { x: number; y: number }> } {
  const zones: NpcBodyZone[] = [];
  const landmarkMap: Record<string, { x: number; y: number }> = {};

  for (const [name, idx] of Object.entries(LANDMARK)) {
    const lm = landmarks[idx];
    if (lm) {
      landmarkMap[name] = { x: lm.x * 100, y: lm.y * 100 };
    }
  }

  for (const tmpl of ZONE_TEMPLATES) {
    const points: { x: number; y: number }[] = [];
    let allVisible = true;

    for (const idx of tmpl.landmarks) {
      const lm = landmarks[idx];
      if (!lm || (lm.visibility !== undefined && lm.visibility < 0.3)) {
        allVisible = false;
        break;
      }
      points.push({ x: lm.x * 100, y: lm.y * 100 });
    }

    if (!allVisible || points.length < 2) continue;

    // For 2-point zones (limbs), create a padded rectangle
    if (points.length === 2) {
      const pad = tmpl.pad ?? 2;
      const [a, b] = points;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.5) continue;

      const nx = (-dy / len) * pad;
      const ny = (dx / len) * pad;

      zones.push({
        id: tmpl.id,
        label: tmpl.label,
        shape: 'polygon',
        coords: {
          type: 'polygon',
          points: [
            { x: a.x + nx, y: a.y + ny },
            { x: b.x + nx, y: b.y + ny },
            { x: b.x - nx, y: b.y - ny },
            { x: a.x - nx, y: a.y - ny },
          ],
        },
        sensitivity: tmpl.sensitivity,
        highlightColor: tmpl.color,
      });
      continue;
    }

    // For multi-point zones, apply padding outward from centroid
    const pad = tmpl.pad ?? 1;
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;

    const paddedPoints = points.map((p) => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      return {
        x: p.x + (dx / dist) * pad,
        y: p.y + (dy / dist) * pad,
      };
    });

    zones.push({
      id: tmpl.id,
      label: tmpl.label,
      shape: 'polygon',
      coords: { type: 'polygon', points: paddedPoints },
      sensitivity: tmpl.sensitivity,
      highlightColor: tmpl.color,
    });
  }

  return { zones, landmarkMap };
}

// ============================================================================
// Detector Export
// ============================================================================

export const poseDetector: ZoneDetector = {
  id: 'pose',
  name: 'Pose (MediaPipe)',
  description: 'ML pose estimation via MediaPipe — detects 33 body landmarks and builds polygon zones',
  kind: 'client',

  async detect(input: DetectionInput): Promise<DetectedZones> {
    const landmarker = await getPoseLandmarker();
    const result = landmarker.detect(input.image);

    if (!result.landmarks || result.landmarks.length === 0) {
      return { zones: [], confidence: 0, method: 'pose' };
    }

    const { zones, landmarkMap } = landmarksToZones(result.landmarks[0]);

    return {
      zones,
      confidence: zones.length > 0 ? 0.85 : 0,
      method: 'pose',
      landmarks: landmarkMap,
    };
  },

  async isAvailable(): Promise<boolean> {
    try {
      await import('@mediapipe/tasks-vision');
      return true;
    } catch {
      return false;
    }
  },
};
