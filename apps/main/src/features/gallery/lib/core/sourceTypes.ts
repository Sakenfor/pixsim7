import type { SourceControllerType, AnySourceController } from '@pixsim7/shared.sources.core';
import type { ComponentType } from 'react';

import type { AssetSourceId } from './assetSources';

/**
 * Source Type System
 *
 * Phase 2: Define source types (templates) that can be instantiated.
 * For now, we hard-code one instance per type.
 *
 * Future (Phase 3): Users will be able to create multiple instances of each type
 * (e.g., "My Work Drive", "Personal Drive" both from 'google-drive' type)
 */

export type SourceTypeId =
  | 'remote-gallery'  // DB-backed assets
  | 'local-fs'        // Local filesystem
  | 'google-drive'    // Future
  | 'pinterest'       // Future
  | string;

export type SourceCategory = 'remote' | 'local' | 'cloud' | 'social';

/**
 * Defines a type of source that can be instantiated
 */
export interface SourceTypeDefinition<TController extends AnySourceController = AnySourceController> {
  typeId: SourceTypeId;
  name: string;
  icon: string;
  category: SourceCategory;
  description: string;

  // Component to render instances of this type
  component: ComponentType<any>;

  // Controller type discriminator for context provider
  controllerType?: SourceControllerType;

  // Hook to create controller instance (called inside component)
  useController?: () => TController;

  // For Phase 3: configuration schema for user setup
  // configSchema?: {
  //   fields: SourceConfigField[];
  //   authType: 'oauth2' | 'api-key' | 'none';
  // };

  // For Phase 3: factory to create controller from config
  // createController?: (config: any) => any;
}

/**
 * Registry of available source types
 */
export const sourceTypeRegistry = new Map<SourceTypeId, SourceTypeDefinition>();

/**
 * Register a source type
 */
export function registerSourceType(definition: SourceTypeDefinition) {
  sourceTypeRegistry.set(definition.typeId, definition);
}

/**
 * Get a source type by ID
 */
export function getSourceType(typeId: SourceTypeId): SourceTypeDefinition | undefined {
  return sourceTypeRegistry.get(typeId);
}

/**
 * Get all registered source types
 */
export function getAllSourceTypes(): SourceTypeDefinition[] {
  return Array.from(sourceTypeRegistry.values());
}

/**
 * Create a default instance ID for a source type
 * For now, one instance per type. In Phase 3, users create their own instance IDs.
 */
export function getDefaultInstanceId(typeId: SourceTypeId): AssetSourceId {
  return typeId; // For now, instance ID = type ID
}
