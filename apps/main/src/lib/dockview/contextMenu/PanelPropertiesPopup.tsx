import { Panel } from "@pixsim7/shared.ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";

import { useContextHubState, type CapabilityConsumption } from "@features/contextHub";
import {
  panelRegistry,
  panelSettingsScopeRegistry,
  usePanelInstanceSettingsStore,
  type PanelSettingsScopeMode,
  getScopeMode,
  ScopeModeSelect,
} from "@features/panels";

import type { ContextMenuContext } from "./types";

type PopupPosition = { x: number; y: number };

/**
 * Properties popup payload - context-aware.
 */
interface PropertiesPayload {
  position: PopupPosition;
  contextType: ContextMenuContext;
  /** Panel info (for panel-content, tab contexts) */
  panelId?: string;
  instanceId?: string;
  /** Panel title (for local registries that aren't in the global catalog) */
  panelTitle?: string;
  /** Panel definition from local registry (includes settingScopes, tags, category) */
  panelDefinition?: {
    title?: string;
    settingScopes?: string[];
    scopes?: string[];
    tags?: string[];
    category?: string;
  };
  /** ContextHub hostId for consumption tracking */
  hostId?: string;
  /** Item-specific data */
  data?: Record<string, unknown>;
  /** ContextHub capabilities snapshot */
  capabilities?: Record<string, unknown>;
}

