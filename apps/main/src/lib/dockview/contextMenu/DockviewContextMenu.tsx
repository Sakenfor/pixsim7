/**
 * Dockview Context Menu (app-specific wrapper)
 *
 * Wraps shared ContextMenuPortal with app-specific Icon rendering.
 */

import { ContextMenuPortal as BaseContextMenuPortal } from '@pixsim7/shared.ui.context-menu';

import { Icon } from '@lib/icons';

function renderIcon(name: string, size: number, className?: string) {
  return (
    <Icon
      name={name as any}
      size={size}
      className={className || 'text-current'}
    />
  );
}

export function ContextMenuPortal() {
  return <BaseContextMenuPortal renderIcon={renderIcon} />;
}
