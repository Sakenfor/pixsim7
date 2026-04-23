import { LoadingSpinner } from '@pixsim7/shared.ui';
import clsx from 'clsx';

interface SettingsLoadingStateProps {
  label?: string;
  fullHeight?: boolean;
  className?: string;
}

/**
 * Canonical loading state for settings surfaces.
 * Keeps loading UI consistent across modules.
 */
export function SettingsLoadingState({
  label = 'Loading settings...',
  fullHeight = false,
  className,
}: SettingsLoadingStateProps) {
  return (
    <div
      className={clsx(
        'flex items-center justify-center p-4',
        fullHeight ? 'flex-1 min-h-0' : 'w-full',
        className,
      )}
    >
      <LoadingSpinner size="md" label={label} />
    </div>
  );
}
