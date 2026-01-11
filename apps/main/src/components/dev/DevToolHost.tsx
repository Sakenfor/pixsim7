/**
 * Dev Tool Host
 *
 * Dynamic host component for rendering dev tools with proper context.
 * Similar to GraphEditorHost but for dev tools.
 */

import { useMemo } from 'react';

import type { DevToolId } from '@lib/dev/devtools/types';
import { devToolSelectors } from '@lib/plugins/catalogSelectors';

export interface DevToolHostProps {
  /** ID of the dev tool to render */
  toolId: DevToolId;

  /** Optional context data to pass to the dev tool */
  context?: Record<string, any>;

  /** Additional className for styling */
  className?: string;
}

/**
 * Host component that dynamically renders dev tools
 */
export function DevToolHost({ toolId, context, className }: DevToolHostProps) {
  const tool = useMemo(() => devToolSelectors.get(toolId), [toolId]);

  // Tool not found
  if (!tool) {
    return (
      <div className={`flex items-center justify-center h-full bg-gray-900 text-gray-400 ${className || ''}`}>
        <div className="text-center">
          <div className="text-4xl mb-4">🔍</div>
          <h3 className="text-lg font-semibold mb-2">Dev Tool Not Found</h3>
          <p className="text-sm">
            Tool ID "{toolId}" is not registered in the dev tool registry.
          </p>
        </div>
      </div>
    );
  }

  // Tool has no panel component
  if (!tool.panelComponent) {
    return (
      <div className={`flex items-center justify-center h-full bg-gray-900 text-gray-400 ${className || ''}`}>
        <div className="text-center">
          <div className="text-4xl mb-4">{tool.icon || '🧰'}</div>
          <h3 className="text-lg font-semibold mb-2">{tool.label}</h3>
          <p className="text-sm mb-4">{tool.description}</p>
          {tool.routePath && (
            <a
              href={tool.routePath}
              className="text-blue-400 hover:text-blue-300 underline"
            >
              Open in full route →
            </a>
          )}
        </div>
      </div>
    );
  }

  // Render the dev tool component
  const ToolComponent = tool.panelComponent;

  return (
    <div className={`h-full ${className || ''}`}>
      <ToolComponent context={context} />
    </div>
  );
}

/**
 * Wrapper for dev tool in floating panel with header
 */
export interface DevToolFloatingPanelProps {
  toolId: DevToolId;
  context?: Record<string, any>;
  onClose?: () => void;
}

export function DevToolFloatingPanel({ toolId, context, onClose }: DevToolFloatingPanelProps) {
  const tool = devToolSelectors.get(toolId);

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          {tool?.icon && <span className="text-xl">{tool.icon}</span>}
          <h2 className="font-semibold">{tool?.label || toolId}</h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <DevToolHost toolId={toolId} context={context} />
      </div>
    </div>
  );
}
