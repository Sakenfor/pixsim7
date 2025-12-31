/**
 * Composed Panel Component
 *
 * Renders a panel composition with live data binding.
 * Uses blocks (building pieces) from the block registry.
 *
 * Integrates Panel Composer with Data Binding System.
 */

import React from 'react';
import type { PanelComposition, BlockInstance } from './panelComposer';
import { blockWidgets, widgetRegistry } from '@lib/widgets';
import { useBindingValues, dataSourceRegistry } from '../../dataBinding';

interface ComposedPanelProps {
  composition: PanelComposition;
}

/**
 * Renders a panel composition with blocks and live data bindings
 */
export function ComposedPanel({ composition }: ComposedPanelProps) {
  // Register all data sources from the composition
  React.useEffect(() => {
    if (composition.dataSources) {
      composition.dataSources.forEach((dataSource) => {
        // Only register if not already registered
        if (!dataSourceRegistry.hasSource(dataSource.id)) {
          dataSourceRegistry.registerSource(dataSource);
        }
      });
    }

    // Cleanup: Unregister data sources when composition changes
    return () => {
      if (composition.dataSources) {
        composition.dataSources.forEach((dataSource) => {
          dataSourceRegistry.unregisterSource(dataSource.id);
        });
      }
    };
  }, [composition.dataSources]);

  const { layout, widgets, styles } = composition;

  return (
    <div
      className="composed-panel"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
        gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
        gap: layout.gap || 8,
        width: '100%',
        height: '100%',
        ...styles,
      }}
    >
      {widgets.map((block) => (
        <BlockRenderer key={block.id} block={block} />
      ))}
    </div>
  );
}

/**
 * Renders a single block instance with data binding
 */
function BlockRenderer({ block }: { block: BlockInstance }) {
  // Resolve data bindings
  const bindingValues = useBindingValues(block.dataBindings);

  // Get block definition from unified registry (uses widgetType for backward compatibility)
  // Note: block IDs are prefixed with 'block-' in unified registry
  const blockDef = blockWidgets.get(`block-${block.widgetType}`) || blockWidgets.get(block.widgetType);

  if (!blockDef) {
    return (
      <div
        style={{
          gridColumn: `${block.position.x + 1} / span ${block.position.w}`,
          gridRow: `${block.position.y + 1} / span ${block.position.h}`,
          border: '1px dashed red',
          padding: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span>Unknown block: {block.widgetType}</span>
      </div>
    );
  }

  const Component = blockDef.component;

  if (!Component) {
    return (
      <div
        style={{
          gridColumn: `${block.position.x + 1} / span ${block.position.w}`,
          gridRow: `${block.position.y + 1} / span ${block.position.h}`,
          background: 'rgba(255, 255, 0, 0.1)',
          border: '1px dashed #999',
          padding: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span>No component: {block.widgetType}</span>
      </div>
    );
  }

  // Props for unified widget component
  // - settings: static config
  // - data: resolved binding values (forwarded as named props by wrapper)
  const props = {
    instanceId: block.id,
    settings: block.config,
    surface: 'panel-composer' as const,
    data: bindingValues,
  };

  return (
    <div
      style={{
        gridColumn: `${block.position.x + 1} / span ${block.position.w}`,
        gridRow: `${block.position.y + 1} / span ${block.position.h}`,
        overflow: 'auto',
      }}
    >
      <Component {...props} />
    </div>
  );
}

/**
 * Hook to get all available block types for the builder UI.
 * Returns unified WidgetDefinitions for panel-composer surface.
 */
export function useAvailableBlocks() {
  const [blocks, setBlocks] = React.useState(blockWidgets.getAll());

  React.useEffect(() => {
    const unsubscribe = widgetRegistry.subscribe(() => {
      setBlocks(blockWidgets.getAll());
    });
    return unsubscribe;
  }, []);

  return blocks;
}

/**
 * Hook to get all available data sources for the builder UI
 */
export function useAvailableDataSources() {
  const [sources, setSources] = React.useState(dataSourceRegistry.getAllSources());

  React.useEffect(() => {
    const unsubscribe = dataSourceRegistry.subscribe(() => {
      setSources(dataSourceRegistry.getAllSources());
    });
    return unsubscribe;
  }, []);

  return sources;
}

// ============================================================================
// Backward Compatibility Aliases (deprecated)
// ============================================================================

/** @deprecated Use useAvailableBlocks instead */
export const useAvailableWidgets = useAvailableBlocks;
