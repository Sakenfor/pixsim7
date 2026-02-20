/**
 * Dev Architecture API Domain Client
 *
 * Strict OpenAPI-backed client for architecture introspection endpoints.
 */
import type { PixSimApiClient } from '../client';
import type {
  ArchitectureMetrics,
  BackendArchitectureResponse,
  BackendPluginInfo,
  CapabilityInfo,
  FrontendArchitectureResponse,
  FrontendFeatureEntry,
  RouteInfo,
  ServiceInfo,
  SubServiceInfo,
  UnifiedArchitectureBackend,
  UnifiedArchitectureMetrics,
  UnifiedArchitectureResponse,
} from '@pixsim7/shared.api.model';
export type {
  ArchitectureMetrics,
  BackendArchitectureResponse,
  BackendPluginInfo,
  CapabilityInfo,
  FrontendArchitectureResponse,
  FrontendFeatureEntry,
  RouteInfo,
  ServiceInfo,
  SubServiceInfo,
  UnifiedArchitectureBackend,
  UnifiedArchitectureMetrics,
  UnifiedArchitectureResponse,
};

export function createDevArchitectureApi(client: PixSimApiClient) {
  return {
    async getBackendArchitecture(): Promise<BackendArchitectureResponse> {
      return client.get<BackendArchitectureResponse>('/dev/architecture/map');
    },

    async getFrontendArchitecture(): Promise<FrontendArchitectureResponse> {
      return client.get<FrontendArchitectureResponse>('/dev/architecture/frontend');
    },

    async getUnifiedArchitecture(): Promise<UnifiedArchitectureResponse> {
      return client.get<UnifiedArchitectureResponse>('/dev/architecture/unified');
    },

    async getRoutesByTag(): Promise<Record<string, RouteInfo[]>> {
      const arch = await this.getBackendArchitecture();
      const byTag: Record<string, RouteInfo[]> = {};
      const routes = arch.routes ?? [];

      for (const route of routes) {
        const tags = route.tags && route.tags.length > 0 ? route.tags : ['other'];
        for (const tag of tags) {
          if (!byTag[tag]) byTag[tag] = [];
          byTag[tag].push(route);
        }
      }

      return byTag;
    },

    async getMetrics(): Promise<ArchitectureMetrics> {
      const arch = await this.getBackendArchitecture();
      return arch.metrics;
    },
  };
}

