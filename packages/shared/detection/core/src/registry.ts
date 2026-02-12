/**
 * Zone Detector Registry
 *
 * Singleton registry for pluggable zone detection strategies.
 * Apps import this and register their own (or built-in) detectors.
 */

import type { ZoneDetector } from './types';

class ZoneDetectorRegistry {
  private detectors = new Map<string, ZoneDetector>();

  register(detector: ZoneDetector): void {
    this.detectors.set(detector.id, detector);
  }

  unregister(id: string): void {
    this.detectors.delete(id);
  }

  get(id: string): ZoneDetector | undefined {
    return this.detectors.get(id);
  }

  list(): ZoneDetector[] {
    return Array.from(this.detectors.values());
  }

  has(id: string): boolean {
    return this.detectors.has(id);
  }
}

export const zoneDetectorRegistry = new ZoneDetectorRegistry();
