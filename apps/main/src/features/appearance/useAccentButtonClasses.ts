/**
 * Returns Tailwind class strings for accent-colored action buttons,
 * driven by the user's `buttonStyle` appearance setting.
 *
 * Three roles define the visual hierarchy:
 *   primary   – strongest (Go button)
 *   secondary – medium    (Each button, secondary Go)
 *   tertiary  – softest   (side controls attached to a button)
 *
 * Each role string includes background, hover, AND text color so that
 * styles like `soft` can use dark-on-light text automatically.
 *
 * Usage:
 *   const btn = useAccentButtonClasses();
 *   <button className={clsx(disabled ? 'bg-neutral-400' : btn.primary)} />
 */

import { useAppearanceStore, type ButtonStyle } from './stores/appearanceStore';

export interface AccentButtonClasses {
  primary: string;
  secondary: string;
  tertiary: string;
}

const styles: Record<ButtonStyle, AccentButtonClasses> = {
  gradient: {
    primary:   'text-accent-text bg-gradient-to-r from-accent to-accent-deep hover:from-accent-hover hover:to-accent-deep',
    secondary: 'text-accent-text bg-gradient-to-r from-accent-muted to-accent hover:from-accent hover:to-accent-hover',
    tertiary:  'text-accent-text bg-accent hover:bg-accent-deep',
  },
  solid: {
    primary:   'text-accent-text bg-accent hover:bg-accent-hover',
    secondary: 'text-accent-text bg-accent hover:bg-accent-hover',
    tertiary:  'text-accent-text bg-accent-hover hover:bg-accent-deep',
  },
  soft: {
    primary:   'text-accent-text bg-accent-muted hover:bg-accent',
    secondary: 'text-accent bg-accent-subtle hover:bg-accent-muted',
    tertiary:  'text-accent bg-accent-subtle hover:bg-accent-muted',
  },
};

export function useAccentButtonClasses(): AccentButtonClasses {
  const buttonStyle = useAppearanceStore((s) => s.buttonStyle);
  return styles[buttonStyle] ?? styles.gradient;
}
