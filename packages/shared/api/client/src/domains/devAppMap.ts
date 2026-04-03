/**
 * Dev App Map API Domain Client
 *
 * Client for App Map snapshot v2 endpoints.
 */

import type { AppMapSnapshotV2 } from '@pixsim7/shared.types';
import type { PixSimApiClient } from '../client';

export type { AppMapSnapshotV2 };

export function createDevAppMapApi(client: PixSimApiClient) {
  return {
    async getSnapshot(): Promise<AppMapSnapshotV2> {
      return client.get<AppMapSnapshotV2>('/dev/app-map/snapshot');
    },
  };
}
