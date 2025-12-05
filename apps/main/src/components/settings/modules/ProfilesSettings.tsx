/**
 * Profiles Settings Module
 *
 * Wrapper for WorkspaceProfileManager to register it in the settings registry.
 */
import { WorkspaceProfileManager } from '../WorkspaceProfileManager';
import { settingsRegistry } from '@/lib/settingsRegistry';

export function ProfilesSettings() {
  return <WorkspaceProfileManager />;
}

// Register this module
settingsRegistry.register({
  id: 'profiles',
  label: 'Profiles',
  component: ProfilesSettings,
  order: 30,
});
