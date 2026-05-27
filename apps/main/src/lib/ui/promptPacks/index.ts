/**
 * Shared UI primitives for prompt-pack authoring lifecycle surfaces.
 *
 * Consumed by:
 *   - features/panels/domain/definitions/authoring
 *     (CuePackEditor — drafts editor with embedded Pack + Versions
 *     tabs; the single prompt-pack authoring surface)
 *
 * Each primitive is pure presentation. API calls + state are owned
 * by the parent surface, so new consumers (e.g. a future admin
 * "core pack" method) can pick the bits they need without inheriting
 * any workflow logic.
 */

export {
  StatusBadge,
  type StatusBadgeProps,
  type StatusBadgeVariant,
} from './StatusBadge';
export {
  compileStatusVariant,
  reviewStatusVariant,
  visibilityVariant,
} from './statusVariants';
export { DraftsList, type DraftsListProps } from './DraftsList';
export { VersionsList, type VersionsListProps } from './VersionsList';
export {
  VersionDetailPanel,
  type VersionDetailPanelProps,
} from './VersionDetailPanel';
export {
  useDraftLifecycle,
  type UseDraftLifecycleResult,
  type WorkflowAction,
} from './useDraftLifecycle';
