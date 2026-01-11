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

// Hash utilities
export { computeFileSha256 } from './hash';

// Case conversion utilities
export { toSnakeCaseDeep, toSnakeCaseKey, toSnakeCaseShallow } from './case';

// Zustand persistence workaround
export { manuallyRehydrateStore, exposeStoreForDebugging } from './zustandPersist';

// Time utilities
export * from './time';

// Validation utilities
export * from './validation';

// Polling utilities
export * from './polling';
