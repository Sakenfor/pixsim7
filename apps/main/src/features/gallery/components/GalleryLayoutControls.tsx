import { ThemedIcon } from '@lib/icons';

interface GalleryLayoutControlsProps {
  layout: 'masonry' | 'grid';
  setLayout: (layout: 'masonry' | 'grid') => void;
  cardSize: number;
  setCardSize: (size: number) => void;
  onSettingsClick?: () => void;
}

export function GalleryLayoutControls({
  layout,
  setLayout,
  cardSize,
  setCardSize,
  onSettingsClick,
}: GalleryLayoutControlsProps) {
  return (
    <div className="flex items-center gap-3">
      {/* Layout toggle */}
      <div className="flex items-center gap-1 text-xs">
        <button
          className={`px-2 py-1 rounded ${
            layout === 'masonry'
              ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
              : 'bg-neutral-200 dark:bg-neutral-700'
          }`}
          onClick={() => setLayout('masonry')}
        >
          Masonry
        </button>
        <button
          className={`px-2 py-1 rounded ${
            layout === 'grid'
              ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
              : 'bg-neutral-200 dark:bg-neutral-700'
          }`}
          onClick={() => setLayout('grid')}
        >
          Grid
        </button>
      </div>

      {/* Card size slider */}
      <div className="flex items-center gap-2 px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded">
        <ThemedIcon name="image" size={12} variant="default" />
        <input
          type="range"
          min="160"
          max="400"
          step="20"
          value={cardSize}
          onChange={(e) => setCardSize(Number(e.target.value))}
          className="w-20 h-1 bg-neutral-300 dark:bg-neutral-600 rounded-lg appearance-none cursor-pointer accent-blue-600"
          title={`Card size: ${cardSize}px`}
        />
        <span className="text-[10px] text-neutral-500 dark:text-neutral-400 w-8">{cardSize}</span>
      </div>

      {/* Optional settings button */}
      {onSettingsClick && (
        <button
          type="button"
          className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700"
          title="Layout settings"
          onClick={onSettingsClick}
        >
          <ThemedIcon name="settings" size={12} variant="default" />
        </button>
      )}
    </div>
  );
}
