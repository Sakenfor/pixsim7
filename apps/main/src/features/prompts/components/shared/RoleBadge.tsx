/**
 * RoleBadge — Colored dot + label pill for prompt block roles.
 *
 * Renders consistently across PromptComposer, TemplateRollResult,
 * TemplateSlotEditor preview, and any other block display context.
 */
import clsx from 'clsx';

import { getPromptRoleBadgeClass, getPromptRoleLabel } from '@/lib/promptRoleUi';

interface RoleBadgeProps {
  role?: string | null;
  colorOverrides?: Record<string, string>;
  className?: string;
}

export function RoleBadge({ role, colorOverrides, className }: RoleBadgeProps) {
  const badgeColor = getPromptRoleBadgeClass(role ?? undefined, colorOverrides);
  const label = getPromptRoleLabel(role ?? undefined);

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full',
        'border border-neutral-200 dark:border-neutral-700',
        'text-neutral-600 dark:text-neutral-300',
        className,
      )}
    >
      <span className={clsx('w-1.5 h-1.5 rounded-full', badgeColor)} />
      {label}
    </span>
  );
}
