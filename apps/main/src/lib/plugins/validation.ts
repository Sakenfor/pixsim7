/**
 * Plugin Family Metadata Validation
 *
 * Validates family-specific metadata requirements for plugin descriptors.
 */

import type { UnifiedPluginDescriptor } from './descriptor';

/**
 * Validation result for family-specific metadata
 */
export interface FamilyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate family-specific metadata requirements
 *
 * Each family has specific required fields:
 * - scene-view: sceneView.sceneViewId required, surfaces recommended
 * - control-center: controlCenter.controlCenterId required
 * - dock-widget: dockWidget.widgetId and dockviewId required
 * - workspace-panel: workspacePanel.panelId required
 */
export function validateFamilyMetadata(descriptor: UnifiedPluginDescriptor): FamilyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  switch (descriptor.family) {
    case 'scene-view': {
      const ext = descriptor.extensions?.sceneView;
      if (!ext?.sceneViewId) {
        errors.push('scene-view plugins require extensions.sceneView.sceneViewId');
      }
      if (!ext?.surfaces || ext.surfaces.length === 0) {
        warnings.push('scene-view plugins should define surfaces (overlay, hud, panel, workspace)');
      }
      break;
    }

    case 'control-center': {
      const ext = descriptor.extensions?.controlCenter;
      if (!ext?.controlCenterId) {
        errors.push('control-center plugins require extensions.controlCenter.controlCenterId');
      }
      break;
    }

    case 'dock-widget': {
      const ext = descriptor.extensions?.dockWidget;
      if (!ext?.widgetId) {
        errors.push('dock-widget plugins require extensions.dockWidget.widgetId');
      }
      if (!ext?.dockviewId) {
        errors.push('dock-widget plugins require extensions.dockWidget.dockviewId');
      }
      break;
    }

    case 'workspace-panel': {
      const ext = descriptor.extensions?.workspacePanel;
      if (!ext?.panelId) {
        errors.push('workspace-panel plugins require extensions.workspacePanel.panelId');
      }
      break;
    }

    case 'gizmo-surface': {
      const ext = descriptor.extensions?.gizmoSurface;
      if (!ext?.gizmoSurfaceId) {
        warnings.push('gizmo-surface plugins should define extensions.gizmoSurface.gizmoSurfaceId');
      }
      break;
    }

    // Other families have no specific requirements currently
    default:
      break;
  }

  // Common validations
  if (!descriptor.id) {
    errors.push('Plugin id is required');
  }
  if (!descriptor.name) {
    errors.push('Plugin name is required');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
