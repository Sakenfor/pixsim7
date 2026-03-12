import { beforeEach, describe, expect, it } from 'vitest';

import { getDockStateSnapshot, useDockUiStore } from '../dockUiStore';

const DOCK_ID = 'control-center';

describe('dockUiStore', () => {
  beforeEach(() => {
    useDockUiStore.setState({ docks: {} });
  });

  it('applies control-center size defaults when switching orientation', () => {
    const store = useDockUiStore.getState();

    store.setDockPosition(DOCK_ID, 'left');
    expect(getDockStateSnapshot(useDockUiStore.getState(), DOCK_ID).size).toBe(450);

    store.setDockPosition(DOCK_ID, 'bottom');
    expect(getDockStateSnapshot(useDockUiStore.getState(), DOCK_ID).size).toBe(300);
  });

  it('clamps dock size based on orientation profile', () => {
    const store = useDockUiStore.getState();

    store.setDockPosition(DOCK_ID, 'right');
    store.setDockSize(DOCK_ID, 999);
    expect(getDockStateSnapshot(useDockUiStore.getState(), DOCK_ID).size).toBe(700);

    store.setDockPosition(DOCK_ID, 'bottom');
    store.setDockSize(DOCK_ID, 10);
    expect(getDockStateSnapshot(useDockUiStore.getState(), DOCK_ID).size).toBe(200);
  });

  it('enforces floating transition behavior', () => {
    const store = useDockUiStore.getState();

    store.setDockPosition(DOCK_ID, 'floating');
    let dock = getDockStateSnapshot(useDockUiStore.getState(), DOCK_ID);
    expect(dock.open).toBe(true);

    store.setDockPinned(DOCK_ID, false);
    store.setDockPosition(DOCK_ID, 'top');
    dock = getDockStateSnapshot(useDockUiStore.getState(), DOCK_ID);
    expect(dock.open).toBe(true);
    expect(dock.pinned).toBe(true);
  });

  it('updates layout reset trigger for the dock', () => {
    const store = useDockUiStore.getState();

    const before = getDockStateSnapshot(useDockUiStore.getState(), DOCK_ID).panelLayoutResetTrigger;
    store.triggerDockLayoutReset(DOCK_ID);
    const after = getDockStateSnapshot(useDockUiStore.getState(), DOCK_ID).panelLayoutResetTrigger;

    expect(after).toBeGreaterThan(before);
  });
});
