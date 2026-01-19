/**
 * Auth Store
 *
 * Zustand-based reactive state for authentication.
 * Provides user state, loading state, and actions for auth operations.
 */
import { create } from 'zustand';
import type { User } from './types';
import { authService } from './authService';

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  initialize: () => Promise<void>;
  logout: () => void;
}

/**
 * Auth store with user state and auth actions.
 *
 * Usage:
 * ```tsx
 * import { useAuthStore } from '@pixsim7/shared.auth';
 *
 * function MyComponent() {
 *   const { user, isAuthenticated, isLoading, initialize, logout } = useAuthStore();
 *
 *   useEffect(() => {
 *     initialize();
 *   }, [initialize]);
 *
 *   if (isLoading) return <Loading />;
 *   if (!isAuthenticated) return <Redirect to="/login" />;
 *   return <Dashboard user={user} />;
 * }
 * ```
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) => set({ user, isAuthenticated: !!user }),

  setLoading: (loading) => set({ isLoading: loading }),

  initialize: async () => {
    set({ isLoading: true });

    try {
      if (authService.isAuthenticated()) {
        const user = await authService.getCurrentUser();
        set({ user, isAuthenticated: true });
      }
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      authService.logout();
    } finally {
      set({ isLoading: false });
    }
  },

  logout: () => {
    authService.logout();
    set({ user: null, isAuthenticated: false });
  },
}));
