import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ActionShortcutOverridesState {
  shortcutOverrides: Record<string, string>;
  setActionShortcutOverride: (actionId: string, shortcut: string) => void;
  clearActionShortcutOverride: (actionId: string) => void;
  clearAllActionShortcutOverrides: () => void;
}

export const useActionShortcutOverridesStore = create<ActionShortcutOverridesState>()(
  persist(
    (set, get) => ({
      shortcutOverrides: {},

      setActionShortcutOverride: (actionId, shortcut) => {
        const normalizedActionId = actionId.trim();
        const normalizedShortcut = shortcut.trim();
        if (!normalizedActionId || !normalizedShortcut) {
          return;
        }

        if (get().shortcutOverrides[normalizedActionId] === normalizedShortcut) {
          return;
        }

        set((state) => ({
          shortcutOverrides: {
            ...state.shortcutOverrides,
            [normalizedActionId]: normalizedShortcut,
          },
        }));
      },

      clearActionShortcutOverride: (actionId) => {
        const normalizedActionId = actionId.trim();
        if (!normalizedActionId || !(normalizedActionId in get().shortcutOverrides)) {
          return;
        }

        set((state) => {
          const nextOverrides = { ...state.shortcutOverrides };
          delete nextOverrides[normalizedActionId];
          return { shortcutOverrides: nextOverrides };
        });
      },

      clearAllActionShortcutOverrides: () => set({ shortcutOverrides: {} }),
    }),
    {
      name: 'ps7_action_shortcut_overrides',
      partialize: (state) => ({
        shortcutOverrides: state.shortcutOverrides,
      }),
    },
  ),
);
