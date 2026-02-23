/**
 * Concepts API Client (web wrapper)
 *
 * Delegates to environment-neutral domain client in @pixsim7/shared.api.client.
 * Provides runtime access to ontology concepts.
 *
 * Concept kinds are dynamically discovered from the API.
 * Use getConceptKinds() to list available kinds instead of hardcoding.
 */
import { createConceptsApi } from '@pixsim7/shared.api.client/domains';

import { pixsimClient } from './client';

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
} from '@pixsim7/shared.api.client/domains';

// Re-export utilities
export { KNOWN_KINDS, isKnownConceptKind } from '@pixsim7/shared.api.client/domains';

const conceptsApi = createConceptsApi(pixsimClient);

// Meta endpoint
export const getConceptKinds = conceptsApi.getConceptKinds;

// Generic method
export const getConcepts = conceptsApi.getConcepts;

// Convenience methods
export const getRoles = conceptsApi.getRoles;
export const getParts = conceptsApi.getParts;
export const getPoses = conceptsApi.getPoses;
export const getInfluenceRegions = conceptsApi.getInfluenceRegions;
