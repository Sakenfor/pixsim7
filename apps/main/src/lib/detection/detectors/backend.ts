/**
 * Backend Zone Detector
 *
 * Submits an asset to the backend asset analysis API for zone detection.
 * Uses the canonical analysis contract:
 * - POST /assets/{asset_id}/analyze  (body: { analyzer_id, analyzer_intent?, params? })
 * - GET  /analyses/{analysis_id}
 *
 * Use `createBackendDetector({ analyzerId, ... })` to register one detector
 * per analyzer (so the existing detector picker lists them as choices).
 * The default `backendDetector` runs `asset:object-detection`.
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

export interface BackendDetectorOptions {
  /** Unique detector ID for the registry. Defaults to `backend:${analyzerId}`. */
  id?: string;
  /** Display name. Defaults to the analyzer ID. */
  name?: string;
  /** Description shown in the picker. */
  description?: string;
  /** Canonical analyzer to run, e.g. 'asset:object-detection'. */
  analyzerId: string;
  /** Optional analyzer intent (user-preference lookup key). */
  analyzerIntent?: string;
  /** Optional analyze params (e.g. open-vocab labels, score threshold). */
  params?: Record<string, unknown>;
}

async function submitAndPoll(
  assetId: number,
  body: Record<string, unknown>,
): Promise<{ zones: NpcBodyZone[]; confidence: number }> {
  const { pixsimClient } = await import('@lib/api/client');
  const analysis = await pixsimClient.post<AnalysisSubmission>(
    `/assets/${assetId}/analyze`,
    body,
  );

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

function buildAnalyzeBody(options: BackendDetectorOptions): Record<string, unknown> {
  const body: Record<string, unknown> = { analyzer_id: options.analyzerId };
  if (options.analyzerIntent !== undefined) body.analyzer_intent = options.analyzerIntent;
  if (options.params !== undefined) body.params = options.params;
  return body;
}

/**
 * Build a `ZoneDetector` that runs a specific backend analyzer.
 *
 * Register one per analyzer your app wants to expose in the detector picker:
 *
 *     zoneDetectorRegistry.register(
 *       createBackendDetector({
 *         analyzerId: 'asset:object-detection',
 *         name: 'Object Detection (server)',
 *         params: { labels: ['dog', 'person'], score_threshold: 0.3 },
 *       }),
 *     );
 */
export function createBackendDetector(options: BackendDetectorOptions): ZoneDetector {
  const id = options.id ?? `backend:${options.analyzerId}`;
  const name = options.name ?? options.analyzerId;
  const description =
    options.description ??
    `Server-side analyzer ${options.analyzerId} via /assets/{id}/analyze`;
  const body = buildAnalyzeBody(options);

  return {
    id,
    name,
    description,
    kind: 'server',

    async detect(input: DetectionInput): Promise<DetectedZones> {
      if (!input.assetId) {
        throw new Error(`Backend detector '${id}' requires an assetId`);
      }

      const { zones, confidence } = await submitAndPoll(input.assetId, body);

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
}

/** Default backend detector — runs the canonical asset:object-detection analyzer. */
export const backendDetector: ZoneDetector = createBackendDetector({
  id: 'backend',
  name: 'Backend Analysis',
  description: 'Server-side object detection via the asset analysis API (requires asset ID)',
  analyzerId: 'asset:object-detection',
});
