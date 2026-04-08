import { lazy } from 'react';

import { definePanel } from '../../../lib/definePanel';

const TemplateResolverPanelWrapper = lazy(
  () => import('./TemplateResolverPanelWrapper'),
);

export default definePanel({
  id: 'template-resolver',
  title: 'Template Resolver',
  component: TemplateResolverPanelWrapper,
  category: 'generation',
  panelRole: 'sub-panel',
  browsable: false,
  icon: 'code',
  description: 'Live preview of character template expansion with field source map',
  availableIn: ['character-creator', 'prompt-authoring'],
  supportsMultipleInstances: false,
});
