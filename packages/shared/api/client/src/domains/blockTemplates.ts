import type { PixSimApiClient } from '../client';
import type {
  BlockTemplateSummary,
  BlockTemplateDetail,
  RollResult,
  SlotPreviewResult,
  TemplateSlot,
} from '@pixsim7/shared.types';

export type {
  BlockTemplateSummary,
  BlockTemplateDetail,
  RollResult,
  SlotPreviewResult,
  TemplateSlot,
};

export interface CreateTemplateRequest {
  name: string;
  slug: string;
  description?: string;
  slots: TemplateSlot[];
  composition_strategy?: string;
  package_name?: string;
  tags?: string[];
  is_public?: boolean;
  template_metadata?: Record<string, unknown>;
}

export interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  slots?: TemplateSlot[];
  composition_strategy?: string;
  package_name?: string;
  tags?: string[];
  is_public?: boolean;
  template_metadata?: Record<string, unknown>;
}

export interface RollTemplateRequest {
  seed?: number;
  exclude_block_ids?: string[];
}

export interface ListTemplatesQuery {
  package_name?: string;
  is_public?: boolean;
  tag?: string;
  limit?: number;
  offset?: number;
}

export function createBlockTemplatesApi(client: PixSimApiClient) {
  return {
    async listTemplates(query?: ListTemplatesQuery): Promise<BlockTemplateSummary[]> {
      const response = await client.get<readonly BlockTemplateSummary[]>(
        '/block-templates',
        { params: query },
      );
      return [...response];
    },

    async getTemplate(templateId: string): Promise<BlockTemplateDetail> {
      return client.get<BlockTemplateDetail>(
        `/block-templates/${encodeURIComponent(templateId)}`,
      );
    },

    async getTemplateBySlug(slug: string): Promise<BlockTemplateDetail> {
      return client.get<BlockTemplateDetail>(
        `/block-templates/by-slug/${encodeURIComponent(slug)}`,
      );
    },

    async createTemplate(request: CreateTemplateRequest): Promise<BlockTemplateDetail> {
      return client.post<BlockTemplateDetail>('/block-templates', request);
    },

    async updateTemplate(
      templateId: string,
      request: UpdateTemplateRequest,
    ): Promise<BlockTemplateDetail> {
      return client.patch<BlockTemplateDetail>(
        `/block-templates/${encodeURIComponent(templateId)}`,
        request,
      );
    },

    async deleteTemplate(templateId: string): Promise<{ success: boolean }> {
      return client.delete<{ success: boolean }>(
        `/block-templates/${encodeURIComponent(templateId)}`,
      );
    },

    async rollTemplate(
      templateId: string,
      request?: RollTemplateRequest,
    ): Promise<RollResult> {
      return client.post<RollResult>(
        `/block-templates/${encodeURIComponent(templateId)}/roll`,
        request ?? {},
      );
    },

    async previewSlot(
      slot: TemplateSlot,
      limit?: number,
    ): Promise<SlotPreviewResult> {
      return client.post<SlotPreviewResult>('/block-templates/preview-slot', {
        slot,
        limit: limit ?? 5,
      });
    },

    async listBlockPackages(): Promise<string[]> {
      const response = await client.get<readonly string[]>(
        '/block-templates/meta/packages',
      );
      return [...response];
    },
  };
}
