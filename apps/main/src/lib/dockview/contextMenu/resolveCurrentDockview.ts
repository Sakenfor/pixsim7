import { resolveDockview } from '../resolveDockview';

import type { MenuActionContext } from './types';

export function resolveCurrentDockview(ctx: MenuActionContext) {
  const dockviewId = ctx.currentDockviewId;
  const host = dockviewId ? ctx.getDockviewHost?.(dockviewId) : undefined;
  const api =
    host?.api ??
    (dockviewId ? ctx.getDockviewApi?.(dockviewId) : undefined) ??
    ctx.api;

  return resolveDockview(dockviewId, { api, host });
}

export function resolveCurrentDockviewApi(ctx: MenuActionContext) {
  return resolveCurrentDockview(ctx).api;
}
