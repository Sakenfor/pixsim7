import type { ComponentType } from 'react';
import { createElement, memo, useEffect, useState } from 'react';

import { moduleRegistry } from './registry';

type PanelLoaderResult = ComponentType<any> | { default: ComponentType<any> };
type PanelLoader = () => Promise<PanelLoaderResult>;

interface LazyPanelComponentOptions {
  initializeModuleId?: string;
}

const resolvedComponentCache = new Map<string, ComponentType<any>>();
const pendingLoadCache = new Map<string, Promise<ComponentType<any>>>();

function isComponentType(value: unknown): value is ComponentType<any> {
  return typeof value === 'function';
}

function resolveLoaderResult(panelId: string, value: PanelLoaderResult): ComponentType<any> {
  if (isComponentType(value)) {
    return value;
  }

  if (value && typeof value === 'object' && isComponentType((value as any).default)) {
    return (value as { default: ComponentType<any> }).default;
  }

  throw new Error(
    `[createLazyPanelComponent] Loader for "${panelId}" must resolve to a React component`
  );
}

async function loadPanelComponent(panelId: string, loader: PanelLoader): Promise<ComponentType<any>> {
  const cached = resolvedComponentCache.get(panelId);
  if (cached) {
    return cached;
  }

  const pending = pendingLoadCache.get(panelId);
  if (pending) {
    return pending;
  }

  const loadPromise = loader()
    .then((moduleValue) => {
      const resolved = resolveLoaderResult(panelId, moduleValue);
      resolvedComponentCache.set(panelId, resolved);
      return resolved;
    })
    .finally(() => {
      pendingLoadCache.delete(panelId);
    });

  pendingLoadCache.set(panelId, loadPromise);
  return loadPromise;
}

function LoadingPanel() {
  return null;
}

/**
 * Creates a Dockview-compatible memoized functional component that lazy-loads
 * the actual panel implementation on first render.
 */
export function createLazyPanelComponent(
  panelId: string,
  loader: PanelLoader,
  options: LazyPanelComponentOptions = {},
): ComponentType<any> {
  const initializeModuleId = options.initializeModuleId;
  const LazyPanel = memo(function LazyPanel(props: any) {
    const [Component, setComponent] = useState<ComponentType<any>>(
      () => resolvedComponentCache.get(panelId) ?? LoadingPanel
    );

    useEffect(() => {
      if (Component !== LoadingPanel) {
        return;
      }

      let active = true;
      void Promise.resolve()
        .then(() => {
          if (!initializeModuleId) {
            return;
          }
          return moduleRegistry.initializeModule(initializeModuleId);
        })
        .then(() => loadPanelComponent(panelId, loader))
        .then((resolvedComponent) => {
          if (!active) {
            return;
          }
          setComponent(() => resolvedComponent);
        })
        .catch((error) => {
          console.error(
            `[createLazyPanelComponent] Failed to load panel component "${panelId}"`,
            error
          );
        });

      return () => {
        active = false;
      };
    }, [Component, initializeModuleId, loader, panelId]);

    return createElement(Component, props);
  });

  LazyPanel.displayName = `LazyPanel(${panelId})`;
  return LazyPanel;
}
