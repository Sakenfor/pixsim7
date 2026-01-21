/* eslint-disable react-refresh/only-export-components */
/**
 * SourceControllerContext
 *
 * React context for providing source controllers to descendant components.
 * Allows components to access controller capabilities without prop drilling.
 */

import type {
  AnySourceController,
  FolderSourceController,
  CloudSourceController,
  ImportSourceController,
  SourceControllerType,
} from '@pixsim7/shared.sources.core';
import { createContext, useContext, type ReactNode } from 'react';


// ============================================================================
// Context Definition
// ============================================================================

interface SourceControllerContextValue<TAsset = unknown> {
  /** The controller instance */
  controller: AnySourceController<TAsset>;
  /** Controller type discriminator */
  controllerType: SourceControllerType;
}

const SourceControllerContext = createContext<SourceControllerContextValue | null>(null);

// ============================================================================
// Provider Component
// ============================================================================

interface SourceControllerProviderProps<TAsset> {
  /** The controller instance to provide */
  controller: AnySourceController<TAsset>;
  /** Controller type for type narrowing */
  controllerType: SourceControllerType;
  /** Child components */
  children: ReactNode;
}

/**
 * Provider component for source controller context
 *
 * @example
 * ```tsx
 * function LocalFoldersSource() {
 *   const controller = useLocalFoldersController();
 *   return (
 *     <SourceControllerProvider controller={controller} controllerType="folder">
 *       <LocalFoldersPanel />
 *     </SourceControllerProvider>
 *   );
 * }
 * ```
 */
export function SourceControllerProvider<TAsset>({
  controller,
  controllerType,
  children,
}: SourceControllerProviderProps<TAsset>) {
  return (
    <SourceControllerContext.Provider value={{ controller, controllerType }}>
      {children}
    </SourceControllerContext.Provider>
  );
}

// ============================================================================
// Consumer Hooks
// ============================================================================

/**
 * Get the source controller from context (throws if not in context)
 *
 * @example
 * ```tsx
 * function AssetGrid() {
 *   const controller = useSourceController();
 *   return <div>{controller.assets.length} assets</div>;
 * }
 * ```
 */
export function useSourceController<TAsset = unknown>(): AnySourceController<TAsset> {
  const context = useContext(SourceControllerContext);
  if (!context) {
    throw new Error('useSourceController must be used within a SourceControllerProvider');
  }
  return context.controller as AnySourceController<TAsset>;
}

/**
 * Get the source controller from context (returns null if not in context)
 *
 * Useful for optional context consumers that can work with or without a provider.
 */
export function useSourceControllerOptional<TAsset = unknown>(): AnySourceController<TAsset> | null {
  const context = useContext(SourceControllerContext);
  return context?.controller as AnySourceController<TAsset> | null;
}

/**
 * Get the controller type from context
 */
export function useSourceControllerType(): SourceControllerType | null {
  const context = useContext(SourceControllerContext);
  return context?.controllerType ?? null;
}

/**
 * Get a FolderSourceController from context (throws if not folder type)
 *
 * @example
 * ```tsx
 * function FolderList() {
 *   const controller = useFolderSourceController();
 *   return (
 *     <ul>
 *       {controller.folders.map(f => <li key={f.id}>{f.name}</li>)}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useFolderSourceController<TAsset = unknown>(): FolderSourceController<TAsset> {
  const context = useContext(SourceControllerContext);
  if (!context) {
    throw new Error('useFolderSourceController must be used within a SourceControllerProvider');
  }
  if (context.controllerType !== 'folder') {
    throw new Error(
      `useFolderSourceController requires a folder controller, got ${context.controllerType}`
    );
  }
  return context.controller as FolderSourceController<TAsset>;
}

/**
 * Get a CloudSourceController from context (throws if not cloud type)
 *
 * @example
 * ```tsx
 * function CloudStatus() {
 *   const controller = useCloudSourceController();
 *   if (!controller.isAuthenticated) {
 *     return <button onClick={controller.authenticate}>Sign In</button>;
 *   }
 *   return <span>Connected as {controller.userInfo?.email}</span>;
 * }
 * ```
 */
export function useCloudSourceController<TAsset = unknown>(): CloudSourceController<TAsset> {
  const context = useContext(SourceControllerContext);
  if (!context) {
    throw new Error('useCloudSourceController must be used within a SourceControllerProvider');
  }
  if (context.controllerType !== 'cloud') {
    throw new Error(
      `useCloudSourceController requires a cloud controller, got ${context.controllerType}`
    );
  }
  return context.controller as CloudSourceController<TAsset>;
}

/**
 * Get an ImportSourceController from context (throws if not import type)
 */
export function useImportSourceController<TAsset = unknown>(): ImportSourceController<TAsset> {
  const context = useContext(SourceControllerContext);
  if (!context) {
    throw new Error('useImportSourceController must be used within a SourceControllerProvider');
  }
  if (context.controllerType !== 'import') {
    throw new Error(
      `useImportSourceController requires an import controller, got ${context.controllerType}`
    );
  }
  return context.controller as ImportSourceController<TAsset>;
}

// ============================================================================
// Re-export type guards for convenience
// ============================================================================

export {
  isFolderController,
  isCloudController,
  isImportController,
  hasFolderCapability,
  hasAuthCapability,
  hasUploadCapability,
  hasPreviewCapability,
  hasViewerCapability,
  hasViewModeCapability,
  hasScanningCapability,
  hasFeatureFlagsCapability,
} from '@pixsim7/shared.sources.core';
