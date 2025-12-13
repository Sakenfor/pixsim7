/**
 * Generation UI Library
 *
 * Shared generation UI components for use across features.
 * Extracted from controlCenter to enable reuse in other generation contexts.
 *
 * @example
 * ```typescript
 * import { GenerationSettingsBar, GenerationStatusDisplay } from '@lib/generation-ui';
 * ```
 */

// Components
export { GenerationSettingsBar } from './components/GenerationSettingsBar';
export type { GenerationSettingsBarProps } from './components/GenerationSettingsBar';

export { GenerationStatusDisplay } from './components/GenerationStatusDisplay';

// Types
export type { ParamSpec } from './types';
