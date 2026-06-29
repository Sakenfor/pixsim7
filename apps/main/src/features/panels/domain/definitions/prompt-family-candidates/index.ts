import { definePanel } from '../../../lib/definePanel';

import { PromptFamilyCandidatesPanel } from './PromptFamilyCandidatesPanel';

export { PromptFamilyCandidatesPanel };

// Standalone hidden panel — primary surface lives as the 'Families' tab inside
// Prompt Library (see prompt-library-inspector). Keeping this entry registered
// (browsable: false) preserves direct addressability via
// openPanel({ id: 'prompt-family-candidates' }) and the float-out option from
// the inspector tab without adding another entry to the panel catalog. Mirrors
// the vocabulary-candidates pattern.
export default definePanel({
  id: 'prompt-family-candidates',
  title: 'Prompt Family Candidates',
  component: PromptFamilyCandidatesPanel,
  category: 'generation',
  browsable: false,
  panelRole: 'reference',
  tags: ['prompts', 'families', 'clustering', 'duplicates', 'review', 'library'],
  icon: 'layers',
  description:
    'Review clusters of near-duplicate / minor-tweak prompt versions and group them into families.',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
