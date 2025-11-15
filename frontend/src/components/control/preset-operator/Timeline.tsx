import { useMemo } from 'react';
import clsx from 'clsx';
import type { TimelineAsset } from '../PresetOperator';

interface TimelineProps {
  assets: TimelineAsset[];
}

export function Timeline({ assets }: TimelineProps) {
  const totalDuration = useMemo(() => {
    return assets.reduce((sum, asset) => sum + (asset.duration || 0), 0);
  }, [assets]);

  if (!totalDuration) {
    return (
      <div className="text-xs text-neutral-500 italic text-center py-4">
        Add durations to assets to see timeline
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400">
        <span>Timeline</span>
        <span>Total: {totalDuration.toFixed(1)}s</span>
      </div>

      <div className="relative h-12 bg-neutral-100 dark:bg-neutral-800 rounded overflow-hidden">
        {assets.map((asset, idx) => {
          const prevDuration = assets.slice(0, idx).reduce((sum, a) => sum + (a.duration || 0), 0);
          const widthPercent = ((asset.duration || 0) / totalDuration) * 100;
          const leftPercent = (prevDuration / totalDuration) * 100;

          return (
            <div
              key={asset.id}
              className={clsx(
                'absolute top-0 bottom-0 border-r border-white dark:border-neutral-900',
                'flex items-center justify-center text-xs font-medium',
                asset.type === 'image'
                  ? 'bg-blue-500/70 text-white'
                  : 'bg-purple-500/70 text-white'
              )}
              style={{
                left: `${leftPercent}%`,
                width: `${widthPercent}%`,
              }}
              title={`${asset.name || `Asset ${idx + 1}`}: ${asset.duration}s`}
            >
              {widthPercent > 10 && (asset.name || `#${idx + 1}`)}
            </div>
          );
        })}
      </div>

      {/* Time markers */}
      <div className="relative h-4">
        {[0, 25, 50, 75, 100].map((percent) => (
          <div
            key={percent}
            className="absolute text-xs text-neutral-500"
            style={{ left: `${percent}%`, transform: 'translateX(-50%)' }}
          >
            {((totalDuration * percent) / 100).toFixed(1)}s
          </div>
        ))}
      </div>
    </div>
  );
}
