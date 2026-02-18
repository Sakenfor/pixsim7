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
  CreateTemplateRequest,
  UpdateTemplateRequest,
  RollTemplateRequest,
  ListTemplatesQuery,
} from '@pixsim7/shared.api.client/domains';

const blockTemplatesApi = createBlockTemplatesApi(pixsimClient);

export const listTemplates = blockTemplatesApi.listTemplates;
export const getTemplate = blockTemplatesApi.getTemplate;
export const getTemplateBySlug = blockTemplatesApi.getTemplateBySlug;
export const createTemplate = blockTemplatesApi.createTemplate;
export const updateTemplate = blockTemplatesApi.updateTemplate;
export const deleteTemplate = blockTemplatesApi.deleteTemplate;
export const rollTemplate = blockTemplatesApi.rollTemplate;
export const previewSlot = blockTemplatesApi.previewSlot;
export const listBlockPackages = blockTemplatesApi.listBlockPackages;
