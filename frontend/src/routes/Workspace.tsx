import { useLayoutStore } from '../stores/layoutStore';
import { DockLayout } from '../components/layout/DockLayout';

export function WorkspaceRoute() {
  const applyPreset = useLayoutStore(s => s.applyPreset);
  const hasRoot = useLayoutStore(s => Boolean(s.root));

  return (
    <div className="h-full flex flex-col">
      <div className="border-b px-3 py-2 flex gap-2 items-center bg-neutral-50 dark:bg-neutral-800">
        <span className="text-xs font-semibold">Workspace</span>
        <button
          className="text-xs px-2 py-1 border rounded hover:bg-neutral-100 dark:hover:bg-neutral-700"
          onClick={() => applyPreset('galleryLeft')}
        >Left</button>
        <button
          className="text-xs px-2 py-1 border rounded hover:bg-neutral-100 dark:hover:bg-neutral-700"
          onClick={() => applyPreset('galleryRight')}
        >Right</button>
        <button
          className="text-xs px-2 py-1 border rounded hover:bg-neutral-100 dark:hover:bg-neutral-700"
          onClick={() => applyPreset('sceneBelow')}
        >Scene Below</button>
        <button
          className="text-xs px-2 py-1 border rounded hover:bg-neutral-100 dark:hover:bg-neutral-700"
          onClick={() => applyPreset('fullscreenGallery')}
        >Fullscreen Gallery</button>
      </div>
      <div className="flex-1 min-h-0">
        <DockLayout />
      </div>
      {!hasRoot && (
        <div className="p-4 text-sm text-neutral-500">Choose a preset to begin arranging panels.</div>
      )}
    </div>
  );
}
