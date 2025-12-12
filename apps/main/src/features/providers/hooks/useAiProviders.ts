import { useEffect, useState } from 'react';
import { useApi } from './useApi';

export interface AiProviderInfo {
  provider_id: string;
  name: string;
}

export interface UseAiProvidersState {
  providers: AiProviderInfo[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetch available LLM providers from AI Hub.
 *
 * Uses GET /ai/providers (proxied via /api/v1 base URL).
 */
export function useAiProviders(): UseAiProvidersState {
  const api = useApi();
  const [state, setState] = useState<UseAiProvidersState>({
    providers: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchProviders() {
      try {
        const res = await api.get<{ providers: AiProviderInfo[] }>('/ai/providers');
        if (cancelled) return;
        setState({
          providers: res.providers || [],
          loading: false,
          error: null,
        });
      } catch (e: unknown) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : 'Failed to load AI providers';
        setState({
          providers: [],
          loading: false,
          error: message,
        });
      }
    }

    fetchProviders();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}

