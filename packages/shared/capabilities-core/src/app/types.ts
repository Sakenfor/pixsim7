/**
 * App capability types - pure TypeScript, no React/DOM dependencies.
 *
 * These types model app-facing capabilities like features, routes, actions,
 * and exposed state. The UI layer can wrap this registry with hooks.
 */

export type AppCapabilityCategory = string;

export type AppActionVisibility = "always" | "commandPalette" | "contextMenu" | "hidden";

export type AppActionSource = "commandPalette" | "contextMenu" | "shortcut" | "programmatic";

export type AppActionEvent = {
  type?: string;
  [key: string]: unknown;
};

export interface AppActionContext {
  source: AppActionSource;
  event?: AppActionEvent;
  target?: unknown;
}

export type AppActionMenuContext = string;

export interface AppFeatureCapability {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category: AppCapabilityCategory;
  priority?: number;
  routes?: AppRouteCapability[];
  actions?: AppActionCapability[];
  getState?: () => unknown;
  enabled?: () => boolean;
  permissions?: string[];
  metadata?: Record<string, unknown>;
}

export interface AppRouteCapability {
  path: string;
  name: string;
  description?: string;
  icon?: string;
  protected?: boolean;
  showInNav?: boolean;
  featureId?: string;
  params?: Record<string, string>;
}

export interface AppActionCapability {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  shortcut?: string;
  route?: string;
  execute: (ctx?: AppActionContext) => void | Promise<void>;
  visibility?: AppActionVisibility;
  contexts?: AppActionMenuContext[];
  enabled?: () => boolean;
  category?: string;
  featureId: string;
  tags?: string[];
}

export interface AppStateCapability<T = unknown> {
  id: string;
  name: string;
  getValue: () => T;
  subscribe?: (callback: (value: T) => void) => () => void;
  readonly?: boolean;
}

export interface AppCapabilityRegistry {
  registerFeature: (feature: AppFeatureCapability) => void;
  unregisterFeature: (id: string) => void;
  getFeature: (id: string) => AppFeatureCapability | undefined;
  getAllFeatures: () => AppFeatureCapability[];
  getFeaturesByCategory: (category: string) => AppFeatureCapability[];

  registerRoute: (route: AppRouteCapability) => void;
  unregisterRoute: (path: string) => void;
  getRoute: (path: string) => AppRouteCapability | undefined;
  getAllRoutes: () => AppRouteCapability[];
  getRoutesForFeature: (featureId: string) => AppRouteCapability[];

  registerAction: (action: AppActionCapability) => void;
  unregisterAction: (id: string) => void;
  getAction: (id: string) => AppActionCapability | undefined;
  getAllActions: () => AppActionCapability[];
  executeAction: (id: string, ctx?: AppActionContext) => Promise<void>;

  registerState: (state: AppStateCapability) => void;
  unregisterState: (id: string) => void;
  getState: (id: string) => AppStateCapability | undefined;
  getAllStates: () => AppStateCapability[];

  subscribe: (listener: () => void) => () => void;

  /** Clear all registered capabilities (useful for tests or hot reload). */
  clearAll: () => void;
}

export interface AppCapabilityRegistryOptions {
  onDuplicateAction?: (action: AppActionCapability) => void;
  onDuplicateFeature?: (feature: AppFeatureCapability) => void;
  onDuplicateRoute?: (route: AppRouteCapability) => void;
  onDuplicateState?: (state: AppStateCapability) => void;
}
