/**
 * Prompts API Domain Client
 *
 * Strict OpenAPI-backed client for prompt families, versions, variants,
 * and semantic packs.
 */
import type { PixSimApiClient } from '../client';
import type { ApiComponents, ApiOperations } from '@pixsim7/shared.types';

type Schemas = ApiComponents['schemas'];

// ===== Prompt Types =====

export type PromptFamilySummary = Schemas['PromptFamilyResponse'];
export type PromptFamilyDetail = Schemas['PromptFamilyResponse'];
export type PromptVersionSummary = Schemas['PromptVersionResponse'];
export type PromptVersionDetail = Schemas['PromptVersionResponse'];
export type PromptVariant = Schemas['PromptVariantResponse'];
export type VariantFeedback = Schemas['PromptVariantResponse'];
export type PromptAnalytics =
  ApiOperations['get_family_analytics_api_v1_prompts_families__family_id__analytics_get']['responses'][200]['content']['application/json'];
export type PromptComparison =
  ApiOperations['compare_versions_api_v1_prompts_versions_compare_get']['responses'][200]['content']['application/json'];
export type SemanticPack = Schemas['SemanticPackManifest'];

type ListFamiliesQuery =
  ApiOperations['list_families_api_v1_prompts_families_get']['parameters']['query'];
type ListVersionsQuery =
  ApiOperations['list_versions_api_v1_prompts_families__family_id__versions_get']['parameters']['query'];
type CreatePromptFamilyRequestSchema = Schemas['CreatePromptFamilyRequest'];
type CreatePromptVersionRequestSchema = Schemas['CreatePromptVersionRequest'];
type ListPromptVariantsQuery =
  ApiOperations['list_prompt_variants_for_version_api_v1_prompts_versions__version_id__variants_get']['parameters']['query'];
type CreatePromptVariantRequestSchema = Schemas['CreatePromptVariantRequest'];
type RatePromptVariantRequestSchema = Schemas['RatePromptVariantRequest'];
type CompareVersionsQuery =
  ApiOperations['compare_versions_api_v1_prompts_versions_compare_get']['parameters']['query'];
type ListSemanticPacksQuery =
  ApiOperations['list_semantic_packs_api_v1_semantic_packs_get']['parameters']['query'];
type SemanticPackCreateRequestSchema = Schemas['SemanticPackCreateRequest'];
type DeleteSemanticPackResponse =
  ApiOperations['delete_semantic_pack_api_v1_semantic_packs__pack_id__delete']['responses'][200]['content']['application/json'];

// ===== Prompts API Factory =====

export function createPromptsApi(client: PixSimApiClient) {
  return {
    // ===== Families =====

    async listFamilies(options?: ListFamiliesQuery): Promise<PromptFamilySummary[]> {
      const response = await client.get<readonly PromptFamilySummary[]>('/prompts/families', {
        params: options,
      });
      return [...response];
    },

    async getFamily(familyId: string): Promise<PromptFamilyDetail> {
      return client.get<PromptFamilyDetail>(`/prompts/families/${encodeURIComponent(familyId)}`);
    },

    async createFamily(data: CreatePromptFamilyRequestSchema): Promise<PromptFamilyDetail> {
      return client.post<PromptFamilyDetail>('/prompts/families', data);
    },

    // ===== Versions =====

    async listVersions(
      familyId: string,
      options?: ListVersionsQuery
    ): Promise<PromptVersionSummary[]> {
      const response = await client.get<readonly PromptVersionSummary[]>(
        `/prompts/families/${encodeURIComponent(familyId)}/versions`,
        { params: options }
      );
      return [...response];
    },

    async getVersion(versionId: number | string): Promise<PromptVersionDetail> {
      return client.get<PromptVersionDetail>(
        `/prompts/versions/${encodeURIComponent(String(versionId))}`
      );
    },

    async createVersion(
      familyId: string,
      data: CreatePromptVersionRequestSchema
    ): Promise<PromptVersionDetail> {
      return client.post<PromptVersionDetail>(
        `/prompts/families/${encodeURIComponent(familyId)}/versions`,
        data
      );
    },

    // ===== Variants =====

    async listVariants(
      versionId: number | string,
      options?: ListPromptVariantsQuery
    ): Promise<PromptVariant[]> {
      const response = await client.get<readonly PromptVariant[]>(
        `/prompts/versions/${encodeURIComponent(String(versionId))}/variants`,
        { params: options }
      );
      return [...response];
    },

    async createVariant(data: CreatePromptVariantRequestSchema): Promise<PromptVariant> {
      return client.post<PromptVariant>('/prompts/variants', data);
    },

    async submitVariantFeedback(
      variantId: number,
      feedback: RatePromptVariantRequestSchema
    ): Promise<VariantFeedback> {
      return client.patch<VariantFeedback>(`/prompts/variants/${variantId}`, feedback);
    },

    // ===== Analytics =====

    async getAnalytics(familyId: string): Promise<PromptAnalytics> {
      return client.get<PromptAnalytics>(
        `/prompts/families/${encodeURIComponent(familyId)}/analytics`
      );
    },

    async compareVersions(query: CompareVersionsQuery): Promise<PromptComparison> {
      return client.get<PromptComparison>('/prompts/versions/compare', {
        params: query,
      });
    },

    // ===== Semantic Packs =====

    async listSemanticPacks(options?: ListSemanticPacksQuery): Promise<SemanticPack[]> {
      const response = await client.get<readonly SemanticPack[]>('/semantic-packs', {
        params: options,
      });
      return [...response];
    },

    async getSemanticPack(packId: string): Promise<SemanticPack> {
      return client.get<SemanticPack>(`/semantic-packs/${encodeURIComponent(packId)}`);
    },

    async createOrUpdateSemanticPack(
      data: SemanticPackCreateRequestSchema
    ): Promise<SemanticPack> {
      return client.post<SemanticPack>('/semantic-packs', data);
    },

    async updateSemanticPack(
      packId: string,
      data: SemanticPackCreateRequestSchema
    ): Promise<SemanticPack> {
      if (data.id !== packId) {
        throw new Error(
          `Semantic pack ID mismatch: path "${packId}" does not match payload "${data.id}"`
        );
      }
      return client.post<SemanticPack>('/semantic-packs', data);
    },

    async deleteSemanticPack(packId: string): Promise<DeleteSemanticPackResponse> {
      return client.delete<DeleteSemanticPackResponse>(
        `/semantic-packs/${encodeURIComponent(packId)}`
      );
    },

    async deprecateSemanticPack(packId: string): Promise<SemanticPack> {
      return client.post<SemanticPack>(`/semantic-packs/${encodeURIComponent(packId)}/deprecate`);
    },
  };
}
