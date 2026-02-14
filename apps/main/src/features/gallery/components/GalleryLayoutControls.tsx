import { Icon } from '@lib/icons';

interface GalleryLayoutControlsProps {
  layout: 'masonry' | 'grid';
  setLayout: (layout: 'masonry' | 'grid') => void;
  cardSize: number;
  setCardSize: (size: number) => void;
}

export function GalleryLayoutControls({
  layout,
  setLayout,
  cardSize,
  setCardSize,
}: GalleryLayoutControlsProps) {
  return (
    <>
      {/* Layout toggle chip */}
      <div className="h-7 inline-flex items-center rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 overflow-hidden">
        <button
          className={`h-full px-1.5 transition-colors ${
            layout === 'masonry'
              ? 'bg-accent/10 text-accent'
              : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
          }`}
          onClick={() => setLayout('masonry')}
          title="Masonry layout"
        >
          <Icon name="columns" size={14} />
        </button>
        <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-700" />
        <button
          className={`h-full px-1.5 transition-colors ${
            layout === 'grid'
              ? 'bg-accent/10 text-accent'
              : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
          }`}
          onClick={() => setLayout('grid')}
          title="Grid layout"
        >
          <Icon name="grid" size={14} />
        </button>
      </div>

      {/* Card size slider chip */}
      <div className="h-7 px-1.5 inline-flex items-center gap-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60">
        <input
          type="range"
          min="160"
          max="400"
          step="20"
          value={cardSize}
          onChange={(e) => setCardSize(Number(e.target.value))}
          className="w-14 h-1 bg-neutral-300 dark:bg-neutral-600 rounded-lg appearance-none cursor-pointer accent-accent"
          title={`Card size: ${cardSize}px`}
        />
        <span className="text-[10px] text-neutral-500 dark:text-neutral-400 tabular-nums">{cardSize}</span>
      </div>
    </>
  );
}
