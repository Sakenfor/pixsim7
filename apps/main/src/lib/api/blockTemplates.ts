/**
 * Block Templates API Client (web wrapper)
 *
 * Delegates to environment-neutral domain client in @pixsim7/shared.api.client.
 */
import { createBlockTemplatesApi } from '@pixsim7/shared.api.client/domains';

import { pixsimClient } from './client';

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
  CreateTemplateRequest,
  UpdateTemplateRequest,
  RollTemplateRequest,
  ListTemplatesQuery,
  SearchBlocksQuery,
  BlockTagFacetsQuery,
  BlockCatalogQuery,
  BlockCatalogRow,
  BlockMatrixQuery,
  BlockMatrixResponse,
  BlockTagDictionaryKey,
  BlockTagDictionaryQuery,
  BlockTagDictionaryResponse,
  BlockTagNormalizeRequest,
  BlockTagNormalizeResponse,
  ReloadContentPacksQuery,
  ReloadContentPacksResponse,
  ContentPackInfo,
  ContentPackInventory,
  PurgeContentPackStats,
  PurgeContentPacksResponse,
  AdoptOrphanedPackQuery,
  AdoptOrphanedPackStats,
  AdoptOrphanedPackResponse,
  ContentPackMatrixManifest,
  ContentPackMatrixPreset,
  TemplateDiagnosticsResponse,
  TemplateSlotDiagnostics,
  TemplateSlotPackageCount,
  PromptBlockResponse,
  BlockRoleSummary,
} from '@pixsim7/shared.api.client/domains';

const blockTemplatesApi = createBlockTemplatesApi(pixsimClient);

export const listTemplates = blockTemplatesApi.listTemplates;
export const getTemplate = blockTemplatesApi.getTemplate;
export const getTemplateDiagnostics = blockTemplatesApi.getTemplateDiagnostics;
export const getTemplateBySlug = blockTemplatesApi.getTemplateBySlug;
export const createTemplate = blockTemplatesApi.createTemplate;
export const updateTemplate = blockTemplatesApi.updateTemplate;
export const deleteTemplate = blockTemplatesApi.deleteTemplate;
export const rollTemplate = blockTemplatesApi.rollTemplate;
export const previewSlot = blockTemplatesApi.previewSlot;
export const listBlockPackages = blockTemplatesApi.listBlockPackages;
export const listContentPacks = blockTemplatesApi.listContentPacks;
export const listContentPackManifests = blockTemplatesApi.listContentPackManifests;
export const reloadContentPacks = blockTemplatesApi.reloadContentPacks;
export const getContentPackInventory = blockTemplatesApi.getContentPackInventory;
export const purgeOrphanedPacks = blockTemplatesApi.purgeOrphanedPacks;
export const adoptOrphanedPack = blockTemplatesApi.adoptOrphanedPack;
export const searchBlocks = blockTemplatesApi.searchBlocks;
export const listBlockRoles = blockTemplatesApi.listBlockRoles;
export const listBlockTagFacets = blockTemplatesApi.listBlockTagFacets;
export const getBlockCatalog = blockTemplatesApi.getBlockCatalog;
export const getBlockMatrix = blockTemplatesApi.getBlockMatrix;
export const getBlockTagDictionary = blockTemplatesApi.getBlockTagDictionary;
export const normalizeBlockTags = blockTemplatesApi.normalizeBlockTags;
