/**
 * usePromptInspection Hook
 *
 * Fetches and manages prompt inspection data for assets or generations.
 * Automatically fetches when assetId or jobId changes.
 */

import { useState, useEffect } from 'react';
import { useApi } from './useApi';
import type { PromptBlock } from '@/types/prompts';

export interface UsePromptInspectionOptions {
  assetId?: number;
  jobId?: number;
}

export interface PromptInspectionState {
  prompt: string | null;
  blocks: PromptBlock[];
  loading: boolean;
  error: string | null;
}

export function usePromptInspection(
  options: UsePromptInspectionOptions
): PromptInspectionState {
  const { assetId, jobId } = options;
  const api = useApi();

  const [state, setState] = useState<PromptInspectionState>({
    prompt: null,
    blocks: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    // Reset state if neither ID is provided
    if (!assetId && !jobId) {
      setState({
        prompt: null,
        blocks: [],
        loading: false,
        error: null,
      });
      return;
    }

    // Validation: both IDs provided
    if (assetId && jobId) {
      setState({
        prompt: null,
        blocks: [],
        loading: false,
        error: 'Please provide only one of assetId or jobId, not both',
      });
      return;
    }

    // Fetch prompt inspection
    const fetchPrompt = async () => {
      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
      }));

      try {
        // Build query params
        const params = new URLSearchParams();
        if (assetId) {
          params.set('asset_id', String(assetId));
        }
        if (jobId) {
          params.set('job_id', String(jobId));
        }

        // Call API
        const response = await api.get(`/dev/prompt-inspector?${params.toString()}`);

        setState({
          prompt: response.prompt,
          blocks: response.blocks || [],
          loading: false,
          error: null,
        });
      } catch (err: any) {
        setState({
          prompt: null,
          blocks: [],
          loading: false,
          error: err.message || 'Failed to fetch prompt inspection',
        });
      }
    };

    fetchPrompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId, jobId]);

  return state;
}
