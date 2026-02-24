/**
 * Chain Store
 *
 * Zustand store for managing generation chains, draft steps, and execution tracking.
 */
import { create } from 'zustand';

import type {
  ChainSummary,
  ChainDetail,
  ChainStepDefinition,
  ChainExecution,
} from '@lib/api/chains';
import {
  listChains,
  getChain,
  createChain,
  updateChain as apiUpdateChain,
  deleteChain as apiDeleteChain,
  executeChain as apiExecuteChain,
  getExecution,
} from '@lib/api/chains';

interface ChainState {
  // Chain list
  chains: ChainSummary[];
  chainsLoading: boolean;

  // Active chain (full detail)
  activeChain: ChainDetail | null;
  activeLoading: boolean;

  // Draft editing
  draftSteps: ChainStepDefinition[];
  saving: boolean;

  // Execution tracking
  activeExecution: ChainExecution | null;
  executionPolling: boolean;

  // Actions — list
  fetchChains: () => Promise<void>;
  fetchChain: (id: string) => Promise<void>;
  setActiveChain: (chain: ChainDetail | null) => void;

  // Actions — draft steps
  setDraftSteps: (steps: ChainStepDefinition[]) => void;
  addDraftStep: (step: ChainStepDefinition) => void;
  updateDraftStep: (index: number, step: ChainStepDefinition) => void;
  removeDraftStep: (index: number) => void;
  reorderDraftSteps: (fromIndex: number, toIndex: number) => void;

  // Actions — CRUD
  saveChain: (data: {
    name: string;
    description?: string;
    tags?: string[];
    chain_metadata?: Record<string, unknown>;
    is_public?: boolean;
  }) => Promise<ChainDetail>;
  updateChain: (
    id: string,
    data: Record<string, unknown>,
  ) => Promise<ChainDetail | null>;
  deleteChain: (id: string) => Promise<boolean>;

  // Actions — execution
  executeChain: (
    id: string,
    params: {
      provider_id: string;
      initial_asset_id?: number | null;
      default_operation?: string;
      workspace_id?: number | null;
      preferred_account_id?: number | null;
      step_timeout?: number;
    },
  ) => Promise<string | null>;
  pollExecution: (executionId: string) => void;
  stopPolling: () => void;
}

let pollingTimer: ReturnType<typeof setInterval> | null = null;

function createEmptyStep(index: number): ChainStepDefinition {
  return {
    id: `step_${index}`,
    label: `Step ${index + 1}`,
    template_id: '',
    operation: null,
    input_from: null,
    control_overrides: null,
    character_binding_overrides: null,
    guidance: null,
    guidance_inherit: null,
  };
}

export const useChainStore = create<ChainState>((set, get) => ({
  chains: [],
  chainsLoading: false,
  activeChain: null,
  activeLoading: false,
  draftSteps: [],
  saving: false,
  activeExecution: null,
  executionPolling: false,

  fetchChains: async () => {
    set({ chainsLoading: true });
    try {
      const chains = await listChains({ limit: 200 });
      set({ chains });
    } finally {
      set({ chainsLoading: false });
    }
  },

  fetchChain: async (id: string) => {
    set({ activeLoading: true });
    try {
      const chain = await getChain(id);
      set({
        activeChain: chain,
        draftSteps: chain.steps ?? [],
      });
    } finally {
      set({ activeLoading: false });
    }
  },

  setActiveChain: (chain) => {
    set({
      activeChain: chain,
      draftSteps: chain?.steps ?? [],
    });
  },

  setDraftSteps: (steps) => set({ draftSteps: steps }),

  addDraftStep: (step) => {
    const { draftSteps } = get();
    set({ draftSteps: [...draftSteps, step] });
  },

  updateDraftStep: (index, step) => {
    const { draftSteps } = get();
    const next = [...draftSteps];
    next[index] = step;
    set({ draftSteps: next });
  },

  removeDraftStep: (index) => {
    const { draftSteps } = get();
    set({ draftSteps: draftSteps.filter((_, i) => i !== index) });
  },

  reorderDraftSteps: (fromIndex, toIndex) => {
    const { draftSteps } = get();
    if (toIndex < 0 || toIndex >= draftSteps.length) return;
    const next = [...draftSteps];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    set({ draftSteps: next });
  },

  saveChain: async (data) => {
    const { draftSteps } = get();
    set({ saving: true });
    try {
      const chain = await createChain({
        ...data,
        steps: draftSteps,
      });
      void get().fetchChains();
      set({ activeChain: chain });
      return chain;
    } finally {
      set({ saving: false });
    }
  },

  updateChain: async (id, data) => {
    const { draftSteps } = get();
    set({ saving: true });
    try {
      const chain = await apiUpdateChain(id, {
        ...data,
        steps: draftSteps,
      });
      if (chain) {
        set({ activeChain: chain });
        void get().fetchChains();
      }
      return chain;
    } finally {
      set({ saving: false });
    }
  },

  deleteChain: async (id) => {
    try {
      await apiDeleteChain(id);
      set({ activeChain: null, draftSteps: [] });
      void get().fetchChains();
      return true;
    } catch {
      return false;
    }
  },

  executeChain: async (id, params) => {
    try {
      const response = await apiExecuteChain(id, params);
      if (response.execution_id) {
        get().pollExecution(response.execution_id);
        return response.execution_id;
      }
      return null;
    } catch {
      return null;
    }
  },

  pollExecution: (executionId: string) => {
    // Stop any existing polling
    get().stopPolling();

    set({ executionPolling: true });

    const poll = async () => {
      try {
        const execution = await getExecution(executionId);
        set({ activeExecution: execution });

        // Stop polling on terminal states
        if (
          execution.status === 'completed' ||
          execution.status === 'failed' ||
          execution.status === 'cancelled'
        ) {
          get().stopPolling();
        }
      } catch {
        get().stopPolling();
      }
    };

    // Immediate first poll
    void poll();
    pollingTimer = setInterval(poll, 2000);
  },

  stopPolling: () => {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
    set({ executionPolling: false });
  },
}));

export { createEmptyStep };
