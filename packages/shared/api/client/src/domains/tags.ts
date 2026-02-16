import type { PixSimApiClient } from '../client';
import type { ApiComponents } from '@pixsim7/shared.types';

type Schemas = ApiComponents['schemas'];

export type TagSummary = Schemas['TagSummary'];
export type TagListResponse = Schemas['TagListResponse'];

export interface ListTagsQuery {
  namespace?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export function createTagsApi(client: PixSimApiClient) {
  return {
    async listTags(query?: ListTagsQuery): Promise<TagListResponse> {
      return client.get<TagListResponse>('/tags', {
        params: query,
      });
    },
  };
}
