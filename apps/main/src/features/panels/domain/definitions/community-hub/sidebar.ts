import type { ComponentType } from 'react';

import type { IconName } from '@lib/icons';

import { BrowseView } from './views/BrowseView';
import { ChatView } from './views/ChatView';
import { PackagesView } from './views/PackagesView';

// ---------------------------------------------------------------------------
// View registry — add entries here to extend the hub
// ---------------------------------------------------------------------------

export interface CommunityView {
  id: string;
  label: string;
  icon: IconName;
  component: ComponentType;
}

export const COMMUNITY_VIEWS: CommunityView[] = [
  {
    id: 'browse',
    label: 'Browse',
    icon: 'search',
    component: BrowseView,
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: 'prompt', // MessageSquare
    component: ChatView,
  },
  {
    id: 'packages',
    label: 'Packages',
    icon: 'package',
    component: PackagesView,
  },
];

export const DEFAULT_VIEW_ID = 'browse';
