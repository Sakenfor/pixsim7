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

// Hash utilities (from shared.helpers-core)
export { computeFileSha256 } from '@pixsim7/shared.helpers-core';

// Case conversion utilities (from shared.helpers-core)
export { toSnakeCaseDeep, toSnakeCaseKey, toSnakeCaseShallow } from '@pixsim7/shared.helpers-core';

// Zustand persistence workaround
export { manuallyRehydrateStore, exposeStoreForDebugging } from './zustandPersist';

// Time utilities
export * from './time';

// Validation utilities
export * from './validation';

// Polling utilities (from shared.async)
export * from '@pixsim7/shared.async';
