/**
 * Spinner — className-based size alias mapping legacy `w-3 h-3` callers to the
 * shared LoadingSpinner size variants. Shared across the maintenance surfaces
 * (dashboard, storage overview, duplicates) which historically passed Tailwind
 * size classes to a hand-rolled SVG.
 */
import { LoadingSpinner } from '@pixsim7/shared.ui';

export function Spinner({ className = '' }: { className?: string }) {
  const size: 'xs' | 'sm' = /w-3\b/.test(className) ? 'xs' : 'sm';
  return <LoadingSpinner size={size} />;
}
