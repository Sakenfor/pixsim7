/**
 * Canonical button state maps.
 *
 * Define visual config (icon, title, disabled) per state key once, then resolve
 * via `resolveButtonState` instead of ad-hoc ternary chains.
 *
 * Usage:
 *   const s = resolveButtonState(UPLOAD_BUTTON_STATES, uploadState);
 *   <button disabled={s.disabled} title={s.title}>{s.icon}</button>
 */

import { Icon, type IconName } from '@lib/icons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ButtonStateEntry {
  icon: IconName;
  iconClassName?: string;
  title: string;
  disabled?: boolean;
}

export type ButtonStateMap<S extends string> = Record<S, ButtonStateEntry>;

/** Resolved state ready to spread into a ButtonGroupItem (or any button). */
export interface ResolvedButtonState {
  icon: React.ReactNode;
  title: string;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Turn a state map entry into a renderable button fragment.
 * Spread the result into a `ButtonGroupItem` or use the fields directly.
 */
export function resolveButtonState<S extends string>(
  map: ButtonStateMap<S>,
  state: S,
  size = 14,
): ResolvedButtonState {
  const entry = map[state];
  return {
    icon: <Icon name={entry.icon} size={size} className={entry.iconClassName} />,
    title: entry.title,
    disabled: entry.disabled,
  };
}

// ---------------------------------------------------------------------------
// Predefined state maps
// ---------------------------------------------------------------------------

export const UPLOAD_BUTTON_STATES: ButtonStateMap<'idle' | 'uploading' | 'success' | 'error'> = {
  idle:      { icon: 'upload',        title: 'Upload to library' },
  uploading: { icon: 'loader',        title: 'Uploading...',  iconClassName: 'animate-spin', disabled: true },
  success:   { icon: 'check',         title: 'Uploaded',      disabled: true },
  error:     { icon: 'alertTriangle', title: 'Upload failed' },
};

/** Generic busy/idle pair — override `icon` and `title` for the idle entry. */
export const ASYNC_ACTION_STATES: ButtonStateMap<'idle' | 'busy'> = {
  idle: { icon: 'zap',    title: '' },
  busy: { icon: 'loader', title: 'Working...', iconClassName: 'animate-spin', disabled: true },
};

/**
 * Create a two-state (idle / busy) map with custom idle icon and title.
 * Busy state always shows a spinning loader.
 */
export function makeAsyncStates(
  idleIcon: IconName,
  idleTitle: string,
  busyTitle = 'Working...',
): ButtonStateMap<'idle' | 'busy'> {
  return {
    idle: { icon: idleIcon, title: idleTitle },
    busy: { icon: 'loader', title: busyTitle, iconClassName: 'animate-spin', disabled: true },
  };
}
