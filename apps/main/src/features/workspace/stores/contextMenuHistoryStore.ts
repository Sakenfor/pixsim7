/**
 * Context Menu History Store
 *
 * Tracks recently used context menu actions per context type.
 * Used by ContextMenuRegistry to surface recent actions at the top of menus.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface HistoryEntry {
  actionId: string;
  contextType: string;
  lastUsedAt: number;
  count: number;
}

const MAX_ENTRIES = 30;

interface ContextMenuHistoryState {
  entries: HistoryEntry[];
}

interface ContextMenuHistoryActions {
  recordUsage: (actionId: string, contextType: string) => void;
  getRecentForContext: (contextType: string, limit?: number) => string[];
}

export const useContextMenuHistoryStore = create<
  ContextMenuHistoryState & ContextMenuHistoryActions
>()(
  persist(
    (set, get) => ({
      entries: [],

      recordUsage: (actionId, contextType) => {
        const now = Date.now();
        const entries = [...get().entries];
        const existing = entries.findIndex(
          (e) => e.actionId === actionId && e.contextType === contextType,
        );

        if (existing >= 0) {
          entries[existing] = {
            ...entries[existing],
            lastUsedAt: now,
            count: entries[existing].count + 1,
          };
        } else {
          entries.push({ actionId, contextType, lastUsedAt: now, count: 1 });
        }

        // Sort by lastUsedAt desc and prune
        entries.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
        set({ entries: entries.slice(0, MAX_ENTRIES) });
      },

      getRecentForContext: (contextType, limit = 3) => {
        return get()
          .entries.filter((e) => e.contextType === contextType)
          .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
          .slice(0, limit)
          .map((e) => e.actionId);
      },
    }),
    {
      name: 'context-menu-history',
    },
  ),
);
