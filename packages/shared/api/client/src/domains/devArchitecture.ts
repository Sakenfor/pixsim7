/**
 * Dev Architecture API Domain Client
 *
 * Strict OpenAPI-backed client for architecture introspection endpoints.
 */
import type { PixSimApiClient } from '../client';
import type { ApiComponents } from '@pixsim7/shared.types';

type Schemas = ApiComponents['schemas'];

export type RouteInfo = Schemas['RouteInfo'];
export type CapabilityInfo = Schemas['CapabilityInfo'];
export type SubServiceInfo = Schemas['SubServiceInfo'];
export type ServiceInfo = Schemas['ServiceInfo'];
export type BackendPluginInfo = Schemas['BackendPluginInfo'];
export type ArchitectureMetrics = Schemas['ArchitectureMetrics'];
export type BackendArchitectureResponse = Schemas['BackendArchitectureResponse'];
export type FrontendFeatureEntry = Schemas['FrontendFeatureEntry'];
export type FrontendArchitectureResponse = Schemas['FrontendArchitectureResponse'];
export type UnifiedArchitectureBackend = Schemas['UnifiedArchitectureBackend'];
export type UnifiedArchitectureMetrics = Schemas['UnifiedArchitectureMetrics'];
export type UnifiedArchitectureResponse = Schemas['UnifiedArchitectureResponse'];

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
