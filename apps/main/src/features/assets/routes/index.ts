import { lazy } from 'react';

import { defineModule } from '@app/modules/types';

export const assetDetailModule = defineModule({
  id: 'asset-detail',
  name: 'Asset Detail',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for asset detail route module.',
  featureHighlights: ['Asset detail route module now participates in shared latest-update metadata.'],
  page: {
    route: '/assets/:id',
    icon: 'image',
    description: 'View asset details',
    category: 'management',
    featureId: 'assets',
    featurePrimary: false,
    hidden: true,
    protected: true,
    showInNav: false,
    component: lazy(() => import('../../../routes/AssetDetail').then(m => ({ default: m.AssetDetailRoute }))),
  },
});
