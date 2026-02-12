/**
 * Preset Zone Detector
 *
 * Returns the built-in ANATOMICAL_ZONES preset without any actual image analysis.
 * Useful as a baseline/fallback that works without dependencies.
 */

import type { ZoneDetector, DetectionInput, DetectedZones } from '@pixsim7/shared.detection.core';

import { getFullAnatomicalZones } from '@features/gizmos/lib/bodyMap/zones';

export const presetDetector: ZoneDetector = {
  id: 'preset',
  name: 'Anatomical Preset',
  description: 'Returns built-in anatomical zones (no image analysis)',
  kind: 'client',

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async detect(_input: DetectionInput): Promise<DetectedZones> {
    return {
      zones: getFullAnatomicalZones(),
      confidence: 1,
      method: 'manual',
    };
  },

  isAvailable(): boolean {
    return true;
  },
};
