import type { MenuActionContext } from './types';

export function resolveCurrentDockview(ctx: MenuActionContext) {
  const host = ctx.currentDockviewId ? ctx.getDockviewHost?.(ctx.currentDockviewId) : undefined;
  const api =
    host?.api ??
    (ctx.currentDockviewId ? ctx.getDockviewApi?.(ctx.currentDockviewId) : undefined) ??
    ctx.api;
  return { api, host };
}

export function resolveCurrentDockviewApi(ctx: MenuActionContext) {
  return resolveCurrentDockview(ctx).api;
}
