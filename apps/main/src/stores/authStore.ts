/**
 * Auth Store
 *
 * Re-exports the auth store from @pixsim7/shared.auth.
 *
 * IMPORTANT: Import @lib/auth before using this store to ensure
 * the auth service is configured with the API client.
 */

// Ensure auth service is configured before exporting the store
import '../lib/auth/authService';

// Re-export from shared package
export { useAuthStore, type AuthState } from '@pixsim7/shared.auth.core';
