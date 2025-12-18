/**
 * API Client - Frontend API for backend services
 */

export { apiClient, BACKEND_BASE, API_BASE_URL } from './client';
export {
  extractErrorMessage,
  isHttpError,
  isNetworkError,
  getErrorStatusCode
} from './errorHandling';

// Domain clients
export * from './game';
export * from './accounts';
export * from './assets';
export * from './automation';
export * from './interactions';
export * from './generations';
export * from './generationOperations';
export * from './analyzers';
export * from './userPreferences';

// Note: __simulate_extend.ts NOT exported (test utility)
