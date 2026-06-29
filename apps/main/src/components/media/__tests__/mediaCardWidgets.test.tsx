import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setFavoriteTag: vi.fn<(assetId: number, favorite: boolean) => Promise<void>>(
    () => Promise.resolve(),
  ),
  updateListeners: new Set<(asset: { id: number; tags?: { slug: string }[] }) => void>(),
}));

vi.mock('@features/assets/lib/assetEvents', () => ({
  assetEvents: {
    subscribe: () => () => {},
    subscribeToUpdates: (
      callback: (asset: { id: number; tags?: { slug: string }[] }) => void,
    ) => {
      mocks.updateListeners.add(callback);
      return () => mocks.updateListeners.delete(callback);
    },
    subscribeToRemovals: () => () => {},
    subscribeToResync: () => () => {},
    subscribeToRetry: () => () => {},
    subscribeToOpenToolsPanel: () => () => {},
    subscribeToViews: () => () => {},
    subscribeToPlays: () => () => {},
    subscribeToCompletions: () => () => {},
    emitAssetCreated: () => {},
    emitAssetUpdated: () => {},
    emitAssetRemoved: () => {},
    emitResync: () => {},
    emitRetryAllThumbnails: () => {},
    emitOpenToolsPanel: () => {},
    emitAssetViewed: () => {},
    emitAssetPlayed: () => {},
    emitAssetCompleted: () => {},
  },
}));

vi.mock('@features/assets/lib/favoriteTag', () => ({
  FAVORITE_TAG_SLUG: 'user:favorite',
  setFavoriteTag: (...args: Parameters<typeof mocks.setFavoriteTag>) =>
    mocks.setFavoriteTag(...args),
}));

vi.mock('@lib/icons', () => ({
  Icon: () => null,
  Icons: new Proxy({}, { get: () => () => null }),
}));

vi.mock('@pixsim7/shared.ui', () => ({
  useHoverExpand: () => ({ isExpanded: false, handlers: {} }),
  PortalFloat: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@lib/editing-core', () => ({
  createBindingFromValue: (key: string, value: unknown) => ({ key, value }),
  createBinding: (...args: unknown[]) => ({ args }),
}));

vi.mock('@lib/ui/overlay', () => ({
  BADGE_SLOT: {
    topLeft: { position: { anchor: 'top-left', offset: { x: 0, y: 0 } } },
    bottomLeft: { position: { anchor: 'bottom-left', offset: { x: 0, y: 0 } } },
  },
  BADGE_PRIORITY: {
    background: 1,
    status: 10,
    important: 15,
    interactive: 18,
    info: 20,
  },
  createBadgeWidget: (config: unknown) => config,
  createExpandableBadge: (config: unknown) => config,
  createVideoScrubWidget: (config: unknown) => config,
}));

vi.mock('@lib/widgets', () => ({
  getOverlayWidgetSettings: () => ({
    showTimeline: true,
    showTimestamp: true,
    showExtractButton: true,
    timelinePosition: 'bottom',
    throttle: 100,
    frameAccurate: false,
    muted: true,
    pauseOnLeave: true,
    hoverSound: false,
  }),
}));

vi.mock('@features/assets/lib/backendAssetId', () => ({
  assertBackendAssetId: () => {},
}));

vi.mock('@features/assets/lib/quickTag', () => ({
  applyQuickTag: () => Promise.resolve(),
  normalizeTagInput: (value: string) => value,
}));

vi.mock('@features/assets/lib/quickTagStore', () => ({
  useQuickTagStore: () => ({
    defaultTags: [],
    recentTags: [],
    toggleDefaultTag: () => {},
    addRecentTag: () => {},
  }),
}));

vi.mock('@features/assets/lib/tagSource', () => ({
  getTagSourceMeta: () => ({ icon: 'tag', iconClass: '' }),
}));

vi.mock('@features/assets/lib/useTagAutocomplete', () => ({
  TAG_NAMESPACES: ['user'],
  useTagAutocomplete: () => ({ suggestions: [], activeIndex: -1, setActiveIndex: () => {} }),
}));

vi.mock('@features/generation/components/generationSettingsPanel/constants', () => ({
  PROVIDER_BRANDS: {},
}));

vi.mock('@features/providers', () => ({
  providerCapabilityRegistry: {
    getCapability: () => null,
  },
  useModelBadgeStore: (
    selector: (state: { showOnMediaCards: boolean; colors: Record<string, string> }) => unknown,
  ) => selector({ showOnMediaCards: false, colors: {} }),
}));

vi.mock('../mediaCardBadges', () => ({
  createQueueStatusWidget: () => null,
  createSelectionStatusWidget: () => null,
}));

vi.mock('../mediaCardGeneration', () => ({
  createGenerationButtonGroup: () => null,
  createGenerationActionModeBadge: () => null,
  createGenerationStatusWidget: () => null,
  GenerationButtonGroupContent: () => null,
}));

vi.mock('../mediaCardRuntimeWidgetBuilder', () => ({
  buildMediaCardRuntimeWidgets: () => [],
}));

vi.mock('../similarityBadge', () => ({
  createSimilarityBadge: () => null,
}));

vi.mock('../SlotPicker', () => ({
  getSmartActionLabel: () => '',
  resolveMaxSlotsFromSpecs: () => 0,
  resolveMaxSlotsForModel: () => 0,
  SlotPickerContent: () => null,
  SlotPickerGrid: () => null,
}));

vi.mock('../videoMarksStore', () => ({
  useVideoMarksStore: {
    getState: () => ({
      activeAssetId: null,
      setActive: () => {},
      setCurrentTime: () => {},
      setDuration: () => {},
      setSeekFn: () => {},
      setSelected: () => {},
    }),
  },
}));

import { createFavoriteWidget, type MediaCardOverlayData } from '../mediaCardWidgets';

function favoriteData(id: number, isFavorite = false): MediaCardOverlayData {
  return {
    id,
    mediaType: 'image',
    providerId: 'local',
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    uploadState: 'idle',
    uploadProgress: 0,
    remoteUrl: '',
    isFavorite,
  } as MediaCardOverlayData;
}

beforeEach(() => {
  mocks.setFavoriteTag.mockClear();
  mocks.updateListeners.clear();
});

afterEach(() => {
  cleanup();
});

describe('createFavoriteWidget', () => {
  it('resets optimistic favorite state when the same widget is reused for another asset', async () => {
    const widget = createFavoriteWidget();
    const { rerender } = render(<>{widget.render(favoriteData(1, false))}</>);

    const initialButton = screen.getByRole('button', { name: 'Add to favorites' });
    expect(initialButton.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(initialButton);

    expect(mocks.setFavoriteTag).toHaveBeenCalledWith(1, true);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');

    rerender(<>{widget.render(favoriteData(2, false))}</>);

    await waitFor(() => {
      expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('false');
    });
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Add to favorites');
  });
});
