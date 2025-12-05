/**
 * Media Settings Module
 *
 * Performance and storage settings for media handling.
 */
import { useMediaSettingsStore } from '@/stores/mediaSettingsStore';
import { settingsRegistry } from '@/lib/settingsRegistry';

export function MediaSettings() {
  const preventDiskCache = useMediaSettingsStore((s) => s.preventDiskCache);
  const setPreventDiskCache = useMediaSettingsStore((s) => s.setPreventDiskCache);

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4 text-xs text-neutral-800 dark:text-neutral-100">
      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Performance & Storage
        </h2>
        <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
          Control how media is cached and displayed.
        </p>

        <div className="mt-2 space-y-2 border border-neutral-200 dark:border-neutral-800 rounded-md p-3 bg-neutral-50/60 dark:bg-neutral-900/40">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-100">
                Prevent Disk Cache for Thumbnails
              </div>
              <div className="text-[10px] text-neutral-600 dark:text-neutral-400">
                Keeps thumbnails in memory only. Reduces Chrome cache on C: drive but uses more RAM.
              </div>
            </div>

            <label className="flex items-center cursor-pointer ml-4">
              <input
                type="checkbox"
                checked={preventDiskCache}
                onChange={(e) => setPreventDiskCache(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-neutral-300 dark:bg-neutral-700 rounded-full peer peer-checked:bg-blue-500 peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all relative"></div>
            </label>
          </div>

          <div className="text-[10px] text-neutral-500 dark:text-neutral-400 pt-2 border-t border-neutral-200/70 dark:border-neutral-800/70">
            When enabled, external images (like Pixverse thumbnails) are fetched via JavaScript
            and converted to blob URLs. Chrome won&apos;t cache them on disk, saving space on C: drive.
            May increase memory usage and initial load time.
          </div>
        </div>
      </section>
    </div>
  );
}

// Register this module
settingsRegistry.register({
  id: 'media',
  label: 'Media',
  component: MediaSettings,
  order: 40,
});
