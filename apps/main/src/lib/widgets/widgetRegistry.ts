/**
 * Widget Registry
 *
 * Registry system for composable panel widgets.
 * Part of Task 50 Phase 50.4 - Panel Builder/Composer
 */

import type { ComponentType } from 'react';
import { BaseRegistry } from '../core/BaseRegistry';

export type WidgetType =
  | 'text'
  | 'metric'
  | 'list'
  | 'table'
  | 'chart'
  | 'form'
  | 'markdown'
  | 'grid'
  | 'custom';

export interface WidgetProps {
  config: Record<string, any>;
  data?: any;
  onDataChange?: (data: any) => void;
}

export interface WidgetConfigSchema {
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

export interface WidgetDefinition {
  id: string;
  type: WidgetType;
  title: string;
  component: ComponentType<WidgetProps>;
  category: 'display' | 'input' | 'visualization' | 'layout' | 'custom';

  // Configuration
  configSchema: WidgetConfigSchema;
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
 * WidgetRegistry - Centralized registry for all composable widgets
 */
export class WidgetRegistry extends BaseRegistry<WidgetDefinition> {

  /**
   * Get widgets by type
   */
  getByType(type: WidgetType): WidgetDefinition[] {
    return this.getAll().filter((widget) => widget.type === type);
  }

  /**
   * Get widgets by category
   */
  getByCategory(category: string): WidgetDefinition[] {
    return this.getAll().filter((widget) => widget.category === category);
  }

  /**
   * Search widgets by query
   */
  search(query: string): WidgetDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter((widget) => {
      const matchesId = widget.id.toLowerCase().includes(lowerQuery);
      const matchesTitle = widget.title.toLowerCase().includes(lowerQuery);
      const matchesDescription = widget.description?.toLowerCase().includes(lowerQuery);
      const matchesTags = widget.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery));

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
        text: all.filter((w) => w.type === 'text').length,
        metric: all.filter((w) => w.type === 'metric').length,
        list: all.filter((w) => w.type === 'list').length,
        table: all.filter((w) => w.type === 'table').length,
        chart: all.filter((w) => w.type === 'chart').length,
        form: all.filter((w) => w.type === 'form').length,
        markdown: all.filter((w) => w.type === 'markdown').length,
        grid: all.filter((w) => w.type === 'grid').length,
        custom: all.filter((w) => w.type === 'custom').length,
      },
      byCategory: {
        display: all.filter((w) => w.category === 'display').length,
        input: all.filter((w) => w.category === 'input').length,
        visualization: all.filter((w) => w.category === 'visualization').length,
        layout: all.filter((w) => w.category === 'layout').length,
        custom: all.filter((w) => w.category === 'custom').length,
      },
    };
  }
}

// Global widget registry singleton
export const widgetRegistry = new WidgetRegistry();
