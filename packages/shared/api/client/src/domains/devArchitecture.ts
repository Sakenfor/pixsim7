/**
 * Dev Architecture API Domain Client
 *
 * Provides typed access to architecture introspection endpoints.
 * This is the canonical source for application architecture data.
 *
 * Endpoints:
 * - GET /dev/architecture/map - Backend architecture
 * - GET /dev/architecture/frontend - Frontend features
 * - GET /dev/architecture/unified - Combined (recommended)
 */
import type { PixSimApiClient } from '../client';

// ===== Route Types =====

export interface RouteInfo {
  path: string;
  methods: string[];
  name: string;
  tags: string[];
}

// ===== Capability Types =====

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

// ===== Service Types =====

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

// ===== Plugin Types =====

export interface BackendPluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  permissions: string[];
  path: string;
}

// ===== Metrics Types =====

export interface ArchitectureMetrics {
  total_routes: number;
  route_tags: Record<string, number>;
  total_services: number;
  total_sub_services: number;
  avg_sub_service_lines: number;
  total_plugins: number;
  unique_permissions: number;
  permission_usage: Record<string, number>;
  modernized_plugins: number;
}

// ===== Backend Architecture Response =====

export interface BackendArchitectureResponse {
  version: string;
  routes: RouteInfo[];
  capabilities: CapabilityInfo[];
  services: ServiceInfo[];
  plugins: BackendPluginInfo[];
  metrics: ArchitectureMetrics;
}

// ===== Frontend App Map Types =====

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

export interface FrontendArchitectureResponse {
  version: string;
  generatedAt: string | null;
  entries: FrontendFeatureEntry[];
  error?: string;
}

// ===== Unified Architecture Response =====

export interface UnifiedArchitectureMetrics extends ArchitectureMetrics {
  total_frontend_features: number;
  frontend_generated_at: string | null;
}

export interface UnifiedArchitectureResponse {
  version: string;
  backend: {
    routes: RouteInfo[];
    capabilities: CapabilityInfo[];
    services: ServiceInfo[];
    plugins: BackendPluginInfo[];
  };
  frontend: FrontendArchitectureResponse;
  metrics: UnifiedArchitectureMetrics;
}

// ===== Dev Architecture API Factory =====

export function createDevArchitectureApi(client: PixSimApiClient) {
  return {
    /**
     * Get backend architecture map.
     * Returns routes, services, capabilities, and plugins.
     */
    async getBackendArchitecture(): Promise<BackendArchitectureResponse> {
      return client.get<BackendArchitectureResponse>('/dev/architecture/map');
    },

    /**
     * Get frontend architecture (feature modules with appMap metadata).
     * Data is derived from module definitions via generate-app-map.ts.
     */
    async getFrontendArchitecture(): Promise<FrontendArchitectureResponse> {
      return client.get<FrontendArchitectureResponse>('/dev/architecture/frontend');
    },

    /**
     * Get unified architecture combining backend and frontend.
     * This is the CANONICAL endpoint for full application architecture.
     */
    async getUnifiedArchitecture(): Promise<UnifiedArchitectureResponse> {
      return client.get<UnifiedArchitectureResponse>('/dev/architecture/unified');
    },

    // ===== Convenience Methods =====

    /**
     * Get all routes grouped by tag.
     */
    async getRoutesByTag(): Promise<Record<string, RouteInfo[]>> {
      const arch = await this.getBackendArchitecture();
      const byTag: Record<string, RouteInfo[]> = {};

      for (const route of arch.routes) {
        const tags = route.tags.length > 0 ? route.tags : ['other'];
        for (const tag of tags) {
          if (!byTag[tag]) byTag[tag] = [];
          byTag[tag].push(route);
        }
      }

      return byTag;
    },

    /**
     * Get architecture metrics only.
     */
    async getMetrics(): Promise<ArchitectureMetrics> {
      const arch = await this.getBackendArchitecture();
      return arch.metrics;
    },
  };
}
