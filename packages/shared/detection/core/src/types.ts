/**
 * Zone Detection Types
 *
 * Pluggable interface for zone detection strategies.
 * Detectors take an image and return NpcBodyZone[] suitable for overlay rendering.
 */

import type { NpcBodyZone, ZoneTrackingMethod } from '@pixsim7/shared.types';

// ============================================================================
// Detection Input / Output
// ============================================================================

export interface DetectionInput {
  /** Loaded image element (for client-side detectors) */
  image: HTMLImageElement;
  /** Asset ID (for backend detectors) */
  assetId?: number;
  /** Asset URL (for backend detectors) */
  assetUrl?: string;
}

export interface DetectedZones {
  /** Detected zones in percentage-based coordinates (0-100) */
  zones: NpcBodyZone[];
  /** Overall detection confidence (0-1) */
  confidence?: number;
  /** Which tracking method was used */
  method: ZoneTrackingMethod;
  /** Optional landmark positions (pose detectors) */
  landmarks?: Record<string, { x: number; y: number }>;
}

// ============================================================================
// Zone Detector Interface
// ============================================================================

export interface ZoneDetector {
  /** Unique detector ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Brief description of the detection method */
  description: string;
  /** Whether detection runs client-side or on the server */
  kind: 'client' | 'server';
  /** Run detection on the given input */
  detect(input: DetectionInput): Promise<DetectedZones>;
  /** Whether this detector is currently available (e.g. model loaded, backend reachable) */
  isAvailable(): boolean | Promise<boolean>;
}
