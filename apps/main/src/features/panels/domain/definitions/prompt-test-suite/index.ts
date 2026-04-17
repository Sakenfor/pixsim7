import { PromptTestSuitePanel } from '@features/panels/components/dev/PromptTestSuitePanel';

import { definePanel } from '../../../lib/definePanel';


export default definePanel({
  id: 'prompt-test-suite',
  title: 'Prompt Test Suite',
  component: PromptTestSuitePanel,
  category: 'dev',
  tags: ['dev', 'prompts', 'testing', 'variants', 'generation', 'matrix'],
  icon: 'flask',
  description: 'A/B test prompt token variants against input images',
  updatedAt: '2026-04-16T00:00:00Z',
  changeNote: 'Initial scaffold: variant × image matrix for systematic token testing.',
  featureHighlights: ['Matrix A/B testing of prompt token variants against input images.'],
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  devTool: { category: 'prompts' },
});
