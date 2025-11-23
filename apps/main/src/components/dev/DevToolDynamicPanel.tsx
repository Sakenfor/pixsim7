/**
 * Dev Tool Dynamic Panel
 *
 * A special panel component that dynamically renders dev tools
 * based on the context passed to it. This is used by the floating
 * panel system to open dev tools.
 */

import { DevToolHost } from './DevToolHost';

export interface DevToolDynamicPanelProps {
  /** Context passed from floating panel */
  context?: {
    toolId?: string;
    toolDefinition?: any;
    [key: string]: any;
  };
}

/**
 * Panel component that renders the appropriate dev tool based on context
 */
export function DevToolDynamicPanel({ context }: DevToolDynamicPanelProps) {
  const toolId = context?.toolId;

  if (!toolId) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900 text-gray-400">
        <div className="text-center">
          <div className="text-4xl mb-4">🧰</div>
          <h3 className="text-lg font-semibold mb-2">No Dev Tool Specified</h3>
          <p className="text-sm">
            This panel requires a toolId in its context.
          </p>
        </div>
      </div>
    );
  }

  return <DevToolHost toolId={toolId} context={context} className="h-full" />;
}
