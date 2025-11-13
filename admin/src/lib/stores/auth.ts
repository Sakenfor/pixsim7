// Auth store for managing authentication state
import { writable } from 'svelte/store';
import { api } from '$lib/api/client';
import { goto } from '$app/navigation';
import { browser } from '$app/environment';

interface AuthState {
  isAuthenticated: boolean;
  user: any | null;
  loading: boolean;
}

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>({
    isAuthenticated: false,
    user: null,
    loading: true
  });

  return {
    subscribe,

    // Initialize auth state from localStorage
    init: () => {
      if (!browser) return;

      const token = api.getToken();
      update(state => ({
        ...state,
        isAuthenticated: !!token,
        loading: false
      }));
    },

    // Login
    login: async (email: string, password: string) => {
      try {
        const data = await api.login(email, password);
        set({
          isAuthenticated: true,
          user: data.user,
          loading: false
        });
        return data;
      } catch (error) {
        set({
          isAuthenticated: false,
          user: null,
          loading: false
        });
        throw error;
      }
    },

    // Logout
    logout: async () => {
      try {
        await api.logout();
      } catch (e) {
        // Ignore logout errors
      }
      set({
        isAuthenticated: false,
        user: null,
        loading: false
      });
      if (browser) {
        goto('/login');
      }
    },

    // Check if route requires auth
    requireAuth: (currentPath: string) => {
      if (!browser) return;

      const token = api.getToken();
      const publicPaths = ['/login'];

      if (!token && !publicPaths.includes(currentPath)) {
        goto('/login');
      }
    }
  };
}

export const authStore = createAuthStore();
