import type { PixSimApiClient } from '../client';
import type { DocIndexEntry, DocPageResponse } from '@pixsim7/shared.types';

export interface DocsIndexResponse {
  version: string;
  generatedAt: string | null;
  entries: DocIndexEntry[];
}

export interface DocsSearchResponse {
  query: string;
  results: DocIndexEntry[];
}

export function createDevDocsApi(client: PixSimApiClient) {
  return {
    async getIndex(refresh: boolean = false): Promise<DocsIndexResponse> {
      return client.get<DocsIndexResponse>('/dev/docs/index', {
        params: { refresh },
      });
    },

    async getPage(
      path: string,
      options?: { includeMarkdown?: boolean; refresh?: boolean }
    ): Promise<DocPageResponse> {
      return client.get<DocPageResponse>('/dev/docs/page', {
        params: {
          path,
          include_markdown: options?.includeMarkdown ?? false,
          refresh: options?.refresh ?? false,
        },
      });
    },

    async search(
      query: string,
      options?: { limit?: number; refresh?: boolean }
    ): Promise<DocsSearchResponse> {
      return client.get<DocsSearchResponse>('/dev/docs/search', {
        params: {
          q: query,
          limit: options?.limit,
          refresh: options?.refresh ?? false,
        },
      });
    },
  };
}
