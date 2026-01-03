import type { PluginFamily, PluginOrigin } from './pluginSystem';

export type PluginRegistrationSource = 'source' | 'bundle' | 'sandbox';

export interface PluginRegistration {
  id: string;
  family: PluginFamily;
  origin: PluginOrigin;
  source: PluginRegistrationSource;
  label?: string;
  register: () => Promise<void> | void;
}
