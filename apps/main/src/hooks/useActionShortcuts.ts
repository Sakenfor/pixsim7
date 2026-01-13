/**
 * Action Shortcuts Hook
 *
 * Registers keyboard shortcuts defined on capability actions.
 */

import { parseShortcutString, getShortcutSignature } from '@pixsim7/shared.helpers-core';
import { useMemo } from 'react';

import { useActions } from '@lib/capabilities';

import { useKeyboardShortcuts, type KeyboardShortcut } from './useKeyboardShortcuts';

export function useActionShortcuts(enabled = true) {
  const actions = useActions();

  const shortcuts = useMemo(() => {
    const seen = new Set<string>();
    const result: KeyboardShortcut[] = [];

    actions.forEach((action) => {
      if (!action.shortcut) {
        return;
      }
      if (action.visibility === 'hidden') {
        return;
      }

      const parsed = parseShortcutString(action.shortcut);
      if (!parsed) {
        return;
      }

      const signature = getShortcutSignature(parsed);
      if (seen.has(signature)) {
        return;
      }
      seen.add(signature);

      result.push({
        ...parsed,
        description: action.description ?? action.name,
        preventDefault: false,
        callback: (event) => {
          if (action.enabled && !action.enabled()) {
            return;
          }
          event.preventDefault();
          action.execute({ source: 'shortcut', event });
        },
      });
    });

    return result;
  }, [actions]);

  useKeyboardShortcuts(shortcuts, enabled);

  return shortcuts;
}
