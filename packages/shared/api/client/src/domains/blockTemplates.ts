import type { PixSimApiClient } from '../client';
import type {
  BlockTemplateSummary,
  BlockTemplateDetail,
  RollResult,
  SlotPreviewResult,
  TemplateSlot,
  CastSpec,
  CharacterBinding,
  CharacterBindings,
  TemplatePreset,
} from '@pixsim7/shared.types';

export type {
  BlockTemplateSummary,
  BlockTemplateDetail,
  RollResult,
  SlotPreviewResult,
  TemplateSlot,
  CastSpec,
  CharacterBinding,
  CharacterBindings,
  TemplatePreset,
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
  slug?: string;
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
  control_values?: Record<string, number | string>;
}

export interface ListTemplatesQuery {
  package_name?: string;
  is_public?: boolean;
  owner_user_id?: number;
  mine?: boolean;
  include_public?: boolean;
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

export interface BlockCatalogQuery {
  role?: string;
  category?: string;
  kind?: string;
  package_name?: string;
  q?: string;
  tags?: string;
  limit?: number;
  offset?: number;
  preview_chars?: number;
}

export interface BlockMatrixQuery {
  row_key: string;
  col_key: string;
  source?: 'primitives';
  composition_role?: string;
  category?: string;
  kind?: string;
  package_name?: string;
  q?: string;
  tags?: string;
  limit?: number;
  sample_per_cell?: number;
  missing_label?: string;
  include_empty?: boolean;
  expected_row_values?: string;
  expected_col_values?: string;
}

export interface PromptBlockResponse {
  id: string;
  block_id: string;
  composition_role: string | null;
  category: string | null;
  kind: string;
  default_intent: string | null;
  text: string;
  tags: Record<string, unknown>;
  capabilities: string[];
  complexity_level: string | null;
  package_name: string | null;
  description: string | null;
  word_count: number;
}

export interface BlockRoleSummary {
  composition_role: string | null;
  category: string | null;
  count: number;
}

export interface BlockCatalogRow {
  id: string;
  block_id: string;
  composition_role: string | null;
  category: string | null;
  package_name: string | null;
  kind: string;
  default_intent: string | null;
  tags: Record<string, unknown>;
  capabilities: string[];
  word_count: number;
  text_preview: string;
}

export interface BlockMatrixCellSample {
  id: string;
  block_id: string;
  package_name: string | null;
  composition_role: string | null;
  category: string | null;
}

export interface BlockMatrixCell {
  row_value: string;
  col_value: string;
  count: number;
  samples: BlockMatrixCellSample[];
}

export interface BlockMatrixResponse {
  row_key: string;
  col_key: string;
  row_values: string[];
  col_values: string[];
  total_blocks: number;
  filters: Record<string, unknown>;
  cells: BlockMatrixCell[];
}

export interface BlockTagDictionaryQuery {
  package_name?: string;
  role?: string;
  category?: string;
  include_values?: boolean;
  include_usage_examples?: boolean;
  include_aliases?: boolean;
  limit_values_per_key?: number;
  limit_examples_per_key?: number;
}

export interface BlockTagDictionaryValueSummary {
  value: string;
  count: number;
  status: string;
}

export interface BlockTagDictionaryAliases {
  keys: string[];
  values: Record<string, string>;
}

export interface BlockTagDictionaryExample {
  id: string;
  block_id: string;
  package_name: string | null;
  role: string | null;
  category: string | null;
}

export interface BlockTagDictionaryKey {
  key: string;
  status: string;
  description?: string | null;
  data_type: string;
  observed_count: number;
  common_values: BlockTagDictionaryValueSummary[];
  aliases?: BlockTagDictionaryAliases | null;
  examples: BlockTagDictionaryExample[];
}

export interface BlockTagDictionaryWarning {
  kind: string;
  message: string;
  keys: string[];
}

export interface BlockTagDictionaryResponse {
  version: number;
  generated_at: string;
  scope: Record<string, unknown>;
  keys: BlockTagDictionaryKey[];
  warnings: BlockTagDictionaryWarning[];
}

export interface BlockTagNormalizeRequest {
  tags: Record<string, unknown>;
  apply_value_aliases?: boolean;
}

export interface BlockTagNormalizeKeyChange {
  from_key: string;
  to_key: string;
}

export interface BlockTagNormalizeValueChange {
  key: string;
  from_value: string;
  to_value: string;
}

export interface BlockTagNormalizeWarning {
  kind: string;
  message: string;
  key?: string | null;
  kept_source?: string | null;
  discarded_source?: string | null;
}

export interface BlockTagNormalizeResponse {
  version: number;
  normalized_tags: Record<string, unknown>;
  changed: boolean;
  key_changes: BlockTagNormalizeKeyChange[];
  value_changes: BlockTagNormalizeValueChange[];
  warnings: BlockTagNormalizeWarning[];
  unknown_keys: string[];
  alias_keys_seen: string[];
}

export interface ReloadContentPacksQuery {
  pack?: string;
  force?: boolean;
  prune?: boolean;
}

export interface ReloadContentPackStats {
  blocks_created?: number;
  blocks_updated?: number;
  blocks_skipped?: number;
  blocks_pruned?: number;
  templates_created?: number;
  templates_updated?: number;
  templates_skipped?: number;
  templates_pruned?: number;
  characters_created?: number;
  characters_updated?: number;
  characters_skipped?: number;
  characters_pruned?: number;
  error?: string;
}

export interface ReloadContentPacksResponse {
  packs_processed: number;
  results: Record<string, ReloadContentPackStats>;
}

export interface ContentPackInfo {
  status: 'active' | 'orphaned' | 'disk_only';
  blocks: number;
  templates: number;
  characters: number;
}

export interface ContentPackMatrixPreset {
  label: string;
  query: Record<string, unknown>;
}

export interface ContentPackMatrixManifest {
  pack_name: string;
  source: string;
  id?: string | null;
  title?: string | null;
  description?: string | null;
  matrix_presets: ContentPackMatrixPreset[];
}

export interface ContentPackInventory {
  disk_packs: string[];
  packs: Record<string, ContentPackInfo>;
  summary: {
    total_packs: number;
    active_packs: number;
    orphaned_packs: number;
    disk_only_packs: number;
    total_orphaned_entities: number;
  };
}

export interface PurgeContentPackStats {
  blocks_purged?: number;
  templates_purged?: number;
  characters_purged?: number;
  error?: string;
}

export interface PurgeContentPacksResponse {
  packs_purged: number;
  results: Record<string, PurgeContentPackStats>;
}

export interface TemplateSlotPackageCount {
  package_name: string | null;
  count: number;
}

export interface TemplateSlotDiagnostics {
  slot_index: number;
  label: string;
  kind?: string | null;
  role?: string | null;
  category?: string | null;
  selection_strategy: string;
  optional: boolean;
  slot_package_name?: string | null;
  template_package_name?: string | null;
  status_hint: 'queryable' | 'reinforcement' | 'audio_cue' | string;
  total_matches: number;
  package_match_counts: TemplateSlotPackageCount[];
  template_package_match_count: number;
  other_package_match_count: number;
  has_matches_outside_template_package: boolean;
  would_need_fallback_if_template_package_restricted: boolean;
  composition_role_hint?: string | null;
  composition_role_confidence?: 'exact' | 'heuristic' | 'ambiguous' | 'unknown' | null;
  composition_role_reason?: string | null;
}

export interface TemplateDiagnosticsResponse {
  success: boolean;
  template: {
    id: string;
    name: string;
    slug: string;
    package_name?: string | null;
    composition_strategy: string;
    slot_count: number;
    slot_schema_version?: number | null;
    source?: Record<string, unknown>;
    dependencies?: Record<string, unknown>;
    updated_at?: string | null;
  };
  slots: TemplateSlotDiagnostics[];
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

