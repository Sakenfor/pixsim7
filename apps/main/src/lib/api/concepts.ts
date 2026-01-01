/**
 * Concepts API Client (web wrapper)
 *
 * Delegates to environment-neutral domain client in @pixsim7/api-client.
 * Provides runtime access to ontology concepts including:
 * - Composition roles (role)
 * - Anatomy parts (part)
 * - Body regions (body_region)
 * - Poses (pose)
 * - Influence regions (influence_region)
 */
import { pixsimClient } from './client';
import { createConceptsApi } from '@pixsim7/api-client/domains';

// Re-export types
export type {
  // Generic types
  ConceptResponse,
  ConceptsListResponse,
  ConceptKind,
  // Backward-compat role types
  RoleConceptResponse,
  RolesListResponse,
} from '@pixsim7/api-client/domains';

const conceptsApi = createConceptsApi(pixsimClient);

// Generic method
export const getConcepts = conceptsApi.getConcepts;

// Convenience methods
export const getParts = conceptsApi.getParts;
export const getBodyRegions = conceptsApi.getBodyRegions;
export const getPoses = conceptsApi.getPoses;
export const getInfluenceRegions = conceptsApi.getInfluenceRegions;

// Backward-compat
export const getConceptRoles = conceptsApi.getRoles;
