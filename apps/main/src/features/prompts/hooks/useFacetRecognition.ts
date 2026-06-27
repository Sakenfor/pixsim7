/**
 * useFacetRecognition — the complete facet-recognition input bundle.
 *
 * Returns `{ facetVocab, savedFacets }` as one unit so every surface (composer,
 * viewers) supplies the full set to the variable-token decoration / `resolveFacet`
 * rather than threading each input separately. Before this existed the read-only
 * viewers passed neither, so registered + vocab facets silently read as unknown
 * there; bundling + a required config field makes that under-supply impossible.
 *
 * Both underlying hooks are module-cached and cross-instance synced, so multiple
 * consumers share a single fetch and a register/unregister anywhere updates every
 * surface live.
 */
import { useMemo } from 'react';

import type { FacetRecognition } from '../lib/facetRecognition';
import { allFacetVocabCategories } from '../lib/promptVariableName';

import { useSavedFacets } from './useSavedFacets';
import { useVocabularies } from './useVocabularies';

export function useFacetRecognition(): FacetRecognition {
  const facetVocab = useVocabularies(useMemo(() => allFacetVocabCategories(), []));
  const { savedFacets } = useSavedFacets();
  return useMemo<FacetRecognition>(() => ({ facetVocab, savedFacets }), [facetVocab, savedFacets]);
}
