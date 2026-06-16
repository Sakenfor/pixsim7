import { useGameWorldEditorContext } from '@/components/game/gameWorldEditorContext';
import { InteractionPresetUsagePanel } from '@/components/game/panels/InteractionPresetUsagePanel';

/** Usage Stats tab — read-only preset usage metrics (handles a null world). */
export function UsageTab() {
  const ctx = useGameWorldEditorContext();
  return <InteractionPresetUsagePanel world={ctx?.worldDetail ?? null} />;
}
