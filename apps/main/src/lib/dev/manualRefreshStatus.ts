import { useEffect, useState } from 'react';

const UPDATE_EVENT = 'pixsim:manual-refresh:update-available';

interface UpdatePayload {
  file?: string;
  timestamp?: number;
}

export function isManualRefreshEnabled(): boolean {
  if (!import.meta.env.DEV) {
    return false;
  }

  const flag = String(import.meta.env.VITE_MANUAL_REFRESH ?? '').toLowerCase();
  return flag === '1' || flag === 'true';
}

export function useHasManualRefreshUpdate() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const enabled = isManualRefreshEnabled();

  useEffect(() => {
    if (!enabled || !import.meta.hot) {
      return;
    }

    const onUpdate = (_payload: UpdatePayload) => {
      setHasUpdate(true);
    };

    import.meta.hot.on(UPDATE_EVENT, onUpdate);
    return () => {
      import.meta.hot?.off(UPDATE_EVENT, onUpdate);
    };
  }, [enabled]);

  return { enabled, hasUpdate };
}
