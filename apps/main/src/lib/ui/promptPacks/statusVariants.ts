/**
 * Variant mappers for prompt-pack lifecycle states.
 *
 * Split from `StatusBadge.tsx` so the component file stays
 * react-refresh–friendly (it can only export components).
 */

import type { StatusBadgeVariant } from './StatusBadge';

/**
 * Map a compile_status string (compile_ok / parse_failed / etc.)
 * to a StatusBadge variant. Used to keep both the workbench and
 * Block Authoring's drafts sidebar coloring identical.
 */
export function compileStatusVariant(status: string | null | undefined): StatusBadgeVariant {
  if (!status) return 'neutral';
  if (status === 'compile_ok') return 'success';
  if (status.includes('fail') || status.includes('error')) return 'danger';
  return 'warning';
}

/**
 * Map a publication review_status (draft / submitted / approved /
 * rejected) to a variant.
 */
export function reviewStatusVariant(
  status: string | null | undefined,
): StatusBadgeVariant {
  switch (status) {
    case 'approved':
      return 'success';
    case 'rejected':
      return 'danger';
    case 'submitted':
      return 'warning';
    default:
      return 'neutral';
  }
}

/**
 * Map a publication visibility (private / approved / shared) to a
 * variant.
 */
export function visibilityVariant(
  visibility: string | null | undefined,
): StatusBadgeVariant {
  switch (visibility) {
    case 'shared':
      return 'success';
    case 'approved':
      return 'info';
    default:
      return 'neutral';
  }
}
