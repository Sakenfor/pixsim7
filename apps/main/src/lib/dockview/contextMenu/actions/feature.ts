import { getFeature, registerFeature } from '@lib/capabilities';

export const DOCKVIEW_ACTION_FEATURE_ID = 'panels';

export function ensureDockviewActionFeature() {
  if (getFeature(DOCKVIEW_ACTION_FEATURE_ID)) {
    return;
  }

  registerFeature({
    id: DOCKVIEW_ACTION_FEATURE_ID,
    name: 'Panels',
    description: 'Dockview panel and layout actions',
    category: 'utility',
    icon: 'layout',
  });
}
