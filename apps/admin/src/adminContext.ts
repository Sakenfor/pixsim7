import { createContext, useContext } from 'react';

import type {
  BuildableDefinition,
  CodegenTask,
  LauncherSettings,
  ServiceDefinition,
  ServiceState,
} from './lib/types';

export type LoadState = 'idle' | 'loading' | 'error';

export interface AdminContextValue {
  services: ServiceState[];
  servicesState: LoadState;
  servicesError: string;
  refreshServices: () => Promise<void>;
  startService: (serviceKey: string) => Promise<void>;
  stopService: (serviceKey: string) => Promise<void>;
  restartService: (serviceKey: string) => Promise<void>;
  startAllServices: () => Promise<void>;
  stopAllServices: () => Promise<void>;
  lastServicesRefresh: Date | null;

  serviceDefinitions: Record<string, ServiceDefinition>;
  serviceDefinitionState: Record<string, LoadState>;
  serviceDefinitionErrors: Record<string, string>;
  refreshServiceDefinition: (serviceKey: string) => Promise<void>;

  buildables: BuildableDefinition[];
  buildablesState: LoadState;
  buildablesError: string;
  refreshBuildables: () => Promise<void>;

  codegenTasks: CodegenTask[];
  codegenState: LoadState;
  codegenError: string;
  refreshCodegenTasks: () => Promise<void>;

  settings: LauncherSettings | null;
  settingsDraft: LauncherSettings | null;
  settingsState: LoadState;
  settingsError: string;
  settingsDirty: boolean;
  refreshSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  resetSettingsDraft: () => void;
  updateLoggingDraft: (
    key: keyof LauncherSettings['logging'],
    value: LauncherSettings['logging'][keyof LauncherSettings['logging']],
  ) => void;
  updateDatastoreDraft: (
    key: keyof LauncherSettings['datastores'],
    value: LauncherSettings['datastores'][keyof LauncherSettings['datastores']],
  ) => void;
  updatePortsDraft: (
    key: keyof LauncherSettings['ports'],
    value: LauncherSettings['ports'][keyof LauncherSettings['ports']],
  ) => void;
  updateBaseUrlDraft: (
    key: keyof LauncherSettings['base_urls'],
    value: LauncherSettings['base_urls'][keyof LauncherSettings['base_urls']],
  ) => void;
  updateAdvancedDraft: (
    key: keyof LauncherSettings['advanced'],
    value: LauncherSettings['advanced'][keyof LauncherSettings['advanced']],
  ) => void;
  updateProfileDraft: (value: string) => void;

  selectedServiceKey: string | null;
  setSelectedServiceKey: (value: string | null) => void;

  copyCommand: (command: string, args?: string[]) => Promise<void>;
}

export const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdminContext(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) {
    throw new Error('AdminContext is not available');
  }
  return ctx;
}
