import clsx from 'clsx';
import type { ReactNode } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type BackgroundProps,
  type MiniMapProps,
} from 'reactflow';

import 'reactflow/dist/style.css';
import { toReactFlowProps, type GraphDomainAdapter } from './graphDomainAdapter';

export interface GraphCanvasShellProps {
  adapter: GraphDomainAdapter;
  fitView?: boolean;
  fitViewPadding?: number;
  containerClassName?: string;
  canvasClassName?: string;
  showMiniMap?: boolean;
  miniMapClassName?: string;
  miniMapNodeColor?: MiniMapProps['nodeColor'];
  showControls?: boolean;
  backgroundGap?: number;
  backgroundSize?: number;
  backgroundVariant?: BackgroundProps['variant'];
  children?: ReactNode;
}

export function GraphCanvasShell({
  adapter,
  fitView = true,
  fitViewPadding = 0.15,
  containerClassName,
  canvasClassName,
  showMiniMap = true,
  miniMapClassName,
  miniMapNodeColor,
  showControls = true,
  backgroundGap = 20,
  backgroundSize = 1,
  backgroundVariant,
  children,
}: GraphCanvasShellProps) {
  return (
    <div className={clsx('overflow-hidden rounded border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900/30', containerClassName)}>
      <ReactFlow
        {...toReactFlowProps(adapter)}
        fitView={fitView}
        fitViewOptions={fitView ? { padding: fitViewPadding } : undefined}
        className={clsx('bg-neutral-50 dark:bg-neutral-900/40', canvasClassName)}
      >
        {showMiniMap && (
          <MiniMap
            pannable
            zoomable
            nodeColor={miniMapNodeColor}
            className={clsx('!bg-white dark:!bg-neutral-800', miniMapClassName)}
          />
        )}
        {showControls && <Controls />}
        <Background gap={backgroundGap} size={backgroundSize} variant={backgroundVariant} />
        {children}
      </ReactFlow>
    </div>
  );
}
