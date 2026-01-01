/**
 * Concepts API Client (web wrapper)
 *
 * Delegates to environment-neutral domain client in @pixsim7/api-client.
 * Provides runtime access to ontology concepts.
 *
 * Concept kinds are dynamically discovered from the API.
 * Use getConceptKinds() to list available kinds instead of hardcoding.
 */
import { pixsimClient } from './client';
import { createConceptsApi } from '@pixsim7/api-client/domains';

// Re-export types
export type {
  // Generic types
  ConceptResponse,
  ConceptsListResponse,
  ConceptKindInfo,
  ConceptKindsResponse,
  // Kind types
  ConceptKind,
  KnownConceptKind,
  // Backward-compat role types
  RoleConceptResponse,
  RolesListResponse,
} from '@pixsim7/api-client/domains';

// Re-export utilities
export { KNOWN_KINDS, isKnownConceptKind } from '@pixsim7/api-client/domains';

const conceptsApi = createConceptsApi(pixsimClient);

// Meta endpoint
export const getConceptKinds = conceptsApi.getConceptKinds;

// Generic method
export const getConcepts = conceptsApi.getConcepts;

// Convenience methods
export const getParts = conceptsApi.getParts;
export const getPoses = conceptsApi.getPoses;
export const getInfluenceRegions = conceptsApi.getInfluenceRegions;

// Backward-compat
export const getConceptRoles = conceptsApi.getRoles;
