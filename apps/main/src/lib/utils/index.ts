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
export { manuallyRehydrateStore, exposeStoreForDebugging } from './zustandPersist';

// Validation utilities
export * from './validation';
