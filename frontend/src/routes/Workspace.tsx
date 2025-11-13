import { useEffect } from 'react';
import { useLayoutStore } from '../stores/layoutStore';
import { DockLayout } from '../components/layout/DockLayout';

export function WorkspaceRoute() {
  const applyPreset = useLayoutStore(s => s.applyPreset);
  const reset = useLayoutStore(s => s.reset);
  const hasRoot = useLayoutStore(s => Boolean(s.root));

  // Auto-apply default preset if no layout exists
  useEffect(() => {
    if (!hasRoot) {
      console.log('[Workspace] No layout found, applying default "workspace" preset');
      applyPreset('workspace');
    }
  }, [hasRoot, applyPreset]);

  return (
    <div className="h-screen flex flex-col pb-60 bg-neutral-100 dark:bg-neutral-950">
      <div className="border-b px-3 py-2 flex gap-2 items-center bg-neutral-50 dark:bg-neutral-800">
        <span className="text-xs font-semibold">Workspace</span>
        <button
          className="text-xs px-2 py-1 border rounded hover:bg-neutral-100 dark:hover:bg-neutral-700"
          onClick={() => applyPreset('workspace')}
        >Editor</button>
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
        <div className="mx-2 h-4 w-px bg-neutral-300 dark:bg-neutral-600" />
        <button
          className="text-xs px-2 py-1 border rounded text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
          onClick={() => reset()}
        >Reset</button>
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
