import { useState } from 'react';
import { apiClient } from '@/lib/api/client';

/**
 * Request to edit a prompt using AI
 */
export interface PromptEditRequest {
  provider_id?: string;
  model_id: string;
  prompt_before: string;
  context?: Record<string, any>;
  generation_id?: number;
}

/**
 * Response from prompt edit operation
 */
export interface PromptEditResponse {
  prompt_after: string;
  model_id: string;
  provider_id: string;
  interaction_id: number | null;
}

/**
 * State for prompt AI edit operations
 */
export interface PromptAiEditState {
  loading: boolean;
  error: string | null;
  promptAfter: string | null;
  interactionId: number | null;
}

/**
 * Hook for AI-assisted prompt editing
 *
 * Provides a `runEdit()` function to send prompts to LLMs for refinement.
 *
 * Example:
 * ```ts
 * const { runEdit, loading, error, promptAfter } = usePromptAiEdit();
 *
 * await runEdit({
 *   model_id: 'gpt-4',
 *   prompt_before: 'A sunset',
 *   generation_id: 123
 * });
 * ```
 */
export function usePromptAiEdit() {
  const [state, setState] = useState<PromptAiEditState>({
    loading: false,
    error: null,
    promptAfter: null,
    interactionId: null,
  });

  /**
   * Run AI prompt edit
   */
  const runEdit = async (request: PromptEditRequest): Promise<PromptEditResponse | null> => {
    setState({
      loading: true,
      error: null,
      promptAfter: null,
      interactionId: null,
    });

    try {
      const response = await apiClient.post<PromptEditResponse>(
        '/api/v1/ai/prompt-edit',
        request
      );

      setState({
        loading: false,
        error: null,
        promptAfter: response.data.prompt_after,
        interactionId: response.data.interaction_id,
      });

      return response.data;
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to edit prompt';
      setState({
        loading: false,
        error: errorMessage,
        promptAfter: null,
        interactionId: null,
      });
      return null;
    }
  };

  /**
   * Clear the edit state
   */
  const clear = () => {
    setState({
      loading: false,
      error: null,
      promptAfter: null,
      interactionId: null,
    });
  };

  return {
    runEdit,
    clear,
    loading: state.loading,
    error: state.error,
    promptAfter: state.promptAfter,
    interactionId: state.interactionId,
  };
}
