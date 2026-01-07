import type { Module } from '@app/modules/types';

export const assetDetailModule: Module = {
  id: 'asset-detail',
  name: 'Asset Detail',
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
  },
};
