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

/**
 * User content preferences for generation and content filtering
 *
 * Controls what kind of romantic/mature content the user is comfortable with.
 * Applied globally across all worlds and generation requests.
 */
export interface UserContentPreferences {
  /**
   * Maximum content rating allowed for this user
   * Clamps all generation requests to this rating or lower,
   * even if world/relationship context would allow higher ratings
   *
   * - 'sfw': Safe for work, no romantic content
   * - 'romantic': Light romance, hand-holding, kissing
   * - 'mature_implied': Mature themes implied but not explicit
   * - 'restricted': Restricted content (requires explicit user consent)
   *
   * Default: 'romantic' (safe default with light romance allowed)
   */
  maxContentRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';

  /**
   * Reduce romantic intensity in generation
   * When enabled, intimacy bands are reduced by one level:
   * - 'intense' → 'deep'
   * - 'deep' → 'light'
   * - 'light' → 'none'
   *
   * Useful for users who want romance but prefer lighter content
   *
   * Default: false
   */
  reduceRomanticIntensity?: boolean;

  /**
   * Require explicit confirmation before showing mature content
   * Even if maxContentRating allows it, show a confirmation prompt
   * before displaying mature_implied or restricted content
   *
   * Default: true (for safety)
   */
  requireMatureContentConfirmation?: boolean;
}

/**
 * Combined user preferences (UI + Content)
 */
export interface UserPreferences extends UserUiPreferences, UserContentPreferences {}
