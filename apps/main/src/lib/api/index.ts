/**
 * API Client - Frontend API for backend services
 */

export { apiClient, setApiBaseUrl, getApiBaseUrl } from './client';
export { ApiError, handleApiError, isApiError } from './errorHandling';

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
