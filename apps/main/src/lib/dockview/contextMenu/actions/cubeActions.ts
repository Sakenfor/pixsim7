/**
 * Cube Actions
 *
 * Context menu action for spawning 3D cubes from any context.
 */

import { useCubeSettingsStore, useCubeStore } from '@features/cubes';
import type { CubeType } from '@features/cubes';

import type { MenuAction, MenuActionContext } from '../types';

function resolveCubeType(ctx: MenuActionContext): CubeType {
  switch (ctx.contextType) {
    case 'asset':
    case 'asset-card':
      return 'asset';
    case 'tab':
    case 'panel-content':
      return 'panel';
    default:
      return 'control';
  }
}

function resolveCubeData(ctx: MenuActionContext): Record<string, unknown> | null {
  switch (ctx.contextType) {
    case 'asset':
    case 'asset-card': {
      const asset = ctx.data?.asset ?? ctx.data;
      if (!asset?.id) return null;
      return {
        id: asset.id,
        mediaType: asset.mediaType ?? asset.media_type,
        previewUrl: asset.previewUrl ?? asset.preview_url,
      };
    }
    case 'tab':
    case 'panel-content':
      return {
        panelId: ctx.panelId ?? null,
        instanceId: ctx.instanceId ?? null,
      };
    default:
      return null;
  }
}

const spawnAsCubeAction: MenuAction = {
  id: 'cube:spawn',
  label: 'Spawn as Cube',
  icon: 'box',
  category: 'cube',
  availableIn: ['asset', 'asset-card', 'tab', 'panel-content', 'background'],
  execute: (ctx: MenuActionContext) => {
    const cubeType = resolveCubeType(ctx);
    const data = resolveCubeData(ctx);

    const id = useCubeStore.getState().addCube(cubeType, {
      x: ctx.position.x,
      y: ctx.position.y,
    });

    if (data) {
      useCubeStore.getState().updateCube(id, { data });
    }

    // Auto-show cubes if hidden
    if (!useCubeSettingsStore.getState().visible) {
      useCubeSettingsStore.getState().setVisible(true);
    }
  },
};

export const cubeActions: MenuAction[] = [spawnAsCubeAction];
