/**
 * Pure model helpers for the hotspot editor (no React).
 *
 * Sibling of HotspotListEditor.tsx, mirroring the
 * roomNavigationEditorModel.ts split so the component file only exports
 * components (react-refresh constraint).
 */
import { gameActionRegistry } from '@pixsim7/game.engine';

import type { GameHotspotDTO } from '@lib/api/game';

export interface HotspotValidationIssue {
  index: number;
  message: string;
}

/**
 * Validate hotspot rows before save. Returns one issue per problem so the
 * caller can block save and show the author exactly what to fix (instead of
 * silently dropping incomplete rows).
 */
export function validateHotspots(hotspots: GameHotspotDTO[]): HotspotValidationIssue[] {
  const issues: HotspotValidationIssue[] = [];
  const seenIds = new Map<string, number>();

  hotspots.forEach((hotspot, index) => {
    const label = hotspot.hotspot_id?.trim() ? `"${hotspot.hotspot_id}"` : `#${index + 1}`;

    if (!hotspot.hotspot_id?.trim()) {
      issues.push({ index, message: `Hotspot ${label} needs an id.` });
    } else {
      const firstIndex = seenIds.get(hotspot.hotspot_id);
      if (firstIndex != null) {
        issues.push({
          index,
          message: `Hotspot ${label} duplicates the id of hotspot #${firstIndex + 1}.`,
        });
      } else {
        seenIds.set(hotspot.hotspot_id, index);
      }
    }

    const target = hotspot.target;
    const hasMesh = !!target?.mesh?.object_name?.trim();
    const rect = target?.rect2d;
    if (!hasMesh && !rect) {
      issues.push({
        index,
        message: `Hotspot ${label} needs a target (mesh name or 2D rect).`,
      });
    }
    if (rect) {
      const values = [rect.x, rect.y, rect.w, rect.h];
      if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
        issues.push({
          index,
          message: `Hotspot ${label} has an incomplete 2D rect (x, y, w, h are required numbers).`,
        });
      }
    }

    const action = hotspot.action;
    if (action) {
      const meta = gameActionRegistry.getOrNull((action as { type?: string }).type ?? '');
      if (!meta) {
        issues.push({
          index,
          message: `Hotspot ${label} has unknown action type "${(action as { type?: string }).type ?? ''}".`,
        });
      } else {
        const requiredValue = (action as unknown as Record<string, unknown>)[meta.requiredField];
        const numeric = typeof requiredValue === 'number' ? requiredValue : Number(requiredValue);
        if (requiredValue == null || requiredValue === '' || Number.isNaN(numeric)) {
          issues.push({
            index,
            message: `Hotspot ${label}: action "${meta.label}" needs ${meta.requiredField}.`,
          });
        }
      }
    }
  });

  return issues;
}
