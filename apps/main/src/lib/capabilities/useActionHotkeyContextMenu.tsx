import {
  CursorMenu,
  DropdownItem,
  getShortcutSignature,
  Modal,
  parseShortcutString,
  type ParsedShortcut,
  useToast,
} from '@pixsim7/shared.ui';
import {
  useCallback,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';

import { useActionShortcutOverridesStore } from './actionShortcutOverridesStore';

import { useAllActions, type ActionCapability } from './index';

interface HotkeyContextTarget {
  actionId: string;
  label: string;
}

interface HotkeyContextMenuState {
  x: number;
  y: number;
  target: HotkeyContextTarget;
}

interface ActionContextMenuOptions {
  actionId: string;
  label?: string;
  allowAdd?: boolean;
}

interface UseActionHotkeyContextMenuResult {
  canEditHotkeyForAction: (actionId: string, options?: Pick<ActionContextMenuOptions, 'allowAdd'>) => boolean;
  getActionContextMenuHandler: (
    options: ActionContextMenuOptions,
  ) => ((event: MouseEvent<HTMLElement>) => void) | undefined;
  getActionShortcutLabel: (actionId: string) => string | undefined;
  hotkeyContextMenu: ReactNode;
}

const SPECIAL_SHORTCUT_KEYS: Record<string, string> = {
  ' ': 'Space',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  escape: 'Escape',
  enter: 'Enter',
  delete: 'Delete',
};

function formatShortcutKey(key: string): string {
  const normalized = key.toLowerCase();
  if (SPECIAL_SHORTCUT_KEYS[normalized]) {
    return SPECIAL_SHORTCUT_KEYS[normalized];
  }
  if (key.length === 1) {
    return key.toUpperCase();
  }
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function formatShortcut(parsed: ParsedShortcut): string {
  const parts: string[] = [];
  if (parsed.ctrl) parts.push('Ctrl');
  if (parsed.shift) parts.push('Shift');
  if (parsed.alt) parts.push('Alt');
  if (parsed.meta) parts.push('Meta');
  parts.push(formatShortcutKey(parsed.key));
  return parts.join('+');
}

function normalizeShortcut(input: string): string | null {
  const parsed = parseShortcutString(input);
  if (!parsed) {
    return null;
  }
  return formatShortcut(parsed);
}

function displayShortcut(input: string): string {
  const normalized = normalizeShortcut(input);
  return normalized ?? input;
}

function applyShortcutOverride(
  action: ActionCapability,
  shortcutOverrides: Record<string, string>,
): ActionCapability {
  const override = shortcutOverrides[action.id];
  if (override === undefined || override === action.shortcut) {
    return action;
  }
  return { ...action, shortcut: override };
}

export function useActionHotkeyContextMenu(): UseActionHotkeyContextMenuResult {
  const toast = useToast();
  const allActions = useAllActions();
  const shortcutOverrides = useActionShortcutOverridesStore((state) => state.shortcutOverrides);
  const setActionShortcutOverride = useActionShortcutOverridesStore((state) => state.setActionShortcutOverride);
  const clearActionShortcutOverride = useActionShortcutOverridesStore((state) => state.clearActionShortcutOverride);

  const effectiveAllActions = useMemo(
    () => allActions.map((action) => applyShortcutOverride(action, shortcutOverrides)),
    [allActions, shortcutOverrides],
  );

  const effectiveActionMap = useMemo(
    () => new Map(effectiveAllActions.map((action) => [action.id, action])),
    [effectiveAllActions],
  );

  const baseShortcutByActionId = useMemo(() => {
    const map = new Map<string, string | undefined>();
    allActions.forEach((action) => {
      map.set(action.id, action.shortcut);
    });
    return map;
  }, [allActions]);

  const [contextMenu, setContextMenu] = useState<HotkeyContextMenuState | null>(null);
  const [editingTarget, setEditingTarget] = useState<HotkeyContextTarget | null>(null);
  const [shortcutInput, setShortcutInput] = useState('');
  const [shortcutError, setShortcutError] = useState<string | null>(null);

  const canEditHotkeyForAction = useCallback(
    (actionId: string, options?: Pick<ActionContextMenuOptions, 'allowAdd'>) => {
      const action = effectiveActionMap.get(actionId);
      if (!action || action.visibility === 'hidden') {
        return false;
      }
      if (options?.allowAdd) {
        return true;
      }
      const hasShortcut = typeof action.shortcut === 'string' && action.shortcut.trim().length > 0;
      const hasOverride = shortcutOverrides[actionId] !== undefined;
      return hasShortcut || hasOverride;
    },
    [effectiveActionMap, shortcutOverrides],
  );

  const getActionShortcutLabel = useCallback(
    (actionId: string) => {
      const shortcut = effectiveActionMap.get(actionId)?.shortcut;
      if (!shortcut) {
        return undefined;
      }
      return displayShortcut(shortcut);
    },
    [effectiveActionMap],
  );

  const closeEditor = useCallback(() => {
    setEditingTarget(null);
    setShortcutInput('');
    setShortcutError(null);
  }, []);

  const openEditor = useCallback(
    (target: HotkeyContextTarget) => {
      const existingShortcut = effectiveActionMap.get(target.actionId)?.shortcut;
      setEditingTarget(target);
      setShortcutInput(existingShortcut ? displayShortcut(existingShortcut) : '');
      setShortcutError(null);
      setContextMenu(null);
    },
    [effectiveActionMap],
  );

  const resetHotkeyOverride = useCallback(
    (target: HotkeyContextTarget) => {
      clearActionShortcutOverride(target.actionId);
      setContextMenu(null);
      toast.success(`Reset hotkey for "${target.label}".`);
    },
    [clearActionShortcutOverride, toast],
  );

  const saveHotkey = useCallback(() => {
    if (!editingTarget) {
      return;
    }

    const actionId = editingTarget.actionId;
    const trimmed = shortcutInput.trim();
    if (!trimmed) {
      clearActionShortcutOverride(actionId);
      toast.success(`Reset hotkey for "${editingTarget.label}".`);
      closeEditor();
      return;
    }

    const parsed = parseShortcutString(trimmed);
    if (!parsed) {
      setShortcutError('Use format like Ctrl+Shift+K, Alt+R, or G.');
      return;
    }

    const normalizedShortcut = formatShortcut(parsed);
    const signature = getShortcutSignature(parsed);

    const conflictingAction = effectiveAllActions.find((action) => {
      if (action.id === actionId || action.visibility === 'hidden' || !action.shortcut) {
        return false;
      }
      const candidate = parseShortcutString(action.shortcut);
      return candidate ? getShortcutSignature(candidate) === signature : false;
    });

    if (conflictingAction) {
      const conflictShortcut = conflictingAction.shortcut
        ? displayShortcut(conflictingAction.shortcut)
        : 'unknown';
      setShortcutError(`Conflicts with "${conflictingAction.name}" (${conflictShortcut}).`);
      return;
    }

    const baseShortcut = baseShortcutByActionId.get(actionId);
    const normalizedBase = baseShortcut ? normalizeShortcut(baseShortcut) : null;
    if (normalizedBase && normalizedBase === normalizedShortcut) {
      clearActionShortcutOverride(actionId);
      toast.success(`Reset hotkey for "${editingTarget.label}".`);
    } else {
      setActionShortcutOverride(actionId, normalizedShortcut);
      toast.success(`Updated hotkey for "${editingTarget.label}" to ${normalizedShortcut}.`);
    }

    closeEditor();
  }, [
    effectiveAllActions,
    baseShortcutByActionId,
    clearActionShortcutOverride,
    closeEditor,
    editingTarget,
    setActionShortcutOverride,
    shortcutInput,
    toast,
  ]);

  const getActionContextMenuHandler = useCallback(
    (options: ActionContextMenuOptions) => {
      const action = effectiveActionMap.get(options.actionId);
      if (!action) {
        return undefined;
      }

      return (event: MouseEvent<HTMLElement>) => {
        if (!canEditHotkeyForAction(options.actionId, { allowAdd: options.allowAdd })) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          target: {
            actionId: options.actionId,
            label: options.label || action.name || options.actionId,
          },
        });
      };
    },
    [canEditHotkeyForAction, effectiveActionMap],
  );

  const contextActionId = contextMenu?.target.actionId;
  const hasContextOverride = !!(contextActionId && shortcutOverrides[contextActionId] !== undefined);
  const contextActionShortcut = contextActionId
    ? effectiveActionMap.get(contextActionId)?.shortcut
    : undefined;

  const handleEditorKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveHotkey();
      }
    },
    [saveHotkey],
  );

  const hotkeyContextMenu = (
    <>
      {contextMenu && (
        <CursorMenu
          position={contextMenu}
          onClose={() => setContextMenu(null)}
          minWidth="14rem"
        >
          <DropdownItem
            className="text-sm"
            onClick={() => openEditor(contextMenu.target)}
          >
            {contextActionShortcut ? 'Edit Hotkey' : 'Add Hotkey'}
          </DropdownItem>
          {hasContextOverride && (
            <DropdownItem
              className="text-sm"
              onClick={() => resetHotkeyOverride(contextMenu.target)}
            >
              Reset Hotkey
            </DropdownItem>
          )}
        </CursorMenu>
      )}

      <Modal
        isOpen={Boolean(editingTarget)}
        onClose={closeEditor}
        title={editingTarget ? `Hotkey: ${editingTarget.label}` : 'Edit Hotkey'}
        size="sm"
      >
        <div className="space-y-3">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Enter a shortcut like <code>Ctrl+Shift+K</code>, <code>Alt+R</code>, or <code>G</code>.
          </p>
          <input
            type="text"
            value={shortcutInput}
            onChange={(event) => {
              setShortcutInput(event.target.value);
              if (shortcutError) {
                setShortcutError(null);
              }
            }}
            onKeyDown={handleEditorKeyDown}
            placeholder="Ctrl+Shift+K"
            className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
          />
          {shortcutError && (
            <p className="text-sm text-red-600 dark:text-red-400">{shortcutError}</p>
          )}
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Leave empty to reset to default.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={closeEditor}
              className="px-3 py-2 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100 hover:bg-neutral-300 dark:hover:bg-neutral-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveHotkey}
              className="px-3 py-2 rounded bg-accent text-accent-text hover:bg-accent-hover"
            >
              Save
            </button>
          </div>
        </div>
      </Modal>
    </>
  );

  return {
    canEditHotkeyForAction,
    getActionContextMenuHandler,
    getActionShortcutLabel,
    hotkeyContextMenu,
  };
}
