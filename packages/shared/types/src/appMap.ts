// ===================
// App Map Metadata (existing)
// ===================

export type AppMapMetadata = {
  docs?: string[];
  backend?: string[];
  frontend?: string[];
  notes?: string[];
};

// ===================
// App Map Snapshot (v2)
// ===================

export interface AppMapFeatureEntry {
  id: string;
  label: string;
  routes?: string[];
  frontend?: string[];
  backend?: string[];
  docs?: string[];
  notes?: string[];
  sources?: string[];
}

export interface AppMapPanelRegistryEntry {
  id: string;
  title: string;
  updatedAt?: string;
  changeNote?: string;
  featureHighlights?: string[];
  category?: string;
  source?: string;
  description?: string;
}

export interface AppMapModuleRegistryEntry {
  id: string;
  name: string;
  updatedAt?: string;
  changeNote?: string;
  featureHighlights?: string[];
  route?: string;
  source?: string;
}

export interface AppMapActionRegistryEntry {
  id: string;
  title: string;
  featureId?: string;
  description?: string;
  icon?: string;
  shortcut?: string;
  route?: string;
  visibility?: string;
  contexts?: string[];
  category?: string;
  tags?: string[];
  sources?: string[];
}

export interface AppMapStoreRegistryEntry {
  name: string;
  feature: string;
  source: string;
}

export interface AppMapHookRegistryEntry {
  name: string;
  feature: string;
  source: string;
}

export type AppMapExternalRegistryFormat =
  | 'json'
  | 'yaml'
  | 'toml'
  | 'ts'
  | 'md'
  | 'other';

export interface AppMapExternalRegistryEntry {
  id: string;
  label: string;
  path: string;
  format: AppMapExternalRegistryFormat;
  owner?: string;
  description?: string;
  last_modified?: string | null;
  exists: boolean;
}

export interface AppMapFrontendRegistries {
  actions: AppMapActionRegistryEntry[];
  panels: AppMapPanelRegistryEntry[];
  modules: AppMapModuleRegistryEntry[];
  stores: AppMapStoreRegistryEntry[];
  hooks: AppMapHookRegistryEntry[];
  external: AppMapExternalRegistryEntry[];
}

export interface AppMapFrontendSource {
  kind: 'generated_artifact' | 'missing';
  path: string;
  generated_at?: string | null;
}

export interface AppMapBackendSource {
  kind: 'runtime_introspection';
  generated_at: string;
}

export interface AppMapExternalRegistrySource {
  kind: 'external_registry_manifest';
  path: string;
}

export interface AppMapSnapshotSources {
  frontend: AppMapFrontendSource;
  backend: AppMapBackendSource;
  external_registries: AppMapExternalRegistrySource;
}

export interface AppMapRouteInfo {
  path: string;
  methods: string[];
  name: string;
  tags?: string[];
}

export interface AppMapCapabilityInfo {
  name: string;
  file: string;
  category: string;
  description: string;
  methods?: string[];
  permission: string;
  exists: boolean;
  path: string;
}

export interface AppMapSubServiceInfo {
  name: string;
  path: string;
  lines: number;
  responsibility: string;
  exists: boolean;
}

export interface AppMapServiceInfo {
  id: string;
  name: string;
  path: string;
  type: string;
  description: string;
  sub_services?: AppMapSubServiceInfo[];
}

export interface AppMapBackendPluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  permissions?: string[];
  path: string;
}

export interface AppMapBackendSnapshot {
  routes: AppMapRouteInfo[];
  plugins: AppMapBackendPluginInfo[];
  services: AppMapServiceInfo[];
  capability_apis: AppMapCapabilityInfo[];
}

export interface AppMapLink {
  from: string;
  to: string;
  kind: 'frontend_to_backend' | 'plugin_to_capability' | 'service_to_route';
  status: 'resolved' | 'unresolved' | 'stale';
}

export interface AppMapDriftWarning {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface AppMapSnapshotMetrics {
  total_frontend_features: number;
  total_actions: number;
  total_backend_routes: number;
  total_panels: number;
  total_modules: number;
  total_stores: number;
  total_hooks: number;
  total_external_registries: number;
  drift_warnings: AppMapDriftWarning[];
}

export interface AppMapFrontendSnapshot {
  entries: AppMapFeatureEntry[];
  registries: AppMapFrontendRegistries;
}

export interface AppMapSnapshotV2 {
  version: '2.0.0';
  generated_at: string;
  sources: AppMapSnapshotSources;
  frontend: AppMapFrontendSnapshot;
  backend: AppMapBackendSnapshot;
  links: AppMapLink[];
  metrics: AppMapSnapshotMetrics;
}
