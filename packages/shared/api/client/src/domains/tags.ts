import type { PixSimApiClient } from '../client';
import type {
  TagListResponse,
  TagSummary,
} from '@pixsim7/shared.api.model';
export type {
  TagListResponse,
  TagSummary,
};

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

