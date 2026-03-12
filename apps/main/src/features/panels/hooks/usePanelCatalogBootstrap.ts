import { useEffect, useRef, useState } from 'react';

import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { initializePanels } from '../lib/initializePanels';

export interface UsePanelCatalogBootstrapOptions {
  contexts?: readonly string[];
  panelIds?: readonly string[];
  enabled?: boolean;
  onInitializeError?: (error: unknown) => void;
}

export interface UsePanelCatalogBootstrapResult {
  catalogVersion: number;
  initializationComplete: boolean;
}

function normalizeValues(values?: readonly string[]): string[] {
  if (!values || values.length === 0) {
    return [];
  }
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  ).sort();
}

/**
 * Shared bootstrap for panel-catalog consumers:
 * - initializePanels() for requested contexts/panel IDs
 * - panelSelectors subscription for reactive catalog versioning
 */
export function usePanelCatalogBootstrap(
  options: UsePanelCatalogBootstrapOptions = {},
): UsePanelCatalogBootstrapResult {
  const {
    contexts,
    panelIds,
    enabled = true,
    onInitializeError,
  } = options;
  const normalizedContexts = normalizeValues(contexts);
  const normalizedPanelIds = normalizeValues(panelIds);
  const initKey = `contexts:${normalizedContexts.join(',')}|panels:${normalizedPanelIds.join(',')}`;
  const onInitializeErrorRef = useRef(onInitializeError);
  onInitializeErrorRef.current = onInitializeError;
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [initializationComplete, setInitializationComplete] = useState(() => !enabled);

  useEffect(() => {
    if (!enabled) {
      setInitializationComplete(true);
      return;
    }

    let cancelled = false;
    setInitializationComplete(false);
    const bumpVersion = () => {
      if (cancelled) return;
      setCatalogVersion((version) => version + 1);
    };

    const unsubscribe = panelSelectors.subscribe(bumpVersion);

    initializePanels({
      contexts: normalizedContexts,
      panelIds: normalizedPanelIds,
    })
      .catch((error) => {
        onInitializeErrorRef.current?.(error);
      })
      .finally(() => {
        if (cancelled) return;
        setInitializationComplete(true);
        // Ensure one reactive bump even when initialization is a no-op.
        setCatalogVersion((version) => version + 1);
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- initKey covers normalized values
  }, [enabled, initKey]);

  return {
    catalogVersion,
    initializationComplete,
  };
}
