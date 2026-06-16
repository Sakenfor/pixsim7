import {
  GameWorldTabEmptyState,
  useGameWorldEditorContext,
} from '@/components/game/gameWorldEditorContext';
import { InteractionPresetEditor } from '@/components/game/InteractionPresetEditor';

/** Interaction Presets tab — world-scoped preset editor. */
export function PresetsTab() {
  const ctx = useGameWorldEditorContext();
  if (!ctx?.worldDetail) {
    return <GameWorldTabEmptyState message="Select a world to manage interaction presets." />;
  }
  return <InteractionPresetEditor world={ctx.worldDetail} onWorldUpdate={ctx.onWorldUpdate} />;
}
