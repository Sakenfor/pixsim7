/**
 * Authentication System
 *
 * Configures and re-exports auth functionality from @pixsim7/shared.auth.core.
 */

// Export the configured auth service
export { authService, setAuthStorageProvider, getAuthStorageProvider } from './authService';
export type { AuthStorageProvider } from './authService';

// Re-export auth types from shared package
export type {
  User,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
} from '@pixsim7/shared.auth.core';

// Google auth (app-specific)
export { getGoogleIdTokenViaGIS } from './googleAuth';

// Role helpers
export { CODEGEN_PERMISSION, isAdminUser, hasPermission, canRunCodegen } from './userRoles';

// Ownership helpers
export { useResourceOwnership } from './useResourceOwnership';
export type { ResourceOwnership } from './useResourceOwnership';
