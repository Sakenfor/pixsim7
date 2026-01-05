/**
 * @pixsim7/game.react
 *
 * React bindings for the game engine.
 * Provides hooks, providers, and viewport stores for React applications.
 *
 * @example
 * ```tsx
 * import {
 *   // Viewport stores
 *   ViewportProvider, useViewport,
 *   PlaybackProvider, usePlayback,
 *   LoadingProvider, useLoading,
 *   // Hooks
 *   useSceneRuntime,
 *   // Providers
 *   Model3DRuntimeProvider,
 * } from '@pixsim7/game.react';
 *
 * function MyGame() {
 *   return (
 *     <ViewportProvider>
 *       <PlaybackProvider>
 *         <LoadingProvider>
 *           <GameComponent />
 *         </LoadingProvider>
 *       </PlaybackProvider>
 *     </ViewportProvider>
 *   );
 * }
 * ```
 */

// ===== Viewport Stores =====
export * from './viewport';

// ===== Hooks =====
export * from './hooks';

// ===== Providers =====
export * from './providers';