    async getTemplateDiagnostics(templateId: string): Promise<TemplateDiagnosticsResponse> {
      return client.get<TemplateDiagnosticsResponse>(
        `/block-templates/${encodeURIComponent(templateId)}/diagnostics`,
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

    async listContentPacks(): Promise<string[]> {
      const response = await client.get<readonly string[]>(
        '/block-templates/meta/content-packs',
      );
      return [...response];
    },

    async listContentPackManifests(pack?: string): Promise<ContentPackMatrixManifest[]> {
      const response = await client.get<readonly ContentPackMatrixManifest[]>(
        '/block-templates/meta/content-packs/manifests',
        { params: pack ? { pack } : undefined },
      );
      return [...response];
    },

    async reloadContentPacks(
      query?: ReloadContentPacksQuery,
    ): Promise<ReloadContentPacksResponse> {
      return client.post<ReloadContentPacksResponse>(
        '/block-templates/meta/content-packs/reload',
        undefined,
        { params: query },
      );
    },

    async getContentPackInventory(): Promise<ContentPackInventory> {
      return client.get<ContentPackInventory>(
        '/block-templates/meta/content-packs/inventory',
      );
    },

    async purgeOrphanedPacks(pack?: string): Promise<PurgeContentPacksResponse> {
      return client.post<PurgeContentPacksResponse>(
        '/block-templates/meta/content-packs/purge',
        undefined,
        { params: pack ? { pack } : undefined },
      );
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

    async getBlockCatalog(query?: BlockCatalogQuery): Promise<BlockCatalogRow[]> {
      const response = await client.get<readonly BlockCatalogRow[]>(
        '/block-templates/meta/blocks/catalog',
        { params: query },
      );
      return [...response];
    },

    async getBlockMatrix(query: BlockMatrixQuery): Promise<BlockMatrixResponse> {
      return client.get<BlockMatrixResponse>(
        '/block-templates/meta/blocks/matrix',
        { params: query },
      );
    },

    async getBlockTagDictionary(
      query?: BlockTagDictionaryQuery,
    ): Promise<BlockTagDictionaryResponse> {
      return client.get<BlockTagDictionaryResponse>(
        '/block-templates/meta/blocks/tag-dictionary',
        { params: query },
      );
    },

    async normalizeBlockTags(
      request: BlockTagNormalizeRequest,
    ): Promise<BlockTagNormalizeResponse> {
      return client.post<BlockTagNormalizeResponse>(
        '/block-templates/meta/blocks/tag-dictionary/normalize',
        request,
      );
    },
  };
}
