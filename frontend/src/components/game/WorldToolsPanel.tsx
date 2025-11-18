import React from 'react';
import type { GameSessionDTO } from '@pixsim7/ui';
import { worldToolRegistry } from '../../lib/worldTools/registry';

interface WorldToolsPanelProps {
  session: GameSessionDTO | null;
}

/**
 * Panel that renders all visible world tools from the registry
 */
export const WorldToolsPanel: React.FC<WorldToolsPanelProps> = ({ session }) => {
  // Get all visible tools for current context
  const visibleTools = worldToolRegistry.getVisible({ session });

  // If no tools are visible, don't render anything
  if (visibleTools.length === 0) {
    return null;
  }

  return (
    <>
      {visibleTools.map(tool => (
        <div key={tool.id} className="lg:col-span-1">
          {tool.render({ session })}
        </div>
      ))}
    </>
  );
};
