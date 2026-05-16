import type { ComponentType } from 'react';

import type { IconName } from '@lib/icons';

import { AccountView } from './views/AccountView';
import { BrowseView } from './views/BrowseView';
import { ChatView } from './views/ChatView';
import { PackagesView } from './views/PackagesView';
import { ProfileView } from './views/ProfileView';

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
  {
    id: 'account',
    label: 'Account',
    icon: 'user',
    component: AccountView,
  },
  {
    // Bridge identity + review-delegation management (not personal profile).
    id: 'access',
    label: 'Access',
    icon: 'shield',
    component: ProfileView,
  },
];

export const DEFAULT_VIEW_ID = 'browse';
