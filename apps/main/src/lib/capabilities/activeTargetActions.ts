/**
 * Factory for "active target + per-id handler bundle" capability actions.
 *
 * Use when a feature needs hover/focus-gated keyboard shortcuts that fan
 * out to many instances of the same UI surface (e.g. media cards, prompt
 * cards). Each surface instance publishes its handler bundle at mount,
 * sets itself active on pointer/focus, and a shared set of capability
 * actions resolves the active bundle at shortcut-fire time.
 *
 * Consumers:
 *   - `components/media/mediaCardActionStore.ts` + `mediaCardCapabilityActions.ts`
 *
 * The video scrubber (`scrubberCapabilityActions.ts`) predates this factory
 * and has action-side logic tightly coupled to its marks store; migrating
 * it would require moving those helpers into the store first. Left as-is.
 */

import type { ActionDefinition } from '@pixsim7/shared.types';
import { create, type StoreApi, type UseBoundStore } from 'zustand';


import {
  registerAction,
  registerFeature,
  toActionCapability,
  unregisterAction,
  unregisterFeature,
  type FeatureCapability,
} from './index';

type TargetId = string | number;
type TargetIdKey = string;

const toKey = (id: TargetId): TargetIdKey => String(id);

export interface ActiveTargetStoreState<Bundle> {
  activeId: TargetIdKey | null;
  handlers: Record<TargetIdKey, Bundle>;

  setActive: (id: TargetId | null) => void;
  publishHandlers: (id: TargetId, bundle: Bundle) => void;
  unpublishHandlers: (id: TargetId) => void;
}

export interface ActiveTargetStore<Bundle> {
  /** Zustand hook for component subscriptions. */
  useStore: UseBoundStore<StoreApi<ActiveTargetStoreState<Bundle>>>;
  /** Current active id, or null. */
  getActiveId: () => TargetIdKey | null;
  /** Current active bundle, or undefined. */
  getActiveBundle: () => Bundle | undefined;
}

export function createActiveTargetStore<Bundle>(): ActiveTargetStore<Bundle> {
  const useStore = create<ActiveTargetStoreState<Bundle>>((set) => ({
    activeId: null,
    handlers: {},

    setActive: (id) => set({ activeId: id === null ? null : toKey(id) }),

    publishHandlers: (id, bundle) =>
      set((state) => ({
        handlers: { ...state.handlers, [toKey(id)]: bundle },
      })),

    unpublishHandlers: (id) =>
      set((state) => {
        const key = toKey(id);
        if (!(key in state.handlers)) return state;
        const next = { ...state.handlers };
        delete next[key];
        return { handlers: next };
      }),
  }));

  const getActiveId = () => useStore.getState().activeId;
  const getActiveBundle = () => {
    const { activeId, handlers } = useStore.getState();
    return activeId ? handlers[activeId] : undefined;
  };

  return { useStore, getActiveId, getActiveBundle };
}

/**
 * One action that dispatches through an active-target bundle. `execute`
 * receives the live bundle so it can pick/compose handlers and pass per-
 * action args. If `requires` is set, the action is auto-gated on
 * `typeof bundle[requires] === 'function'`.
 */
export interface ActiveTargetAction<Bundle> {
  id: string;
  title: string;
  description?: string;
  shortcut: string;
  requires?: keyof Bundle;
  execute: (bundle: Bundle) => void | Promise<void>;
}

export interface ActiveTargetActionsConfig<Bundle> {
  featureId: string;
  feature: Omit<FeatureCapability, 'id' | 'actions'>;
  store: Pick<ActiveTargetStore<Bundle>, 'getActiveId' | 'getActiveBundle'>;
  actions: ActiveTargetAction<Bundle>[];
}

export interface ActiveTargetActionsHandle {
  register: () => void;
  unregister: () => void;
}

export function registerActiveTargetActions<Bundle>(
  config: ActiveTargetActionsConfig<Bundle>,
): ActiveTargetActionsHandle {
  const { featureId, feature, store, actions } = config;

  const defs: ActionDefinition[] = actions.map((a) => ({
    id: a.id,
    featureId,
    title: a.title,
    description: a.description ?? a.title,
    shortcut: a.shortcut,
    execute: () => {
      const bundle = store.getActiveBundle();
      if (!bundle) return;
      if (a.requires && typeof (bundle as Record<string, unknown>)[a.requires as string] !== 'function') return;
      void a.execute(bundle);
    },
    enabled: () => {
      if (store.getActiveId() === null) return false;
      const bundle = store.getActiveBundle();
      if (!bundle) return false;
      if (!a.requires) return true;
      return typeof (bundle as Record<string, unknown>)[a.requires as string] === 'function';
    },
  }));

  let registered = false;

  return {
    register: () => {
      if (registered) return;
      registerFeature({ id: featureId, ...feature });
      for (const def of defs) registerAction(toActionCapability(def));
      registered = true;
    },
    unregister: () => {
      if (!registered) return;
      for (const def of defs) unregisterAction(def.id);
      unregisterFeature(featureId);
      registered = false;
    },
  };
}
