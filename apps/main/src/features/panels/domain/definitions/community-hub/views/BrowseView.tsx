import { Icon } from '@lib/icons';

export function BrowseView() {
  return (
    <div className="p-4 space-y-4">
      <h2 className="text-sm font-medium text-neutral-200">Browse</h2>
      <p className="text-xs text-neutral-500">
        Discover shared games, assets, and community content.
      </p>

      {/* Placeholder grid */}
      <div className="grid grid-cols-2 gap-3">
        {['Games', 'Assets', 'Templates', 'Scenes'].map((label) => (
          <button
            key={label}
            className="flex flex-col items-center gap-2 p-4 rounded-lg border border-neutral-800 bg-neutral-800/40 hover:bg-neutral-800/70 transition-colors text-neutral-400 hover:text-neutral-200"
          >
            <Icon name="globe" size={20} />
            <span className="text-xs">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
