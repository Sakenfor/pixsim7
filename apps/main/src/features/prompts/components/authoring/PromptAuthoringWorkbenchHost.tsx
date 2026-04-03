/**
 * PromptAuthoringWorkbenchHost
 *
 * Top-level component for the standalone Prompt Authoring panel.
 * Wraps QuickGenWidget + PromptAuthoringProvider + PanelHostDockview.
 *
 * The panel definition has `consumesCapabilities: ['generation:scope']` which provides the
 * generation scope. QuickGenWidget owns that scope and capability bridge;
 * PromptAuthoringProvider lives inside it so authoring text uses the same
 * canonical generation prompt state as quickgen.
 */

import { useCallback } from 'react';

import { QuickGenWidget } from '@features/generation';
import { PanelHostDockview, type LayoutSpecEntry } from '@features/panels/components/host/PanelHostDockview';

import { PromptAuthoringProvider } from '../../context/PromptAuthoringContext';

import {
  PROMPT_AUTHORING_DOCK_ID,
  PROMPT_AUTHORING_QUICKGEN_DOCK_ID,
  PROMPT_AUTHORING_QUICKGEN_PANEL_IDS,
} from './promptAuthoringIds';

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

// Embedded QuickGen panel host is always hidden — authoring toolbar opens
// asset/settings as floating panels instead. isOpen/setOpen kept for
// QuickGenWidget's CAP_GENERATION_WIDGET protocol compliance.
const NOOP_SET_OPEN = () => {};

export function PromptAuthoringWorkbenchHost() {
  // Stable noop — QuickGenWidget requires setOpen but nothing in the
  // authoring flow calls it (toolbar uses floating panels directly).
  const setOpen = useCallback(NOOP_SET_OPEN, []);

  return (
    <QuickGenWidget
      widgetId={PROMPT_AUTHORING_DOCK_ID}
      label="Prompt Authoring"
      panelManagerId={PROMPT_AUTHORING_QUICKGEN_DOCK_ID}
      panelIds={PROMPT_AUTHORING_QUICKGEN_PANEL_IDS}
      priority={5}
      isOpen={false}
      setOpen={setOpen}
      contextExposure="mounted"
      storageKeyPrefix="prompt-authoring-quickgen"
      className="h-full flex flex-col"
      panelHostClassName="hidden"
      minPanelsForTabs={2}
    >
      {() => (
        <PromptAuthoringProvider>
          <PanelHostDockview
            panels={[...PANEL_IDS]}
            dockId={PROMPT_AUTHORING_DOCK_ID}
            hostSettingScopes={['generation']}
            storageKey="dockview:prompt-authoring:v2"
            panelManagerId={PROMPT_AUTHORING_DOCK_ID}
            layoutSpec={LAYOUT_SPEC}
            enableContextMenu
            minPanelsForTabs={2}
            className="flex-1 min-h-0"
          />
        </PromptAuthoringProvider>
      )}
    </QuickGenWidget>
  );
}
