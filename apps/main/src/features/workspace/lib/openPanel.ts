import type { WorkspaceActions } from "../stores/workspaceStore";
import { useWorkspaceStore } from "../stores/workspaceStore";

import { panelPlacementCoordinator } from "./panelPlacementCoordinator";

type FloatingOpenOptions = Parameters<WorkspaceActions["openFloatingPanel"]>[1];

/**
 * Open/focus a panel in the workspace dockview.
 * Falls back to floating behavior via workspace store when dockview is unavailable.
 */
export function openWorkspacePanel(panelId: string): void {
  useWorkspaceStore.getState().restorePanel(panelId);
}

/**
 * Open a panel as a floating workspace window.
 */
export function openFloatingWorkspacePanel(
  panelId: string,
  options?: FloatingOpenOptions,
): void {
  panelPlacementCoordinator.openFloatingPanel(panelId, options);
}

// ── Entity navigation helpers ────────────────────────────────────
// Typed recipes for "open panel X, land on section Y, focus entity Z".
// Single-instance panels are focused if already open; context is merged.

/** Open the Plans panel and navigate to a specific plan. */
export function navigateToPlan(planId: string): void {
  try { localStorage.setItem('plans-panel:nav', `plan:${planId}`); } catch { /* */ }
  useWorkspaceStore.getState().openFloatingPanel('plans', {
    width: 900,
    height: 600,
    context: { targetPlanId: planId },
  });
}

/** Open the AI Assistant panel with a new chat tab scoped to a plan. */
export function navigateToAssistantWithPlan(planId: string, planTitle?: string): void {
  useWorkspaceStore.getState().restorePanel('ai-assistant');
  window.dispatchEvent(new CustomEvent('ai-assistant:open-plan-chat', {
    detail: { planId, planTitle },
  }));
}

/** Open the Agent Observability panel and expand a specific agent profile. */
export function navigateToAgentProfile(agentId: string): void {
  try { localStorage.setItem('agent-observability:nav', 'agents'); } catch { /* */ }
  useWorkspaceStore.getState().openFloatingPanel('agent-observability', {
    width: 900,
    height: 600,
    context: { focusAgentId: agentId },
  });
}
