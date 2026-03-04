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
// Architecture Graph v1 Contract
// ===================
// Canonical shape for GET /dev/architecture/graph and /unified.
// Backend mirrors this as Pydantic models in dev_architecture_contract.py.

// --- Source provenance ---

export type FrontendSourceKind = 'generated_artifact' | 'fallback_local';

export interface FrontendSourceInfo {
  kind: FrontendSourceKind;
  path: string;
  generated_at: string | null;
}

export interface BackendSourceInfo {
  kind: 'runtime_introspection';
  generated_at: string;
  build_id?: string;
}

export interface ArchitectureGraphSources {
  frontend: FrontendSourceInfo;
  backend: BackendSourceInfo;
}

// --- Frontend section ---

export interface FrontendFeatureEntry {
  id: string;
  label: string;
  routes?: string[];
  frontend?: string[];
  backend?: string[];
  docs?: string[];
  notes?: string[];
  sources?: string[];
}

export interface ArchitectureGraphFrontend {
  entries: FrontendFeatureEntry[];
}

// --- Backend section ---

export interface RouteInfo {
  path: string;
  methods: string[];
  name: string;
  tags: string[];
}

export interface CapabilityInfo {
  name: string;
  file: string;
  category: string;
  description: string;
  methods: string[];
  permission: string;
  exists: boolean;
  path: string;
}

export interface SubServiceInfo {
  name: string;
  path: string;
  lines: number;
  responsibility: string;
  exists: boolean;
}

export interface ServiceInfo {
  id: string;
  name: string;
  path: string;
  type: string;
  description: string;
  sub_services: SubServiceInfo[];
}

export interface BackendPluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  permissions: string[];
  path: string;
}

export interface ArchitectureGraphBackend {
  routes: RouteInfo[];
  plugins: BackendPluginInfo[];
  services: ServiceInfo[];
  capability_apis: CapabilityInfo[];
}

// --- Links & metrics ---

export type LinkKind = 'frontend_to_backend' | 'plugin_to_capability' | 'service_to_route';
export type LinkStatus = 'resolved' | 'unresolved' | 'stale';

export interface ArchitectureLink {
  from: string;
  to: string;
  kind: LinkKind;
  status: LinkStatus;
}

export interface DriftWarning {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface ArchitectureGraphMetrics {
  total_frontend_features: number;
  total_backend_routes: number;
  drift_warnings: DriftWarning[];
}

// --- Top-level graph ---

export interface ArchitectureGraphV1 {
  version: '1.0.0';
  generated_at: string;
  sources: ArchitectureGraphSources;
  frontend: ArchitectureGraphFrontend;
  backend: ArchitectureGraphBackend;
  links: ArchitectureLink[];
  metrics: ArchitectureGraphMetrics;
}
