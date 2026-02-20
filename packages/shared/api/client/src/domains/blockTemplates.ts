import type { PixSimApiClient } from '../client';
import type {
  BlockTemplateSummary,
  BlockTemplateDetail,
  RollResult,
  SlotPreviewResult,
  TemplateSlot,
  CharacterBinding,
  CharacterBindings,
} from '@pixsim7/shared.types';

export type {
  BlockTemplateSummary,
  BlockTemplateDetail,
  RollResult,
  SlotPreviewResult,
  TemplateSlot,
  CharacterBinding,
  CharacterBindings,
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
  character_bindings?: CharacterBindings;
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
  character_bindings?: CharacterBindings;
}

export interface RollTemplateRequest {
  seed?: number;
  exclude_block_ids?: string[];
  character_bindings?: CharacterBindings;
}

export interface ListTemplatesQuery {
  package_name?: string;
  is_public?: boolean;
  tag?: string;
  limit?: number;
  offset?: number;
}

export interface SearchBlocksQuery {
  role?: string;
  category?: string;
  kind?: string;
  package_name?: string;
  q?: string;
  tags?: string;
  limit?: number;
  offset?: number;
}

export interface BlockTagFacetsQuery {
  role?: string;
  category?: string;
  package_name?: string;
}

export interface PromptBlockResponse {
  id: string;
  block_id: string;
  role: string | null;
  category: string | null;
  kind: string;
  default_intent: string | null;
  text: string;
  tags: Record<string, unknown>;
  complexity_level: string | null;
  package_name: string | null;
  description: string | null;
  word_count: number;
}

export interface BlockRoleSummary {
  role: string | null;
  category: string | null;
  count: number;
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

    async searchBlocks(query?: SearchBlocksQuery): Promise<PromptBlockResponse[]> {
      const response = await client.get<readonly PromptBlockResponse[]>(
        '/block-templates/blocks',
        { params: query },
      );
      return [...response];
    },

    async listBlockRoles(packageName?: string): Promise<BlockRoleSummary[]> {
      const params = packageName ? { package_name: packageName } : undefined;
      const response = await client.get<readonly BlockRoleSummary[]>(
        '/block-templates/blocks/roles',
        { params },
      );
      return [...response];
    },

    async listBlockTagFacets(
      query?: BlockTagFacetsQuery,
    ): Promise<Record<string, string[]>> {
      return client.get<Record<string, string[]>>(
        '/block-templates/blocks/tags',
        { params: query },
      );
    },
  };
}
