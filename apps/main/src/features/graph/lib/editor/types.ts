/**
 * Graph Editor Types
 *
 * Type definitions for graph editor surfaces in the modular registry system.
 * Part of Task 53 - Graph Editor Registry & Modular Surfaces
 */

import type { ComponentType, LazyExoticComponent } from 'react';

/**
 * Graph editor identifier - unique ID for each graph editor surface
 */
export type GraphEditorId =
  | 'scene-graph-v2'
  | 'arc-graph'
  | string;

export type GraphEditorComponent =
  | ComponentType<Record<string, never>>
  | LazyExoticComponent<ComponentType<Record<string, never>>>;

/**
 * Graph editor definition - describes a graph editor surface
 */
export interface GraphEditorDefinition {
  /** Unique identifier for this editor */
  id: GraphEditorId;

  /** Human-readable label */
  label: string;

  /** Optional description */
  description?: string;

  /** Optional icon (emoji or icon identifier) */
  icon?: string;

  /** Category for grouping editors */
  category?: 'core' | 'world' | 'arc' | 'debug' | 'custom';

  /** React component that renders the editor surface */
  component: GraphEditorComponent;

  /** Backing store ID, for diagnostics and binding */
  storeId: 'scene-graph-v2' | 'arc-graph' | string;

  /** Supported modes / features */
  supportsMultiScene?: boolean;
  supportsWorldContext?: boolean;
  supportsPlayback?: boolean;

  /** Optional: default route or panel ID that hosts this editor */
  defaultRoute?: string;
  defaultPanelId?: string;
}
