/**
 * Overlay Toolbar Styles
 *
 * Shared styling constants for overlay toolbar buttons.
 */

/** Base button styles for overlay toolbars */
export const TOOLBAR_BUTTON_BASE = 'px-2 py-1 text-xs rounded transition-colors';

/** Active/selected button state */
export const TOOLBAR_BUTTON_ACTIVE = 'bg-blue-600 text-white';

/** Inactive/default button state */
export const TOOLBAR_BUTTON_INACTIVE = 'bg-neutral-700 hover:bg-neutral-600 text-neutral-200';

/** Disabled button modifier */
export const TOOLBAR_BUTTON_DISABLED = 'disabled:opacity-40 disabled:cursor-not-allowed';

/**
 * Get button class based on active state.
 */
export function getToolbarButtonClass(isActive: boolean): string {
  return `${TOOLBAR_BUTTON_BASE} ${isActive ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_INACTIVE}`;
}

/**
 * Get button class with disabled support.
 */
export function getToolbarButtonClassWithDisabled(isActive: boolean, isDisabled?: boolean): string {
  const base = getToolbarButtonClass(isActive);
  return isDisabled ? `${base} ${TOOLBAR_BUTTON_DISABLED}` : base;
}
