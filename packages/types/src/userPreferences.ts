/**
 * User UI Preferences Types
 *
 * Per-browser user preferences that override world themes.
 * Stored in localStorage for accessibility and personal customization.
 */

/**
 * User-level UI preferences for accessibility and personalization
 */
export interface UserUiPreferences {
  /** Force high contrast colors for better readability */
  prefersHighContrast?: boolean;
  /** Override theme density regardless of world setting */
  preferredDensity?: 'compact' | 'comfortable' | 'spacious';
  /** Reduce motion/animations for accessibility */
  prefersReducedMotion?: boolean;
  /** Force light or dark mode (overrides system preference) */
  colorScheme?: 'light' | 'dark' | 'auto';
}
