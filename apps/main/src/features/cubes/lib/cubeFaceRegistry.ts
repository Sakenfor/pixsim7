/**
 * Cube Face Registry
 *
 * Registry for pluggable cube face definitions. Each face registers an ID,
 * icon, label, position (equatorial / top / bottom), and an optional React
 * component that renders the face's expanded content.
 *
 * Topology: max 4 equatorial faces, max 1 top, max 1 bottom (it's a cube).
 */

import type { ComponentType } from 'react';

import { hmrSingleton } from '@lib/utils/hmrSafe';

// ── Types ──

export type CubeFacePosition = 'equatorial' | 'top' | 'bottom';

/** Props every face component receives. */
export interface CubeFaceComponentProps {
  cubeInstanceId: string;
  isExpanded: boolean;
}

export interface CubeFaceDefinition {
  /** Unique face ID — used as activeFace value. */
  id: string;
  icon: string;
  label: string;
  position: CubeFacePosition;
  /** Component rendered in the PortalFloat when this face is active + expanded. */
  component?: ComponentType<CubeFaceComponentProps>;
  /** Fallback text shown when no component is provided. */
  placeholder?: string;
  /** Sort order within position group (lower = first). Default 0. */
  order?: number;
  /** Optional className applied to the PortalFloat wrapper. */
  portalClassName?: string;
}

// ── Limits ──

const MAX_EQUATORIAL = 4;
const MAX_TOP = 1;
const MAX_BOTTOM = 1;

// ── Registry class ──

type Listener = () => void;

export class CubeFaceRegistry {
  private faces = new Map<string, CubeFaceDefinition>();
  private revision = 0;
  private listeners = new Set<Listener>();

  register(def: CubeFaceDefinition): void {
    // Validate topology limits (only when adding a NEW face)
    if (!this.faces.has(def.id)) {
      const count = this.countByPosition(def.position);
      const max =
        def.position === 'equatorial' ? MAX_EQUATORIAL
        : def.position === 'top' ? MAX_TOP
        : MAX_BOTTOM;
      if (count >= max) {
        console.warn(
          `[CubeFaceRegistry] Cannot register face "${def.id}": max ${max} ${def.position} face(s) reached`,
        );
        return;
      }
    }
    this.faces.set(def.id, { order: 0, ...def });
    this.bump();
  }

  unregister(id: string): void {
    if (this.faces.delete(id)) this.bump();
  }

  get(id: string): CubeFaceDefinition | undefined {
    return this.faces.get(id);
  }

  has(id: string): boolean {
    return this.faces.has(id);
  }

  /** Equatorial faces sorted by order. */
  getEquatorial(): CubeFaceDefinition[] {
    return [...this.faces.values()]
      .filter((f) => f.position === 'equatorial')
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  getTop(): CubeFaceDefinition | undefined {
    return [...this.faces.values()].find((f) => f.position === 'top');
  }

  getBottom(): CubeFaceDefinition | undefined {
    return [...this.faces.values()].find((f) => f.position === 'bottom');
  }

  getAll(): CubeFaceDefinition[] {
    return [...this.faces.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  /** True if `id` is an equatorial face. */
  isEquatorial(id: string): boolean {
    return this.faces.get(id)?.position === 'equatorial';
  }

  /** Index of an equatorial face by its ID (or 0 if not found). */
  equatorialIndex(id: string): number {
    const eq = this.getEquatorial();
    const idx = eq.findIndex((f) => f.id === id);
    return idx >= 0 ? idx : 0;
  }

  clear(): void {
    this.faces.clear();
    this.bump();
  }

  // ── useSyncExternalStore integration ──

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): number => this.revision;

  // ── Internal ──

  private countByPosition(pos: CubeFacePosition): number {
    let n = 0;
    for (const f of this.faces.values()) if (f.position === pos) n++;
    return n;
  }

  private bump(): void {
    this.revision++;
    for (const fn of this.listeners) fn();
  }
}

/** Default singleton — used by the built-in cube widget. */
export const cubeFaceRegistry = hmrSingleton('cubeFaceRegistry', () => new CubeFaceRegistry());
