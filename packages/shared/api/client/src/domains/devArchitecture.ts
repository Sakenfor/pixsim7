/**
 * Dev Architecture API Domain Client
 *
 * OpenAPI-backed client for architecture introspection endpoints.
 */
import type { PixSimApiClient } from '../client';
import type {
  ArchitectureGraphMetrics,
  ArchitectureGraphV1,
  ArchitectureMetrics,
  BackendArchitectureResponse,
  FrontendArchitectureResponse,
  Pixsim7BackendMainApiV1DevArchitectureBackendPluginInfo,
  Pixsim7BackendMainApiV1DevArchitectureCapabilityInfo,
  Pixsim7BackendMainApiV1DevArchitectureFrontendFeatureEntry,
  Pixsim7BackendMainApiV1DevArchitectureRouteInfo,
  Pixsim7BackendMainApiV1DevArchitectureServiceInfo,
  Pixsim7BackendMainApiV1DevArchitectureSubServiceInfo,
} from '@pixsim7/shared.api.model';

// Backward-compatible aliases for existing consumers.
export type RouteInfo = Pixsim7BackendMainApiV1DevArchitectureRouteInfo;
export type CapabilityInfo = Pixsim7BackendMainApiV1DevArchitectureCapabilityInfo;
export type SubServiceInfo = Pixsim7BackendMainApiV1DevArchitectureSubServiceInfo;
export type ServiceInfo = Pixsim7BackendMainApiV1DevArchitectureServiceInfo;
export type BackendPluginInfo = Pixsim7BackendMainApiV1DevArchitectureBackendPluginInfo;
export type FrontendFeatureEntry = Pixsim7BackendMainApiV1DevArchitectureFrontendFeatureEntry;
export type UnifiedArchitectureMetrics = ArchitectureGraphMetrics;
export type UnifiedArchitectureResponse = ArchitectureGraphV1;

export type {
  ArchitectureGraphMetrics,
  ArchitectureGraphV1,
  ArchitectureMetrics,
  BackendArchitectureResponse,
  FrontendArchitectureResponse,
};

export function createDevArchitectureApi(client: PixSimApiClient) {
  return {
    async getBackendArchitecture(): Promise<BackendArchitectureResponse> {
      return client.get<BackendArchitectureResponse>('/dev/architecture/map');
    },

    async getFrontendArchitecture(): Promise<FrontendArchitectureResponse> {
      return client.get<FrontendArchitectureResponse>('/dev/architecture/frontend');
    },

    async getArchitectureGraph(): Promise<ArchitectureGraphV1> {
      return client.get<ArchitectureGraphV1>('/dev/architecture/graph');
    },

    async getUnifiedArchitecture(): Promise<ArchitectureGraphV1> {
      // Alias endpoint kept by backend for compatibility.
      return client.get<ArchitectureGraphV1>('/dev/architecture/unified');
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

