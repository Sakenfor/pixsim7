/**
 * Register Tool Operations (Legacy)
 *
 * @deprecated Use lib/gizmos/console instead. The gizmos feature now owns its console commands.
 *
 * This file is kept for backwards compatibility and re-exports from the canonical location.
 */

// Re-export from gizmos (canonical location)
export { useToolConsoleStore, registerGizmoConsole as registerToolOps } from '@/gizmos/console';
