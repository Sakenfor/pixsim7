import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { Panel } from "@pixsim7/shared.ui";
import {
  panelRegistry,
  panelSettingsScopeRegistry,
  usePanelInstanceSettingsStore,
  type PanelSettingsScopeMode,
} from "@features/panels";

type PopupPosition = { x: number; y: number };

interface PanelPropertiesPopupState {
  isOpen: boolean;
  position: PopupPosition | null;
  panelId?: string;
  instanceId?: string;
  open: (payload: {
    position: PopupPosition;
    panelId: string;
    instanceId?: string;
  }) => void;
  close: () => void;
}

export const usePanelPropertiesPopupStore = create<PanelPropertiesPopupState>((set) => ({
  isOpen: false,
  position: null,
  panelId: undefined,
  instanceId: undefined,
  open: ({ position, panelId, instanceId }) =>
    set({
      isOpen: true,
      position,
      panelId,
      instanceId,
    }),
  close: () =>
    set({
      isOpen: false,
      position: null,
      panelId: undefined,
      instanceId: undefined,
    }),
}));

export function PanelPropertiesPopup() {
  const { isOpen, position, panelId, instanceId, close } =
    usePanelPropertiesPopupStore();
  const popupRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<PopupPosition>({ x: 0, y: 0 });
  const [scopeDefinitions, setScopeDefinitions] = useState(() =>
    panelSettingsScopeRegistry.getAll(),
  );
  const emptyScopes = useMemo(() => ({} as Record<string, PanelSettingsScopeMode>), []);

  const panelDefinition = useMemo(() => {
    if (!panelId) return undefined;
    return panelRegistry.get(panelId);
  }, [panelId]);

  const instanceScopes = usePanelInstanceSettingsStore((state) => {
    if (!instanceId) return emptyScopes;
    return state.instances[instanceId]?.scopes ?? emptyScopes;
  });
  const setScope = usePanelInstanceSettingsStore((state) => state.setScope);

  useEffect(() => {
    return panelSettingsScopeRegistry.subscribe(() => {
      setScopeDefinitions(panelSettingsScopeRegistry.getAll());
    });
  }, []);

  useEffect(() => {
    if (!isOpen || !position) return;
    setCoords(position);

    const raf = requestAnimationFrame(() => {
      if (!popupRef.current) return;
      const rect = popupRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let nextX = position.x;
      let nextY = position.y;

      if (nextX + rect.width > viewportWidth) {
        nextX = viewportWidth - rect.width - 12;
      }
      if (nextY + rect.height > viewportHeight) {
        nextY = viewportHeight - rect.height - 12;
      }

      setCoords({ x: Math.max(12, nextX), y: Math.max(12, nextY) });
    });

    return () => cancelAnimationFrame(raf);
  }, [isOpen, position]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("[data-panel-properties]")) return;
      close();
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 100);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [isOpen, close]);

  if (!isOpen || !position) return null;

  const title = panelDefinition?.title ?? panelId ?? "Panel";
  const hasInstance = !!instanceId;
  const scopesAvailable = scopeDefinitions.length > 0;

  return createPortal(
    <div
      ref={popupRef}
      className="fixed z-[9998]"
      style={{ left: `${coords.x}px`, top: `${coords.y}px` }}
      data-panel-properties
    >
      <Panel className="w-[320px] p-4 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs uppercase text-neutral-400">Properties</div>
            <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {title}
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            Close
          </button>
        </div>

        <div className="text-xs text-neutral-500 mb-4">
          Instance:{" "}
          <span className="font-mono text-neutral-700 dark:text-neutral-300">
            {hasInstance ? instanceId : "none"}
          </span>
        </div>

        {!hasInstance ? (
          <div className="text-sm text-neutral-500">
            No instance data available for this panel.
          </div>
        ) : !scopesAvailable ? (
          <div className="text-sm text-neutral-500">
            No instance-scoped settings registered.
          </div>
        ) : (
          <div className="space-y-3">
            {scopeDefinitions.map((scope) => {
              const mode =
                instanceScopes?.[scope.id] ?? scope.defaultMode ?? "global";
              return (
                <div
                  key={scope.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60 px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
                      {scope.label}
                    </div>
                    {scope.description && (
                      <div className="text-[11px] text-neutral-500">
                        {scope.description}
                      </div>
                    )}
                  </div>
                  <select
                    value={mode}
                    onChange={(event) =>
                      setScope(
                        instanceId,
                        panelId,
                        scope.id,
                        event.target.value as PanelSettingsScopeMode,
                      )
                    }
                    className="text-xs border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1 bg-white dark:bg-neutral-900"
                  >
                    <option value="global">Global</option>
                    <option value="local">Local</option>
                  </select>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>,
    document.body,
  );
}
