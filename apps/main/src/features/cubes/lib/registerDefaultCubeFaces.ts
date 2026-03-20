/**
 * Register Default Cube Faces
 *
 * Registers the 6 built-in faces (4 equatorial + top + bottom) with the
 * default cube face registry. Called during module initialization.
 */

import { PanelsCarouselFace } from '../components/faces/PanelsCarouselFace';
import { QuickLauncherFace } from '../components/faces/QuickLauncherFace';

import { cubeFaceRegistry } from './cubeFaceRegistry';

export function registerDefaultCubeFaces(): void {
  cubeFaceRegistry.register({
    id: 'panels',
    icon: 'layoutGrid',
    label: 'Panels',
    position: 'equatorial',
    component: PanelsCarouselFace,
    order: 0,
  });

  cubeFaceRegistry.register({
    id: 'launcher',
    icon: 'zap',
    label: 'Launch',
    position: 'equatorial',
    component: QuickLauncherFace,
    portalClassName: 'bg-neutral-900/95 backdrop-blur-md border border-neutral-700 rounded-lg shadow-2xl overflow-hidden',
    order: 1,
  });

  cubeFaceRegistry.register({
    id: 'pinned',
    icon: 'pin',
    label: 'Pinned',
    position: 'equatorial',
    placeholder: 'Pinned items — coming soon',
    order: 2,
  });

  cubeFaceRegistry.register({
    id: 'recent',
    icon: 'clock',
    label: 'Recent',
    position: 'equatorial',
    placeholder: 'Recent history — coming soon',
    order: 3,
  });

  cubeFaceRegistry.register({
    id: 'top',
    icon: 'star',
    label: 'Favorites',
    position: 'top',
    placeholder: 'Favorites — coming soon',
  });

  cubeFaceRegistry.register({
    id: 'bottom',
    icon: 'settings',
    label: 'Settings',
    position: 'bottom',
    placeholder: 'Settings — coming soon',
  });
}
