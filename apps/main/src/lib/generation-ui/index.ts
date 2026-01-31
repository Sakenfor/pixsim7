/**
 * Generation UI Library
 *
 * Shared generation UI components for use across features.
 * Extracted from controlCenter to enable reuse in other generation contexts.
 *
 * @example
 * ```typescript
 * import { GenerationSettingsBar, DynamicParamForm } from '@lib/generation-ui';
 * ```
 */

// Components
export { GenerationSettingsBar } from './components/GenerationSettingsBar';
export type { GenerationSettingsBarProps } from './components/GenerationSettingsBar';

export { GenerationStatusDisplay } from './components/GenerationStatusDisplay';

export { DynamicParamForm } from './components/DynamicParamForm';
export type { DynamicParamFormProps } from './components/DynamicParamForm';

// Types
export type { ParamSpec } from './types';
