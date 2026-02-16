/**
 * Tags API Client
 *
 * Typed API client for /api/v1/tags endpoints.
 */
import { createTagsApi } from '@pixsim7/shared.api.client/domains';

import { pixsimClient } from './client';

export type { TagSummary, TagListResponse, ListTagsQuery } from '@pixsim7/shared.api.client/domains';

const tagsApi = createTagsApi(pixsimClient);

export const listTags = tagsApi.listTags;
