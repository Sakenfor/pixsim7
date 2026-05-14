import { definePanel } from '../../../lib/definePanel';

import { PromptSpanInspectorPanel } from './PromptSpanInspectorPanel';

/**
 * Detached host for the prompt-composer span popover. Phase 4 of
 * `op-runtime-span-popover` plan.
 *
 * Internal/floating-only — users open this via the composer popover's
 * detach button (which calls `useWorkspaceStore.openFloatingPanel('prompt-span-inspector', ...)`),
 * not via the panel browser. The panel subscribes to `CAP_PROMPT_SPAN_FOCUS`
 * for its content + callbacks, so re-binding to a new candidate is
 * automatic when the user clicks elsewhere in the prompt.
 */
export default definePanel({
  id: 'prompt-span-inspector',
  title: 'Span Inspector',
  component: PromptSpanInspectorPanel,
  category: 'prompts',
  internal: true,
  browsable: false,
  tags: ['prompt', 'composer', 'span', 'inspector'],
  icon: 'maximize2',
  description:
    'Detached span inspector — pop-out target for the prompt-composer Matches/Adjust popover. Subscribes to the focused candidate and rebinds automatically when the user clicks a different span.',
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
