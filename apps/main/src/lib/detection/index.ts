/**
 * Zone Detection — app-level barrel
 *
 * Re-exports the shared detection infrastructure from @pixsim7/shared.detection.core
 * and registers app-specific detectors (preset zones, backend analysis).
 */

// Re-export everything from the shared package
export type { ZoneDetector, DetectionInput, DetectedZones } from '@pixsim7/shared.detection.core';
export { zoneDetectorRegistry } from '@pixsim7/shared.detection.core';

// Register app-specific detectors
import { zoneDetectorRegistry } from '@pixsim7/shared.detection.core';

import { backendDetector } from './detectors/backend';
import { presetDetector } from './detectors/preset';

zoneDetectorRegistry.register(presetDetector);
zoneDetectorRegistry.register(backendDetector);
