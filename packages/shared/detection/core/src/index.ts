/**
 * @pixsim7/shared.detection.core
 *
 * Zone detection infrastructure: pluggable detector interface, registry,
 * and built-in client-side detectors (heuristic + pose).
 *
 * Apps register additional detectors (e.g. preset, backend) at init time.
 */

export type { ZoneDetector, DetectionInput, DetectedZones } from './types';
export { zoneDetectorRegistry } from './registry';

// Built-in detectors (exported for direct access if needed)
export { heuristicDetector } from './detectors/heuristic';
export { poseDetector } from './detectors/pose';

// Auto-register built-in detectors
import { zoneDetectorRegistry } from './registry';
import { heuristicDetector } from './detectors/heuristic';
import { poseDetector } from './detectors/pose';

zoneDetectorRegistry.register(heuristicDetector);
zoneDetectorRegistry.register(poseDetector);
