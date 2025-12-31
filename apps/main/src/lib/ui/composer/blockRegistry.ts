/**
 * Block Registry
 *
 * Registry system for composable panel blocks.
 * Blocks are building pieces for composed panels (grid layouts).
 *
 * Previously named "widgets" - renamed to avoid confusion with
 * the new unified Widget system for header/toolbar action widgets.
 */

import type { ComponentType } from 'react';
import { BaseRegistry } from '../../core/BaseRegistry';

export type BlockType =
  | 'text'
  | 'metric'
  | 'list'
  | 'table'
  | 'chart'
  | 'form'
  | 'markdown'
  | 'grid'
  | 'custom';

export interface BlockProps {
  config: Record<string, any>;
  data?: any;
  onDataChange?: (data: any) => void;
}

export interface BlockConfigSchema {
  type: 'object';
  properties: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    title?: string;
    description?: string;
    default?: any;
    enum?: any[];
  }>;
  required?: string[];
}

export interface BlockDefinition {
  id: string;
  type: BlockType;
  title: string;
  component: ComponentType<BlockProps>;
  category: 'display' | 'input' | 'visualization' | 'layout' | 'custom';

  // Configuration
  configSchema: BlockConfigSchema;
  defaultConfig: Record<string, any>;

  // Data requirements
  requiresData?: boolean;
  dataSchema?: Record<string, any>;

  // Layout hints
  minWidth?: number;
  minHeight?: number;
  defaultWidth?: number;
  defaultHeight?: number;
  aspectRatio?: number;
  resizable?: boolean;

  // Metadata
  icon?: string;
  description?: string;
  tags?: string[];
  preview?: string; // URL or base64 image
}

/**
 * BlockRegistry - Centralized registry for all composable panel blocks
 */
export class BlockRegistry extends BaseRegistry<BlockDefinition> {

  /**
   * Get blocks by type
   */
  getByType(type: BlockType): BlockDefinition[] {
    return this.getAll().filter((block) => block.type === type);
  }

  /**
   * Get blocks by category
   */
  getByCategory(category: string): BlockDefinition[] {
    return this.getAll().filter((block) => block.category === category);
  }

  /**
   * Search blocks by query
   */
  search(query: string): BlockDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter((block) => {
      const matchesId = block.id.toLowerCase().includes(lowerQuery);
      const matchesTitle = block.title.toLowerCase().includes(lowerQuery);
      const matchesDescription = block.description?.toLowerCase().includes(lowerQuery);
      const matchesTags = block.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery));

      return matchesId || matchesTitle || matchesDescription || matchesTags;
    });
  }

  /**
   * Get registry statistics
   */
  getStats() {
    const all = this.getAll();
    return {
      total: all.length,
      byType: {
        text: all.filter((b) => b.type === 'text').length,
        metric: all.filter((b) => b.type === 'metric').length,
        list: all.filter((b) => b.type === 'list').length,
        table: all.filter((b) => b.type === 'table').length,
        chart: all.filter((b) => b.type === 'chart').length,
        form: all.filter((b) => b.type === 'form').length,
        markdown: all.filter((b) => b.type === 'markdown').length,
        grid: all.filter((b) => b.type === 'grid').length,
        custom: all.filter((b) => b.type === 'custom').length,
      },
      byCategory: {
        display: all.filter((b) => b.category === 'display').length,
        input: all.filter((b) => b.category === 'input').length,
        visualization: all.filter((b) => b.category === 'visualization').length,
        layout: all.filter((b) => b.category === 'layout').length,
        custom: all.filter((b) => b.category === 'custom').length,
      },
    };
  }
}

// Global block registry singleton
export const blockRegistry = new BlockRegistry();

// ============================================================================
// Backward Compatibility Aliases (deprecated)
// ============================================================================

/** @deprecated Use BlockDefinition instead */
export type WidgetDefinition = BlockDefinition;

/** @deprecated Use BlockRegistry instead */
export type WidgetRegistry = BlockRegistry;

/** @deprecated Use blockRegistry instead */
export const widgetRegistry = blockRegistry;

/** @deprecated Use BlockType instead */
export type WidgetType = BlockType;

/** @deprecated Use BlockProps instead */
export type WidgetProps = BlockProps;
