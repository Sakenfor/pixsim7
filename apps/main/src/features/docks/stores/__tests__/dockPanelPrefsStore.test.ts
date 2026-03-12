import { beforeEach, describe, expect, it } from 'vitest';

import {
  getDockPanelPrefsSnapshot,
  useDockPanelPrefsStore,
} from '../dockPanelPrefsStore';

const CONTROL_CENTER_DOCK_ID = 'control-center';
const ASSET_VIEWER_DOCK_ID = 'asset-viewer';

describe('dockPanelPrefsStore', () => {
  beforeEach(() => {
    useDockPanelPrefsStore.setState({ panelPrefsByDock: {} });
  });

  it('stores panel preferences independently per dock', () => {
    const store = useDockPanelPrefsStore.getState();

    store.setDockPanelEnabled(CONTROL_CENTER_DOCK_ID, 'quickGenerate', true);
    store.setDockPanelEnabled(ASSET_VIEWER_DOCK_ID, 'media-preview', false);

    expect(
      getDockPanelPrefsSnapshot(useDockPanelPrefsStore.getState(), CONTROL_CENTER_DOCK_ID),
    ).toEqual({ quickGenerate: true });
    expect(
      getDockPanelPrefsSnapshot(useDockPanelPrefsStore.getState(), ASSET_VIEWER_DOCK_ID),
    ).toEqual({ 'media-preview': false });
  });

  it('replaces panel preferences for a dock with setDockPanelPrefs', () => {
    const store = useDockPanelPrefsStore.getState();

    store.setDockPanelEnabled(CONTROL_CENTER_DOCK_ID, 'quickGenerate', true);
    store.setDockPanelPrefs(CONTROL_CENTER_DOCK_ID, {
      quickGenerate: false,
      presets: true,
    });

    expect(
      getDockPanelPrefsSnapshot(useDockPanelPrefsStore.getState(), CONTROL_CENTER_DOCK_ID),
    ).toEqual({
      quickGenerate: false,
      presets: true,
    });
  });

  it('resets preferences only for the requested dock', () => {
    const store = useDockPanelPrefsStore.getState();

    store.setDockPanelEnabled(CONTROL_CENTER_DOCK_ID, 'quickGenerate', true);
    store.setDockPanelEnabled(ASSET_VIEWER_DOCK_ID, 'media-preview', true);
    store.resetDockPanelPrefs(CONTROL_CENTER_DOCK_ID);

    expect(
      getDockPanelPrefsSnapshot(useDockPanelPrefsStore.getState(), CONTROL_CENTER_DOCK_ID),
    ).toEqual({});
    expect(
      getDockPanelPrefsSnapshot(useDockPanelPrefsStore.getState(), ASSET_VIEWER_DOCK_ID),
    ).toEqual({ 'media-preview': true });
  });

  it('returns empty prefs for unknown docks', () => {
    const prefs = getDockPanelPrefsSnapshot(useDockPanelPrefsStore.getState(), 'unknown-dock');
    expect(prefs).toEqual({});
  });
});
