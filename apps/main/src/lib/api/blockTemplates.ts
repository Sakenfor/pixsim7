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
  ReloadContentPacksQuery,
  ReloadContentPacksResponse,
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
export const reloadContentPacks = blockTemplatesApi.reloadContentPacks;
export const searchBlocks = blockTemplatesApi.searchBlocks;
export const listBlockRoles = blockTemplatesApi.listBlockRoles;
export const listBlockTagFacets = blockTemplatesApi.listBlockTagFacets;
