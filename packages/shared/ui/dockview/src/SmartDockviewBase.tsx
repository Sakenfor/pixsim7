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
  /** Optional: Component rendered in the right side of each group header */
  rightHeaderActionsComponent?: React.FunctionComponent<any>;
  /** Optional: Component rendered in the left side of each group header (before tabs) */
  leftHeaderActionsComponent?: React.FunctionComponent<any>;
  /** Disable dockview's native floating groups (use when providing custom floating panel system) */
  disableFloatingGroups?: boolean;
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
  rightHeaderActionsComponent,
  leftHeaderActionsComponent,
  storageKey,
  minPanelsForTabs,
  onLayoutChange,
  deprecatedPanels,
  disableFloatingGroups,
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

  // Keep a ref to the latest components map so stable wrappers can look up
  // the current implementation without changing their own identity.
  const componentsRef = useRef(components);
  componentsRef.current = components;

  // Cache of stable wrapper components keyed by panel ID.
  // Each wrapper has a fixed identity (React won't unmount/remount it)
  // and delegates to componentsRef.current[key] at render time.
  const stableWrappersRef = useRef<Record<string, React.ComponentType<IDockviewPanelProps>>>({});

  const wrappedComponents = useMemo(() => {
    const map: Record<string, React.ComponentType<IDockviewPanelProps>> = {};
    const wrappers = stableWrappersRef.current;

    for (const key of Object.keys(components)) {
      if (!wrappers[key]) {
        // Create a stable wrapper once per panel ID
        const StablePanel = (props: IDockviewPanelProps) => {
          const Component = componentsRef.current[key];
          if (!Component) return null;
          return <Component {...props} context={contextRef.current} panelId={key} />;
        };
        StablePanel.displayName = `DockviewPanel(${key})`;
        wrappers[key] = StablePanel;
      }
      map[key] = wrappers[key];
    }

    // Note: stale entries in `wrappers` for removed panel IDs are intentionally
    // kept. They're harmless (never used) and deleting them would create new
    // wrapper identities if the panel reappears, causing DockviewReact to
    // unmount/remount the panel content.

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
        rightHeaderActionsComponent={rightHeaderActionsComponent}
        leftHeaderActionsComponent={leftHeaderActionsComponent}
        onReady={handleReady}
        className={theme}
        disableFloatingGroups={disableFloatingGroups}
      />
    </div>
  );
}
