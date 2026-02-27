export const FLOATING_ORIGIN_META_KEY = "__floatingMeta";
export const FLOATING_HOST_CONTEXT_PAYLOAD_KEY = "__pixsimFloatingContextPayload";

export type FloatingGroupRestoreDirection = "left" | "right" | "above" | "below";

export interface FloatingGroupRestoreHint {
  referenceGroupId?: string | null;
  direction?: FloatingGroupRestoreDirection | null;
}

export interface FloatingOriginMeta {
  sourceDockviewId?: string | null;
  sourceGroupId?: string | null;
  sourceDockPanelId?: string | null;
  sourcePanelId?: string | null;
  sourceGroupRestoreHint?: FloatingGroupRestoreHint | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function buildFloatingOriginMetaRecord(
  meta: FloatingOriginMeta,
): Record<typeof FLOATING_ORIGIN_META_KEY, FloatingOriginMeta> {
  return {
    [FLOATING_ORIGIN_META_KEY]: {
      sourceDockviewId: meta.sourceDockviewId ?? null,
      sourceGroupId: meta.sourceGroupId ?? null,
      sourceDockPanelId: meta.sourceDockPanelId ?? null,
      sourcePanelId: meta.sourcePanelId ?? null,
      sourceGroupRestoreHint: meta.sourceGroupRestoreHint ?? null,
    },
  };
}

export function readFloatingOriginMeta(context: unknown): FloatingOriginMeta | null {
  if (!isRecord(context)) return null;
  const raw = context[FLOATING_ORIGIN_META_KEY];
  return isRecord(raw) ? (raw as FloatingOriginMeta) : null;
}

export function stripFloatingOriginMeta(context: unknown): Record<string, unknown> | undefined {
  if (!isRecord(context)) return undefined;
  const next = { ...context };
  delete next[FLOATING_ORIGIN_META_KEY];
  return next;
}

export function readFloatingHostContextPayload(panel: unknown): Record<string, unknown> | undefined {
  if (!isRecord(panel)) return undefined;
  const direct = panel[FLOATING_HOST_CONTEXT_PAYLOAD_KEY];
  if (isRecord(direct)) return direct;
  const api = panel.api;
  if (isRecord(api)) {
    const viaApi = api[FLOATING_HOST_CONTEXT_PAYLOAD_KEY];
    if (isRecord(viaApi)) {
      return viaApi;
    }
  }
  return undefined;
}

export function setFloatingHostContextPayload(
  target: unknown,
  payload: Record<string, unknown> | undefined,
): void {
  if (!isRecord(target)) return;
  if (payload === undefined) {
    delete target[FLOATING_HOST_CONTEXT_PAYLOAD_KEY];
    return;
  }
  target[FLOATING_HOST_CONTEXT_PAYLOAD_KEY] = payload;
}

function getDockviewGroupsRaw(api: unknown): any[] {
  if (!isRecord(api)) return [];
  const rawGroups = (api as any).groups;
  if (Array.isArray(rawGroups)) return rawGroups;
  if (rawGroups && typeof rawGroups.values === "function") {
    return Array.from(rawGroups.values());
  }
  return [];
}

function getGroupRect(group: unknown): DOMRect | null {
  if (!isRecord(group)) return null;
  const element = (group as any).element;
  if (!element || typeof element.getBoundingClientRect !== "function") {
    return null;
  }
  try {
    return element.getBoundingClientRect();
  } catch {
    return null;
  }
}

export function deriveFloatingGroupRestoreHint(
  api: unknown,
  sourceGroupId: string | null | undefined,
): FloatingGroupRestoreHint | null {
  if (!sourceGroupId || !isRecord(api)) return null;

  const getGroup = (api as any).getGroup;
  const sourceGroup =
    typeof getGroup === "function"
      ? getGroup.call(api, sourceGroupId)
      : getDockviewGroupsRaw(api).find((g) => g?.id === sourceGroupId);
  const sourceRect = getGroupRect(sourceGroup);
  if (!sourceRect) return null;

  const candidates = getDockviewGroupsRaw(api).filter((group) => {
    return (
      group &&
      typeof group.id === "string" &&
      group.id !== sourceGroupId &&
      !!getGroupRect(group)
    );
  });
  if (candidates.length === 0) return null;

  const sourceCx = sourceRect.left + sourceRect.width / 2;
  const sourceCy = sourceRect.top + sourceRect.height / 2;

  let best: { id: string; dx: number; dy: number; distance2: number } | null = null;
  for (const group of candidates) {
    const rect = getGroupRect(group);
    if (!rect || typeof group.id !== "string") continue;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = sourceCx - cx;
    const dy = sourceCy - cy;
    const distance2 = dx * dx + dy * dy;
    if (!best || distance2 < best.distance2) {
      best = { id: group.id, dx, dy, distance2 };
    }
  }
  if (!best) return null;

  const direction: FloatingGroupRestoreDirection =
    Math.abs(best.dy) >= Math.abs(best.dx)
      ? best.dy < 0
        ? "above"
        : "below"
      : best.dx < 0
        ? "left"
        : "right";

  return {
    referenceGroupId: best.id,
    direction,
  };
}
