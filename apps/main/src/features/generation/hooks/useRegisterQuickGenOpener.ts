/**
 * useRegisterQuickGenOpener
 *
 * Registers a Quick Gen surface's opener while the mount site is alive, so an
 * "Open With <surface>" picker can reveal it on demand. Pass `null` to register
 * nothing (e.g. a surface that's always-expanded and needs no opener) while
 * keeping hook order stable.
 *
 * The `open` callback should be stable (wrap in useCallback) to avoid
 * re-registration churn.
 */
import { useEffect } from 'react';

import {
  useQuickGenOpenersStore,
  type QuickGenOpener,
} from '../stores/quickGenOpenersStore';

export function useRegisterQuickGenOpener(opener: QuickGenOpener | null): void {
  const register = useQuickGenOpenersStore((s) => s.register);
  const unregister = useQuickGenOpenersStore((s) => s.unregister);

  const widgetId = opener?.widgetId;
  const label = opener?.label;
  const order = opener?.order;
  const open = opener?.open;

  useEffect(() => {
    if (!widgetId || !open) return;
    register({ widgetId, label: label ?? widgetId, open, order });
    return () => unregister(widgetId);
  }, [widgetId, label, order, open, register, unregister]);
}
