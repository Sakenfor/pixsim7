/**
 * Backend Zone Detector
 *
 * Submits an asset to the backend asset analysis API for zone detection.
 * Uses the canonical analysis contract:
 * - POST /assets/{asset_id}/analyze
 * - GET /analyses/{analysis_id}
 */

import type { ZoneDetector, DetectionInput, DetectedZones } from '@pixsim7/shared.detection.core';
import type { NpcBodyZone } from '@pixsim7/shared.types';

const POLL_INTERVAL = 1000;
const MAX_POLLS = 60;

type AnalysisSubmission = {
  id: number;
  status: string;
};

type AnalysisResult = {
  status: string;
  result?: {
    zones?: Array<{
      id: string;
      label: string;
      shape: 'rect' | 'circle' | 'polygon';
      coords: unknown;
      sensitivity?: number;
      highlightColor?: string;
    }>;
    confidence?: number;
  };
  error_message?: string;
};

async function submitAndPoll(
  assetId: number
): Promise<{ zones: NpcBodyZone[]; confidence: number }> {
  const { pixsimClient } = await import('@lib/api/client');
  const analysis = await pixsimClient.post<AnalysisSubmission>(`/assets/${assetId}/analyze`, {
    params: { mode: 'body_zones' },
  });

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));

    const result = await pixsimClient.get<AnalysisResult>(`/analyses/${analysis.id}`);

    if (result.status === 'completed' && result.result?.zones) {
      const zones: NpcBodyZone[] = result.result.zones.map((zone) => ({
        id: zone.id,
        label: zone.label,
        shape: zone.shape,
        coords: zone.coords,
        sensitivity: zone.sensitivity ?? 0.5,
        highlightColor: zone.highlightColor,
      }));
      return { zones, confidence: result.result.confidence ?? 0.7 };
    }

    if (result.status === 'completed') {
      throw new Error('Backend analysis completed without zone results');
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
  description: 'Server-side zone detection via the asset analysis API (requires asset ID)',
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
      await pixsimClient.get('/analyzers');
      return true;
    } catch {
      return false;
    }
  },
};
