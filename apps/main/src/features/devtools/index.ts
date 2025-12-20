/**
 * Dev Tools Feature Module
 *
 * Plugin definitions for developer tools.
 * Core infrastructure (registry, types, context) remains in @lib/dev/devtools.
 *
 * @example
 * ```typescript
 * // Import plugin definitions
 * import { builtInDevTools, sessionStateViewerTool } from '@features/devtools';
 *
 * // Import infrastructure from lib
 * import { devToolRegistry, DevToolProvider } from '@lib/dev/devtools';
 * ```
 */

// Export all plugin definitions
export * from './plugins';