interface PropertiesPopupState {
  isOpen: boolean;
  payload: PropertiesPayload | null;
  open: (payload: PropertiesPayload) => void;
  close: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components -- store export is intentional
export const usePropertiesPopupStore = create<PropertiesPopupState>((set) => ({
  isOpen: false,
  payload: null,
  open: (payload) => set({ isOpen: true, payload }),
  close: () => set({ isOpen: false, payload: null }),
}));


/**
 * Renders a property row with label and value.
 */
function PropertyRow({
  label,
  value,
  mono = false,
  active = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  /** If true, show value in green (for active capabilities) */
  active?: boolean;
}) {
  const valueClass = active
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-neutral-800 dark:text-neutral-200';

  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-neutral-500">{label}</span>
      <span className={`${valueClass} ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}

/**
 * Renders panel-specific properties (scopes, instance info).
 */
function PanelProperties({
  panelId,
  instanceId,
  panelTitle,
  panelDefinition: passedDefinition,
}: {
  panelId?: string;
  instanceId?: string;
  /** Title override for local registries */
  panelTitle?: string;
  /** Panel definition from local registry */
  panelDefinition?: PropertiesPayload['panelDefinition'];
}) {
  const [scopeDefinitions, setScopeDefinitions] = useState(() =>
    panelSettingsScopeRegistry.getAll(),
  );
  const emptyScopes = useMemo(() => ({} as Record<string, PanelSettingsScopeMode>), []);

  // Use passed definition (from local registry) or fall back to global registry
  const panelDefinition = useMemo(() => {
    if (passedDefinition) return passedDefinition;
    if (!panelId) return undefined;
    return panelRegistry.get(panelId);
  }, [passedDefinition, panelId]);

  // Filter scopes to only those that apply to this panel
  const applicableScopes = useMemo(() => {
    if (!panelId || !instanceId) return [];
    const context = {
      panelId,
      instanceId,
      declaredScopes: panelDefinition?.settingScopes ?? panelDefinition?.scopes,
      tags: panelDefinition?.tags,
      category: panelDefinition?.category,
    };
    return scopeDefinitions.filter((scope) => scope.shouldApply?.(context));
  }, [scopeDefinitions, panelId, instanceId, panelDefinition]);

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

  const hasInstance = !!instanceId;
  const scopesAvailable = applicableScopes.length > 0;

  // Use panelTitle from props (for local registries) or fall back to global registry
  const displayTitle = panelTitle ?? panelDefinition?.title ?? panelId ?? 'Unknown';

  return (
    <>
      <div className="space-y-1 mb-4">
        <PropertyRow label="Panel" value={displayTitle} />
        <PropertyRow label="Instance" value={hasInstance ? instanceId : 'none'} mono />
        {panelDefinition?.category && (
          <PropertyRow label="Category" value={panelDefinition.category} />
        )}
      </div>

      {hasInstance && scopesAvailable && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Scope Settings
          </div>
          {applicableScopes.map((scope) => {
            const mode = getScopeMode(instanceScopes, scope);
            return (
              <div
                key={scope.id}
                className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60 px-3 py-2"
              >
                <div>
                  <div className="text-xs font-medium text-neutral-800 dark:text-neutral-100">
                    {scope.label}
                  </div>
                  {scope.description && (
                    <div className="text-[10px] text-neutral-500">
                      {scope.description}
                    </div>
                  )}
                </div>
                <ScopeModeSelect
                  value={mode}
                  onChange={(next) => setScope(instanceId, panelId, scope.id, next)}
                />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/**
 * Check if an object is a simple flat context (all scalar values).
 * Used to decide whether to flatten it for display.
 */
function isSimpleFlatContext(obj: unknown): obj is Record<string, unknown> {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;
  return Object.values(obj).every(
    (v) => v === null || typeof v !== 'object' || Array.isArray(v)
  );
}

/**
 * Format a key for display (e.g., "source_site" -> "Source Site").
 */
function formatKeyLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Extract displayable entries from an object, flattening simple context objects.
 */
function extractDisplayableEntries(
  obj: Record<string, unknown>
): Array<{ key: string; label: string; value: unknown }> {
  const entries: Array<{ key: string; label: string; value: unknown }> = [];

  for (const [key, value] of Object.entries(obj)) {
    // Skip internal keys
    if (key.startsWith('_')) continue;
    // Skip functions
    if (typeof value === 'function') continue;

    // For simple flat objects (like uploadContext), flatten one level
    if (isSimpleFlatContext(value)) {
      for (const [subKey, subValue] of Object.entries(value)) {
        if (subKey.startsWith('_')) continue;
        if (subValue === null || subValue === undefined) continue;
        // Skip nested objects within context
        if (typeof subValue === 'object' && !Array.isArray(subValue)) continue;
        entries.push({
          key: `${key}.${subKey}`,
          label: formatKeyLabel(subKey),
          value: subValue,
        });
      }
      continue;
    }

    // Skip complex nested objects
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) continue;

    entries.push({
      key,
      label: formatKeyLabel(key),
      value,
    });
  }

  return entries;
}

/**
 * Renders generic item properties from data object.
 * Flattens simple nested objects (like uploadContext) one level deep.
 * For asset contexts, unwraps the asset object from the data wrapper.
 */
function ItemProperties({ data, contextType }: { data?: Record<string, unknown>; contextType: string }) {
  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="text-xs text-neutral-500">
        No properties available for this {contextType}.
      </div>
    );
  }

  // For asset contexts, the data structure is { asset: {...}, selection: [...] }
  // Unwrap to display the asset's properties directly
  const targetData =
    (contextType === 'asset' || contextType === 'asset-card') &&
    data.asset &&
    typeof data.asset === 'object' &&
    !Array.isArray(data.asset)
      ? (data.asset as Record<string, unknown>)
      : data;

  const displayableEntries = extractDisplayableEntries(targetData);

  if (displayableEntries.length === 0) {
    return (
      <div className="text-xs text-neutral-500">
        No displayable properties.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {displayableEntries.map(({ key, label, value }) => (
        <PropertyRow
          key={key}
          label={label}
          value={formatValue(value)}
          mono={typeof value === 'string' || typeof value === 'number'}
        />
      ))}
    </div>
  );
}

/**
 * Renders capabilities snapshot.
 */
function CapabilitiesSection({ capabilities }: { capabilities?: Record<string, unknown> }) {
  if (!capabilities || Object.keys(capabilities).length === 0) {
    return null;
  }

  const entries = Object.entries(capabilities).filter(([, value]) => {
    // Only show truthy capabilities or ones with meaningful values
    if (value === false || value === null || value === undefined) return false;
    return true;
  });

  if (entries.length === 0) return null;

  return (
    <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-700">
      <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-2">
        Capabilities
      </div>
      <div className="space-y-1">
        {entries.slice(0, 8).map(([key, value]) => {
          // Consider a capability "active" if it's true or has a meaningful non-false value
          const isActive = value === true || (value !== false && value != null && value !== '');
          return (
            <PropertyRow
              key={key}
              label={key}
              value={formatValue(value)}
              mono
              active={isActive}
            />
          );
        })}
        {entries.length > 8 && (
          <div className="text-[10px] text-neutral-400">
            +{entries.length - 8} more...
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Renders consumption info: what this panel consumes and from which provider.
 * Subscribes to registry changes for live updates.
 */
function ConsumesSection({ hostId }: { hostId?: string }) {
  const hub = useContextHubState();
  const [consumption, setConsumption] = useState<CapabilityConsumption[]>([]);

  useEffect(() => {
    if (!hub || !hostId) {
      setConsumption([]);
      return;
    }

    // Consumption is always recorded at root level
    let root = hub;
    while (root.parent) {
      root = root.parent;
    }

    // Helper to read consumption
    const readConsumption = () => root.registry.getConsumptionForHost(hostId);

    // Initial read
    setConsumption(readConsumption());

    // Subscribe for live updates
    const unsubscribe = root.registry.subscribe(() => {
      setConsumption(readConsumption());
    });

    return unsubscribe;
  }, [hub, hostId]);

  if (!hostId || consumption.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-700">
      <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-2">
        Consumes From
      </div>
      <div className="space-y-1.5">
        {consumption.map((record) => (
          <div
            key={record.key}
            className="flex items-center justify-between gap-2 text-xs"
          >
            <span className="text-neutral-500 truncate">{record.key}</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[10px] truncate max-w-[140px]">
              {record.providerLabel || record.providerId}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  if (value === null || value === undefined) return '-';
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === 'object') return '{...}';
  return String(value);
}

function getContextTitle(contextType: ContextMenuContext): string {
  switch (contextType) {
    case 'tab':
    case 'panel-content':
      return 'Panel';
    case 'node':
      return 'Node';
    case 'edge':
      return 'Edge';
    case 'asset':
    case 'asset-card':
      return 'Asset';
    case 'canvas':
      return 'Canvas';
    case 'background':
      return 'Background';
    case 'group':
      return 'Group';
    default:
      return 'Item';
  }
}

/**
 * Context-aware Properties Popup.
 * Shows different properties based on what was clicked.
 */
export function PropertiesPopup() {
  const { isOpen, payload, close } = usePropertiesPopupStore();
  const popupRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<PopupPosition>({ x: 0, y: 0 });

  useEffect(() => {
    if (!isOpen || !payload?.position) return;
    setCoords(payload.position);

    const raf = requestAnimationFrame(() => {
      if (!popupRef.current) return;
      const rect = popupRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let nextX = payload.position.x;
      let nextY = payload.position.y;

      if (nextX + rect.width > viewportWidth) {
        nextX = viewportWidth - rect.width - 12;
      }
      if (nextY + rect.height > viewportHeight) {
        nextY = viewportHeight - rect.height - 12;
      }

      setCoords({ x: Math.max(12, nextX), y: Math.max(12, nextY) });
    });

    return () => cancelAnimationFrame(raf);
  }, [isOpen, payload?.position]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("[data-properties-popup]")) return;
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

  if (!isOpen || !payload) return null;

  const { contextType, panelId, instanceId, panelTitle, panelDefinition, hostId, data, capabilities } = payload;
  const isPanelContext = contextType === 'tab' || contextType === 'panel-content';
  const title = getContextTitle(contextType);
  const itemName = data?.title ?? data?.name ?? data?.id ?? panelTitle ?? panelId ?? contextType;

  return createPortal(
    <div
      ref={popupRef}
      className="fixed z-[9998]"
      style={{ left: `${coords.x}px`, top: `${coords.y}px` }}
      data-properties-popup
    >
      <Panel className="w-[320px] p-4 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] uppercase text-neutral-400">{title} Properties</div>
            <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate max-w-[240px]">
              {String(itemName)}
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

        {isPanelContext ? (
          <>
            <PanelProperties panelId={panelId} instanceId={instanceId} panelTitle={panelTitle} panelDefinition={panelDefinition} />
            <ConsumesSection hostId={hostId} />
            <CapabilitiesSection capabilities={capabilities} />
          </>
        ) : (
          <ItemProperties data={data as Record<string, unknown>} contextType={contextType} />
        )}
      </Panel>
    </div>,
    document.body,
  );
}

/**
 * @deprecated Use PropertiesPopup instead
 */
export function PanelPropertiesPopup() {
  return <PropertiesPopup />;
}
