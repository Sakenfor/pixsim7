/**
 * SmartDockviewBase
 *
 * App-agnostic dockview shell with:
 * - Smart tab visibility
 * - Layout persistence
 * - Optional context propagation to panels
 */

import clsx from "clsx";
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
} from "dockview";
import type { DockviewApi } from "dockview-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import "dockview/dist/styles/dockview.css";
import { useSmartDockview, type UseSmartDockviewOptions, type UseSmartDockviewReturn } from "./useSmartDockview";
import styles from "./SmartDockviewBase.module.css";

export type SmartDockviewLayoutController = Pick<
  UseSmartDockviewReturn,
  "onReady" | "loadLayout" | "resetLayout" | "saveLayout"
>;

export interface SmartDockviewBaseProps<TContext = any> extends UseSmartDockviewOptions {
  /** Components map for dockview panels */
  components: Record<
    string,
    React.ComponentType<IDockviewPanelProps & { context?: TContext; panelId?: string }>
  >;
  /** Shared context passed to all panel components */
  context?: TContext;
  /** Additional class name for the container */
  className?: string;
  /** Optional container props (events, data attributes) */
  containerProps?: React.HTMLAttributes<HTMLDivElement>;
  /** Callback when dockview is ready */
  onReady?: (api: DockviewApi) => void;
  /** Default layout when no saved layout exists */
  defaultLayout?: (api: DockviewApi) => void;
  /** Optional: Custom tab components */
  tabComponents?: Record<string, React.ComponentType<IDockviewPanelHeaderProps>>;
  /** Optional: Default tab component override */
  defaultTabComponent?: React.ComponentType<IDockviewPanelHeaderProps>;
  /** Optional: Custom watermark component */
  watermarkComponent?: React.ComponentType;
  /** Optional: Dockview theme class */
  theme?: string;
  /** Optional: External layout controller */
  layout?: SmartDockviewLayoutController;
}

export function SmartDockviewBase<TContext = any>({
  components,
  context,
  className,
  containerProps,
  onReady,
  defaultLayout,
  tabComponents,
  defaultTabComponent,
  watermarkComponent,
  theme = "dockview-theme-abyss",
  layout,
  storageKey,
  minPanelsForTabs,
  onLayoutChange,
  deprecatedPanels,
}: SmartDockviewBaseProps<TContext>) {
  const apiRef = useRef<DockviewReadyEvent["api"] | null>(null);
  const [isReady, setIsReady] = useState(false);
  const contextRef = useRef<TContext | undefined>(context);
  const internalLayout = useSmartDockview({
    storageKey,
    minPanelsForTabs,
    onLayoutChange,
    deprecatedPanels,
  });
  const layoutController = layout ?? internalLayout;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const defaultLayoutRef = useRef(defaultLayout);
  defaultLayoutRef.current = defaultLayout;

  useEffect(() => {
    const prevContext = contextRef.current;
    contextRef.current = context;
    if (!isReady || !apiRef.current || context === prevContext) {
      return;
    }
    apiRef.current.panels.forEach((panel) => {
      panel.api.updateParameters({});
    });
  }, [context, isReady]);

  const wrappedComponents = useMemo(() => {
    const map: Record<string, React.ComponentType<IDockviewPanelProps>> = {};
    Object.entries(components).forEach(([key, Component]) => {
      const Wrapped = (props: IDockviewPanelProps) => (
        <Component {...props} context={contextRef.current} panelId={key} />
      );
      Wrapped.displayName = `DockviewPanel(${key})`;
      map[key] = Wrapped;
    });
    return map;
  }, [components]);

  const handleReady = useCallback(
    (event: DockviewReadyEvent) => {
      if (apiRef.current === event.api) {
        return;
      }
      apiRef.current = event.api;
      layoutController.onReady(event.api);
      onReadyRef.current?.(event.api);

      const loaded = layoutController.loadLayout ? layoutController.loadLayout() : false;
      if (!loaded && defaultLayoutRef.current) {
        defaultLayoutRef.current(event.api);
      }
      setIsReady(true);
    },
    [layoutController],
  );

  const { className: containerClassName, ...restContainer } = containerProps ?? {};

  return (
    <div className={clsx(styles.smartDockview, className, containerClassName)} {...restContainer}>
      <DockviewReact
        components={wrappedComponents as unknown as Record<string, React.FunctionComponent<IDockviewPanelProps>>}
        tabComponents={tabComponents as unknown as Record<string, React.FunctionComponent<IDockviewPanelHeaderProps>>}
        defaultTabComponent={defaultTabComponent as unknown as React.FunctionComponent<IDockviewPanelHeaderProps>}
        watermarkComponent={watermarkComponent as unknown as React.FunctionComponent}
        onReady={handleReady}
        className={theme}
      />
    </div>
  );
}
