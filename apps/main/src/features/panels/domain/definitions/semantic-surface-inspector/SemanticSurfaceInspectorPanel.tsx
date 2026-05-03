/**
 * SemanticSurfaceInspectorPanel - Read-only dev panel that visualizes the
 * prompt/asset semantic surface.
 *
 * v0: coverage matrix only. Concept browser and asset tag tracer are
 * tracked as later checkpoints on the `prompt-semantic-surface` plan.
 */
import { CoverageMatrixView } from './CoverageMatrixView';

export function SemanticSurfaceInspectorPanel() {
  return <CoverageMatrixView />;
}
