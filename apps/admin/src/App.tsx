import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DockviewReadyEvent } from 'dockview';
import { SmartDockviewBase } from '@pixsim7/shared.ui.dockview';

import { AdminContext, type AdminContextValue, type LoadState } from './adminContext';
import {
  getBuildables,
  getCodegenTasks,
  getServiceDefinition,
  getServices,
  getSettings,
  restartService,
  startAllServices,
  startService,
  stopAllServices,
  stopService,
  updateSettings,
} from './lib/api';
import type {
  BuildableDefinition,
  CodegenTask,
  LauncherSettings,
  ServiceDefinition,
  ServiceState,
} from './lib/types';
import { BuildablesPanel } from './panels/BuildablesPanel';
import { CodegenPanel } from './panels/CodegenPanel';
import { ServiceInspectorPanel } from './panels/ServiceInspectorPanel';
import { ServicesPanel } from './panels/ServicesPanel';
import { SettingsPanel } from './panels/SettingsPanel';

const DOCKVIEW_STORAGE_KEY = 'dockview:admin:v1';

export default function App() {
  const [services, setServices] = useState<ServiceState[]>([]);
  const [serviceDefinitions, setServiceDefinitions] = useState<Record<string, ServiceDefinition>>({});
  const [serviceDefinitionState, setServiceDefinitionState] = useState<Record<string, LoadState>>({});
  const [serviceDefinitionErrors, setServiceDefinitionErrors] = useState<Record<string, string>>({});
  const [buildables, setBuildables] = useState<BuildableDefinition[]>([]);
  const [codegenTasks, setCodegenTasks] = useState<CodegenTask[]>([]);
  const [settings, setSettings] = useState<LauncherSettings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<LauncherSettings | null>(null);

  const [servicesState, setServicesState] = useState<LoadState>('idle');
  const [buildablesState, setBuildablesState] = useState<LoadState>('idle');
  const [codegenState, setCodegenState] = useState<LoadState>('idle');
  const [settingsState, setSettingsState] = useState<LoadState>('idle');

  const [servicesError, setServicesError] = useState('');
  const [buildablesError, setBuildablesError] = useState('');
  const [codegenError, setCodegenError] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [selectedServiceKey, setSelectedServiceKey] = useState<string | null>(null);
  const [lastServicesRefresh, setLastServicesRefresh] = useState<Date | null>(null);

  const refreshServices = useCallback(async () => {
    setServicesState('loading');
    setServicesError('');
    try {
      const response = await getServices();
      setServices(response.services);
      setSelectedServiceKey((prev) => {
        if (!response.services.length) {
          return null;
        }
        if (prev && response.services.some((service) => service.key === prev)) {
          return prev;
        }
        return response.services[0].key;
      });
      setLastServicesRefresh(new Date());
      setServicesState('idle');
    } catch (error) {
      setServicesError(error instanceof Error ? error.message : 'Failed to load services');
      setServicesState('error');
    }
  }, []);

  const refreshServiceDefinition = useCallback(async (serviceKey: string) => {
    setServiceDefinitionState((prev) => ({ ...prev, [serviceKey]: 'loading' }));
    setServiceDefinitionErrors((prev) => ({ ...prev, [serviceKey]: '' }));
    try {
      const response = await getServiceDefinition(serviceKey);
      setServiceDefinitions((prev) => ({ ...prev, [serviceKey]: response }));
      setServiceDefinitionState((prev) => ({ ...prev, [serviceKey]: 'idle' }));
    } catch (error) {
      setServiceDefinitionErrors((prev) => ({
        ...prev,
        [serviceKey]: error instanceof Error ? error.message : 'Failed to load service definition',
      }));
      setServiceDefinitionState((prev) => ({ ...prev, [serviceKey]: 'error' }));
    }
  }, []);

  const refreshBuildables = useCallback(async () => {
    setBuildablesState('loading');
    setBuildablesError('');
    try {
      const response = await getBuildables();
      setBuildables(response.buildables);
      setBuildablesState('idle');
    } catch (error) {
      setBuildablesError(error instanceof Error ? error.message : 'Failed to load buildables');
      setBuildablesState('error');
    }
  }, []);

  const refreshCodegenTasks = useCallback(async () => {
    setCodegenState('loading');
    setCodegenError('');
    try {
      const response = await getCodegenTasks();
      setCodegenTasks(response.tasks);
      setCodegenState('idle');
    } catch (error) {
      setCodegenError(error instanceof Error ? error.message : 'Failed to load codegen tasks');
      setCodegenState('error');
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    setSettingsState('loading');
    setSettingsError('');
    try {
      const response = await getSettings();
      setSettings(response);
      setSettingsDraft(response);
      setSettingsState('idle');
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'Failed to load settings');
      setSettingsState('error');
    }
  }, []);

  useEffect(() => {
    refreshServices();
    refreshBuildables();
    refreshCodegenTasks();
    refreshSettings();
  }, [refreshBuildables, refreshCodegenTasks, refreshServices, refreshSettings]);

  const startServiceAction = useCallback(
    async (serviceKey: string) => {
      try {
        await startService(serviceKey);
        await refreshServices();
      } catch (error) {
        setServicesError(error instanceof Error ? error.message : 'Service action failed');
      }
    },
    [refreshServices],
  );

  const stopServiceAction = useCallback(
    async (serviceKey: string) => {
      try {
        await stopService(serviceKey);
        await refreshServices();
      } catch (error) {
        setServicesError(error instanceof Error ? error.message : 'Service action failed');
      }
    },
    [refreshServices],
  );

  const restartServiceAction = useCallback(
    async (serviceKey: string) => {
      try {
        await restartService(serviceKey);
        await refreshServices();
      } catch (error) {
        setServicesError(error instanceof Error ? error.message : 'Service action failed');
      }
    },
    [refreshServices],
  );

  const startAllServicesAction = useCallback(async () => {
    try {
      await startAllServices();
      await refreshServices();
    } catch (error) {
      setServicesError(error instanceof Error ? error.message : 'Bulk action failed');
    }
  }, [refreshServices]);

  const stopAllServicesAction = useCallback(async () => {
    try {
      await stopAllServices();
      await refreshServices();
    } catch (error) {
      setServicesError(error instanceof Error ? error.message : 'Bulk action failed');
    }
  }, [refreshServices]);

  const copyCommand = useCallback(async (command: string, args: string[] = []) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    const commandLine = [command, ...args].join(' ');
    try {
      await navigator.clipboard.writeText(commandLine);
    } catch (error) {
      console.warn('Clipboard unavailable', error);
    }
  }, []);

  const saveSettings = useCallback(async () => {
    if (!settingsDraft) {
      return;
    }
    setSettingsState('loading');
    setSettingsError('');
    try {
      const updated = await updateSettings({
        logging: settingsDraft.logging,
        datastores: settingsDraft.datastores,
        ports: settingsDraft.ports,
        base_urls: settingsDraft.base_urls,
        advanced: settingsDraft.advanced,
        profiles: { active: settingsDraft.profiles.active },
      });
      setSettings(updated);
      setSettingsDraft(updated);
      setSettingsState('idle');
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'Failed to update settings');
      setSettingsState('error');
    }
  }, [settingsDraft]);

  const resetSettingsDraft = useCallback(() => {
    if (settings) {
      setSettingsDraft(settings);
    }
  }, [settings]);

  const settingsDirty = useMemo(() => {
    if (!settings || !settingsDraft) {
      return false;
    }
    return JSON.stringify(settings) !== JSON.stringify(settingsDraft);
  }, [settings, settingsDraft]);

  const updateLoggingDraft = useCallback(
    (
      key: keyof LauncherSettings['logging'],
      value: LauncherSettings['logging'][keyof LauncherSettings['logging']],
    ) => {
      if (!settingsDraft) {
        return;
      }
      setSettingsDraft({
        ...settingsDraft,
        logging: { ...settingsDraft.logging, [key]: value },
      });
    },
    [settingsDraft],
  );

  const updateDatastoreDraft = useCallback(
    (
      key: keyof LauncherSettings['datastores'],
      value: LauncherSettings['datastores'][keyof LauncherSettings['datastores']],
    ) => {
      if (!settingsDraft) {
        return;
      }
      setSettingsDraft({
        ...settingsDraft,
        datastores: { ...settingsDraft.datastores, [key]: value },
      });
    },
    [settingsDraft],
  );

  const updatePortsDraft = useCallback(
    (
      key: keyof LauncherSettings['ports'],
      value: LauncherSettings['ports'][keyof LauncherSettings['ports']],
    ) => {
      if (!settingsDraft) {
        return;
      }
      setSettingsDraft({
        ...settingsDraft,
        ports: { ...settingsDraft.ports, [key]: Number(value) },
      });
    },
    [settingsDraft],
  );

  const updateBaseUrlDraft = useCallback(
    (
      key: keyof LauncherSettings['base_urls'],
      value: LauncherSettings['base_urls'][keyof LauncherSettings['base_urls']],
    ) => {
      if (!settingsDraft) {
        return;
      }
      setSettingsDraft({
        ...settingsDraft,
        base_urls: { ...settingsDraft.base_urls, [key]: String(value) },
      });
    },
    [settingsDraft],
  );

  const updateAdvancedDraft = useCallback(
    (
      key: keyof LauncherSettings['advanced'],
      value: LauncherSettings['advanced'][keyof LauncherSettings['advanced']],
    ) => {
      if (!settingsDraft) {
        return;
      }
      setSettingsDraft({
        ...settingsDraft,
        advanced: { ...settingsDraft.advanced, [key]: String(value) },
      });
    },
    [settingsDraft],
  );

  const updateProfileDraft = useCallback((value: string) => {
    if (!settingsDraft) {
      return;
    }
    setSettingsDraft({
      ...settingsDraft,
      profiles: { ...settingsDraft.profiles, active: value },
    });
  }, [settingsDraft]);

  const runningCount = useMemo(
    () => services.filter((service) => service.status === 'running' || service.status === 'starting').length,
    [services],
  );
  const healthyCount = useMemo(
    () => services.filter((service) => service.health === 'healthy').length,
    [services],
  );

  const dockComponents = useMemo(
    () => ({
      services: ServicesPanel,
      serviceInspector: ServiceInspectorPanel,
      buildables: BuildablesPanel,
      codegen: CodegenPanel,
      settings: SettingsPanel,
    }),
    [],
  );

  const defaultLayout = useCallback((api: DockviewReadyEvent['api']) => {
    api.addPanel({
      id: 'services',
      component: 'services',
      title: 'Services',
    });
    api.addPanel({
      id: 'serviceInspector',
      component: 'serviceInspector',
      title: 'Service Focus',
      position: { referencePanel: 'services', direction: 'within' },
    });
    api.addPanel({
      id: 'buildables',
      component: 'buildables',
      title: 'Buildables',
      position: { referencePanel: 'services', direction: 'right' },
    });
    api.addPanel({
      id: 'codegen',
      component: 'codegen',
      title: 'Codegen',
      position: { referencePanel: 'buildables', direction: 'below' },
    });
    api.addPanel({
      id: 'settings',
      component: 'settings',
      title: 'Settings',
      position: { referencePanel: 'codegen', direction: 'below' },
    });
  }, []);

  const contextValue: AdminContextValue = {
    services,
    servicesState,
    servicesError,
    refreshServices,
    startService: startServiceAction,
    stopService: stopServiceAction,
    restartService: restartServiceAction,
    startAllServices: startAllServicesAction,
    stopAllServices: stopAllServicesAction,
    lastServicesRefresh,
    serviceDefinitions,
    serviceDefinitionState,
    serviceDefinitionErrors,
    refreshServiceDefinition,
    buildables,
    buildablesState,
    buildablesError,
    refreshBuildables,
    codegenTasks,
    codegenState,
    codegenError,
    refreshCodegenTasks,
    settings,
    settingsDraft,
    settingsState,
    settingsError,
    settingsDirty,
    refreshSettings,
    saveSettings,
    resetSettingsDraft,
    updateLoggingDraft,
    updateDatastoreDraft,
    updatePortsDraft,
    updateBaseUrlDraft,
    updateAdvancedDraft,
    updateProfileDraft,
    selectedServiceKey,
    setSelectedServiceKey,
    copyCommand,
  };

  return (
    <div className="app-shell">
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <p className="section-title">PixSim Admin Console</p>
            <h1 className="text-4xl font-semibold text-[var(--ink)]">
              Launcher status, buildables, and shared settings
            </h1>
            <p className="max-w-2xl text-sm text-[var(--ink-muted)]">
              A single surface for local control and remote-ready admin tasks. Changes to launcher settings apply on
              restart of affected services.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <span className="status-pill">{runningCount}/{services.length} running</span>
            <span className="status-pill">{healthyCount} healthy</span>
            <span className="status-pill">API: {import.meta.env.VITE_API_URL || 'http://localhost:8100'}</span>
          </div>
        </header>

        <AdminContext.Provider value={contextValue}>
          <div className="admin-dockview flex-1 min-h-[600px]">
            <SmartDockviewBase
              components={dockComponents}
              storageKey={DOCKVIEW_STORAGE_KEY}
              defaultLayout={defaultLayout}
            />
          </div>
        </AdminContext.Provider>
      </div>
    </div>
  );
}
