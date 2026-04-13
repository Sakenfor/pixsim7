/**
 * Gesture surface registry.
 *
 * Surfaces (gallery cards, viewer, recent strip, …) declare themselves once
 * with their defaults and action pool; consumers read/write per-surface config
 * through the shared gesture-surface store. Adding a new surface is a single
 * `registerGestureSurface` call — no new store, no manual settings wiring.
 */

import { hmrSingleton } from '@lib/utils';

import type { GestureDirection } from './useMouseGesture';

export type GestureSurfaceId = string;

/** Allowed form of the `source` field on a surface config. */
export type GestureSurfaceSource = 'independent' | `mirror:${string}`;

export interface GestureSurfaceConfig {
  /** Source of effective config — own values or mirror another surface. */
  source: GestureSurfaceSource;
  enabled: boolean;
  threshold: number;
  edgeInset: number;
  cascadeStepPixels: number;
  gestureUp: string[];
  gestureDown: string[];
  gestureLeft: string[];
  gestureRight: string[];
  chainUp: string;
  chainDown: string;
  chainLeft: string;
  chainRight: string;
}

export interface GestureSurfaceDescriptor {
  id: GestureSurfaceId;
  label: string;
  /** Emoji or icon id for settings UI. */
  icon?: string;
  /** Settings UI ordering. */
  order?: number;
  /** Short description shown in settings UI. */
  description?: string;
  /** Defaults for this surface. `source` defaults to 'independent' when absent. */
  defaults: Omit<GestureSurfaceConfig, 'source'> & { source?: GestureSurfaceSource };
  /** Action pool this surface exposes in the settings editor. */
  actionPool: readonly { readonly id: string; readonly label: string }[];
  /** Ids of other surfaces this surface may mirror. */
  allowMirrorFrom?: GestureSurfaceId[];
}

interface Registry {
  descriptors: Map<GestureSurfaceId, GestureSurfaceDescriptor>;
  listeners: Set<() => void>;
}

const registry = hmrSingleton<Registry>('gestures:surfaceRegistry', () => ({
  descriptors: new Map(),
  listeners: new Set(),
}));

export function registerGestureSurface(descriptor: GestureSurfaceDescriptor): void {
  registry.descriptors.set(descriptor.id, descriptor);
  for (const listener of registry.listeners) listener();
}

export function getGestureSurface(id: GestureSurfaceId): GestureSurfaceDescriptor | undefined {
  return registry.descriptors.get(id);
}

export function getAllGestureSurfaces(): GestureSurfaceDescriptor[] {
  return Array.from(registry.descriptors.values()).sort(
    (a, b) => (a.order ?? 1000) - (b.order ?? 1000),
  );
}

export function subscribeGestureSurfaces(listener: () => void): () => void {
  registry.listeners.add(listener);
  return () => registry.listeners.delete(listener);
}

export function resolveSurfaceDefaults(descriptor: GestureSurfaceDescriptor): GestureSurfaceConfig {
  return {
    source: descriptor.defaults.source ?? 'independent',
    enabled: descriptor.defaults.enabled,
    threshold: descriptor.defaults.threshold,
    edgeInset: descriptor.defaults.edgeInset,
    cascadeStepPixels: descriptor.defaults.cascadeStepPixels,
    gestureUp: [...descriptor.defaults.gestureUp],
    gestureDown: [...descriptor.defaults.gestureDown],
    gestureLeft: [...descriptor.defaults.gestureLeft],
    gestureRight: [...descriptor.defaults.gestureRight],
    chainUp: descriptor.defaults.chainUp,
    chainDown: descriptor.defaults.chainDown,
    chainLeft: descriptor.defaults.chainLeft,
    chainRight: descriptor.defaults.chainRight,
  };
}

const directionKeys: Record<
  GestureDirection,
  keyof Pick<GestureSurfaceConfig, 'gestureUp' | 'gestureDown' | 'gestureLeft' | 'gestureRight'>
> = {
  up: 'gestureUp',
  down: 'gestureDown',
  left: 'gestureLeft',
  right: 'gestureRight',
};

const chainKeys: Record<
  GestureDirection,
  keyof Pick<GestureSurfaceConfig, 'chainUp' | 'chainDown' | 'chainLeft' | 'chainRight'>
> = {
  up: 'chainUp',
  down: 'chainDown',
  left: 'chainLeft',
  right: 'chainRight',
};

export function getCascadeFieldKey(
  dir: GestureDirection,
): keyof GestureSurfaceConfig {
  return directionKeys[dir];
}

export function getChainFieldKey(
  dir: GestureDirection,
): keyof GestureSurfaceConfig {
  return chainKeys[dir];
}

export function getCascadeActionsForDirection(
  cfg: Pick<GestureSurfaceConfig, 'gestureUp' | 'gestureDown' | 'gestureLeft' | 'gestureRight'>,
  dir: GestureDirection,
): string[] {
  return cfg[directionKeys[dir]];
}

export function getChainActionForDirection(
  cfg: Pick<GestureSurfaceConfig, 'chainUp' | 'chainDown' | 'chainLeft' | 'chainRight'>,
  dir: GestureDirection,
): string {
  return cfg[chainKeys[dir]];
}
