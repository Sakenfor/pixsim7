/**
 * Backend Zone Detector
 *
 * Submits an asset to the backend /analyzers API for zone detection.
 * Uses the existing analysis infrastructure (object_detection analyzer type).
 * Polls for completion and converts the result into NpcBodyZone[].
 */

import type { ZoneDetector, DetectionInput, DetectedZones } from '@pixsim7/shared.detection.core';
import type { NpcBodyZone } from '@pixsim7/shared.types';

const POLL_INTERVAL = 1000;
const MAX_POLLS = 60;

async function submitAndPoll(assetId: number): Promise<{ zones: NpcBodyZone[]; confidence: number }> {
  // Lazy import to avoid circular deps at module level
  const { pixsimClient } = await import('@lib/api/client');

  // Submit analysis
  const analysis = await pixsimClient.post<{ id: number; status: string }>('/assets/analyses', {
    asset_id: assetId,
    analyzer_type: 'object_detection',
    params: { mode: 'body_zones' },
  });

  // Poll for result
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));

    const result = await pixsimClient.get<{
      status: string;
      result?: {
        zones?: Array<{
          id: string;
          label: string;
          shape: 'rect' | 'circle' | 'polygon';
          coords: any;
          sensitivity?: number;
          highlightColor?: string;
        }>;
        confidence?: number;
      };
      error_message?: string;
    }>(`/assets/analyses/${analysis.id}`);

    if (result.status === 'completed' && result.result?.zones) {
      const zones: NpcBodyZone[] = result.result.zones.map((z) => ({
        id: z.id,
        label: z.label,
        shape: z.shape,
        coords: z.coords,
        sensitivity: z.sensitivity ?? 0.5,
        highlightColor: z.highlightColor,
      }));
      return { zones, confidence: result.result.confidence ?? 0.7 };
    }

    if (result.status === 'failed') {
      throw new Error(result.error_message || 'Backend analysis failed');
    }
  }

  throw new Error('Backend analysis timed out');
}

export const backendDetector: ZoneDetector = {
  id: 'backend',
  name: 'Backend Analysis',
  description: 'Server-side zone detection via /analyzers API (requires asset ID)',
  kind: 'server',

  async detect(input: DetectionInput): Promise<DetectedZones> {
    if (!input.assetId) {
      throw new Error('Backend detector requires an assetId');
    }

    const { zones, confidence } = await submitAndPoll(input.assetId);

    return {
      zones,
      confidence,
      method: 'keypoint',
    };
  },

  async isAvailable(): Promise<boolean> {
    try {
      const { pixsimClient } = await import('@lib/api/client');
      // Quick health check — just verify the endpoint is reachable
      await pixsimClient.get('/analyzers');
      return true;
    } catch {
      return false;
    }
  },
};
