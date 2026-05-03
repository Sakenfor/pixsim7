/**
 * Semantic Surface API Client (dev-only).
 *
 * Read-only views over the prompt/asset semantic surface — coverage of
 * primitive packs against ontology namespaces. Backend lives at
 * `pixsim7/backend/main/api/v1/dev_semantic_surface.py`.
 */
import { pixsimClient } from './client';

export type CoverageRowAxis = 'pack' | 'category';
export type CoverageColAxis = 'namespace';

export interface CoverageSample {
  block_id: string;
  text_preview: string;
}

export interface CoverageCell {
  row: string;
  col: string;
  matched_count: number;
  total: number;
  ratio: number;
  samples: CoverageSample[];
}

export interface SkippedPack {
  pack: string;
  error: string;
}

export interface CoverageMatrixResponse {
  row_axis: CoverageRowAxis;
  col_axis: CoverageColAxis;
  rows: string[];
  cols: string[];
  cells: CoverageCell[];
  row_totals: Record<string, number>;
  col_totals: Record<string, number>;
  grand_total: number;
  skipped_packs: SkippedPack[];
}

export interface GetCoverageMatrixParams {
  row_axis?: CoverageRowAxis;
  col_axis?: CoverageColAxis;
}

export async function getSemanticSurfaceCoverageMatrix(
  params: GetCoverageMatrixParams = {},
): Promise<CoverageMatrixResponse> {
  return pixsimClient.get<CoverageMatrixResponse>(
    '/dev/semantic-surface/coverage-matrix',
    { params },
  );
}
