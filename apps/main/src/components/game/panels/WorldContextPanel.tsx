import {
  CAP_EDITOR_CONTEXT,
  type EditorContextSnapshot,
  useAuthoringContext,
  useCapability,
} from '@features/contextHub';

import { WorldContextSelector } from '@/components/game/WorldContextSelector';

/**
 * WorldContextPanel
 *
 * Dockable panel wrapper for the WorldContextSelector.
 * Uses canonical authoring/editor capabilities to show world/location.
 */
export function WorldContextPanel() {
  const { worldId } = useAuthoringContext();
  const { value: editorContext } = useCapability<EditorContextSnapshot>(CAP_EDITOR_CONTEXT);
  const locationId = editorContext?.world?.locationId ?? null;
  const worldLabel = worldId ? `World #${worldId}` : 'No world selected';
  const locationLabel = locationId
    ? `Location #${locationId}`
    : 'No location selected';

  return (
    <div className="h-full w-full flex flex-col bg-neutral-50 dark:bg-neutral-950">
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-600 dark:text-neutral-300 flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="font-semibold">World Context</span>
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
            {worldLabel} · {locationLabel}
          </span>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex items-center px-3 py-2">
        <WorldContextSelector />
      </div>
    </div>
  );
}
