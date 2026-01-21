/**
 * Authentication System
 *
 * Configures and re-exports auth functionality from @pixsim7/shared.auth.
 */

// Export the configured auth service
export * from './authService';

// Re-export auth types from shared package
export type {
  User,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
} from '@pixsim7/shared.auth.core';

// Google auth (app-specific)
export * from './googleAuth';
