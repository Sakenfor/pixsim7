/**
 * PromptAuthoringWorkbenchHost
 *
 * Top-level component for the standalone Prompt Authoring panel.
 * Wraps PromptAuthoringProvider + GenerationCapableHost + PanelHostDockview.
 *
 * The panel definition has `generationCapable: true` which provides the
 * generation scope. GenerationCapableHost bridges the capability so the
 * generator dropdown sees this panel.
 */

import { GenerationCapableHost } from '@features/generation';
import { PanelHostDockview, type LayoutSpecEntry } from '@features/panels/components/host/PanelHostDockview';

import { PromptAuthoringProvider } from '../../context/PromptAuthoringContext';

const DOCK_ID = 'prompt-authoring';

const PANEL_IDS = [
  'prompt-authoring-navigator',
  'prompt-authoring-editor',
  'prompt-authoring-assets',
] as const;

const LAYOUT_SPEC: LayoutSpecEntry[] = [
  { id: PANEL_IDS[0] },
  { id: PANEL_IDS[1], direction: 'right', ref: PANEL_IDS[0] },
  { id: PANEL_IDS[2], direction: 'right', ref: PANEL_IDS[1] },
];

export function PromptAuthoringWorkbenchHost() {
  return (
    <PromptAuthoringProvider>
      <GenerationCapableHost widgetId={DOCK_ID} label="Prompt Authoring">
        <PanelHostDockview
          panels={[...PANEL_IDS]}
          dockId={DOCK_ID}
          storageKey="dockview:prompt-authoring:v2"
          panelManagerId={DOCK_ID}
          layoutSpec={LAYOUT_SPEC}
          enableContextMenu
          minPanelsForTabs={2}
        />
      </GenerationCapableHost>
    </PromptAuthoringProvider>
  );
}
