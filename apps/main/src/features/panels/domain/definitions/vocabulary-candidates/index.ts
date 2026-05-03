import { VocabularyCandidatesPanel } from '@features/panels/components/dev/VocabularyCandidatesPanel';

import { definePanel } from '../../../lib/definePanel';

// Standalone hidden panel — primary surface lives as the 'Vocabulary' tab
// inside Prompt Library (see prompt-library-inspector). Keeping this entry
// registered (browsable: false) preserves direct addressability via
// openPanel({ id: 'vocabulary-candidates' }) and the float-out option from
// the inspector tab without showing it in the panel catalog.
export default definePanel({
  id: 'vocabulary-candidates',
  title: 'Vocabulary Candidates',
  component: VocabularyCandidatesPanel,
  category: 'dev',
  browsable: false,
  tags: ['vocabulary', 'tags', 'parser', 'review', 'admin'],
  icon: 'sparkles',
  description: 'Review parser keywords harvested for vocabulary growth',
  updatedAt: '2026-04-27T00:00:00Z',
  changeNote: 'Initial vocabulary harvest review panel.',
  featureHighlights: [
    'Inspect keywords matched against role lists but missing ontology mappings.',
    'Trigger LLM proposal batches and accept / reject / remap each suggestion.',
  ],
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  devTool: { category: 'debug', safeForNonDev: false },
});
