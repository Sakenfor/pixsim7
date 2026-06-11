import { Panel, Popover } from "@pixsim7/shared.ui";
import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";

import {
  getContextHubHostRegistry,
  subscribeContextHubHosts,
  useContextHubState,
  type CapabilityConsumption,
} from "@features/contextHub";
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
    <div className="flex items-start justify-between gap-3 text-xs min-w-0">
      <span className="text-neutral-500 shrink-0">{label}</span>
      <span className={`${valueClass} ${mono ? 'font-mono' : ''} truncate text-right select-text`}>
        {value}
      </span>
    </div>
  );
}

/**
 * Renders a long-text property as a label + copyable block below.
 */
function PropertyBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="text-xs space-y-1">
      <span className="text-neutral-500">{label}</span>
      <pre className="whitespace-pre-wrap break-words text-neutral-800 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800 rounded px-2 py-1.5 font-mono text-[11px] leading-relaxed select-text max-h-[120px] overflow-y-auto">
        {value}
      </pre>
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
    <div className="space-y-1.5">
      {displayableEntries.map(({ key, label, value }) => {
        const strVal = typeof value === 'string' ? value : null;
        const isLongText = strVal != null && (strVal.length > 60 || strVal.includes('\n'));

        if (isLongText) {
          return <PropertyBlock key={key} label={label} value={strVal} />;
        }

        return (
          <PropertyRow
            key={key}
            label={label}
            value={formatValue(value)}
            mono={typeof value === 'string' || typeof value === 'number'}
          />
        );
      })}
    </div>
  );
}

/**
 * Renders capabilities *provided by this panel's own ContextHubHost*.
 *
 * Reads directly from the host registry indexed by `hostId` (panel `instanceId`)
 * — does NOT walk the parent chain, so capabilities inherited from app/root
 * scopes are not falsely attributed to this panel.
 */
function CapabilitiesSection({ hostId }: { hostId?: string }) {
  const [entries, setEntries] = useState<Array<[string, unknown]>>([]);

  useEffect(() => {
    if (!hostId) {
      setEntries([]);
      return;
    }

    const read = (): Array<[string, unknown]> => {
      const registry = getContextHubHostRegistry(hostId);
      if (!registry) return [];
      const keys = registry.getExposedKeys();
      const result: Array<[string, unknown]> = [];
      for (const key of keys) {
        const provider = registry.getBest(key);
        const value = provider ? provider.getValue() : null;
        if (value === false || value === null || value === undefined) continue;
        result.push([key, value]);
      }
      return result.sort(([a], [b]) => a.localeCompare(b));
    };

    setEntries(read());

    const refresh = () => setEntries(read());
    const unsubHosts = subscribeContextHubHosts(refresh);
    const unsubReg = getContextHubHostRegistry(hostId)?.subscribe(refresh);
    return () => {
      unsubHosts();
      unsubReg?.();
    };
  }, [hostId]);

  if (entries.length === 0) return null;

  return (
    <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-700">
      <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-2">
        Provides
      </div>
      <div className="space-y-1">
        {entries.slice(0, 8).map(([key, value]) => {
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

  // The popup opens at a right-click point rather than off a trigger element,
  // so anchor Popover to a zero-size rect at the cursor; it handles portal,
  // click-outside, Escape, and viewport clamping.
  const px = payload?.position?.x;
  const py = payload?.position?.y;
  const anchor = useMemo(
    () => (px != null && py != null ? new DOMRect(px, py, 0, 0) : null),
    [px, py],
  );

  if (!isOpen || !payload || !anchor) return null;

  const { contextType, panelId, instanceId, panelTitle, panelDefinition, hostId, data } = payload;
  const isPanelContext = contextType === 'tab' || contextType === 'panel-content';
  const title = getContextTitle(contextType);
  const itemName = data?.title ?? data?.name ?? data?.id ?? panelTitle ?? panelId ?? contextType;

  return (
    <Popover
      open={isOpen}
      anchor={anchor}
      placement="bottom"
      align="start"
      offset={0}
      viewportMargin={12}
      onClose={close}
    >
      <Panel className="w-[320px] shadow-lg">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase text-neutral-400">{title} Properties</div>
            <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
              {String(itemName)}
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 shrink-0 ml-2"
          >
            Close
          </button>
        </div>

        <div className="px-4 pb-4 max-h-[60vh] overflow-y-auto">
          {isPanelContext ? (
            <>
              <PanelProperties panelId={panelId} instanceId={instanceId} panelTitle={panelTitle} panelDefinition={panelDefinition} />
              <ConsumesSection hostId={hostId} />
              <CapabilitiesSection hostId={hostId} />
            </>
          ) : (
            <ItemProperties data={data as Record<string, unknown>} contextType={contextType} />
          )}
        </div>
      </Panel>
    </Popover>
  );
}

/**
 * @deprecated Use PropertiesPopup instead
 */
export function PanelPropertiesPopup() {
  return <PropertiesPopup />;
}
