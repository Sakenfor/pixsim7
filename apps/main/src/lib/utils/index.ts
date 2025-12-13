/**
 * Shared utilities and helpers
 */

// Logging
export { initWebLogger, logEvent } from './logging';

// UUID generation
export { generateUUID, generateShortUUID, generatePrefixedUUID } from './uuid';

// Debug flags
export { debugFlags } from './debugFlags';

// Storage
export { createBackendStorage } from './storage';

// Zustand persistence workaround
export { createJSONStorage } from './zustandPersist';

// Time utilities
export * from './time';

// Validation utilities
export * from './validation';

// Polling utilities
export * from './polling';
