/**
 * Dev Package
 *
 * Centralized development-only infrastructure for pixsim.
 * Combines devtools and console into a single package.
 */

// Re-export devtools
export {
  DevToolRegistry,
  devToolRegistry,
  registerDevTools,
  DevToolProvider,
  useDevToolContext,
} from './devtools';
export type {
  DevToolCategory,
  DevToolDefinition,
  DevToolId,
  DevToolSetting,
  DevToolSettingBoolean,
  DevToolSettingNumber,
  DevToolSettingOption,
  DevToolSettingSelect,
  DevToolContextValue,
  DevToolProviderProps,
} from './devtools';

// Re-export console
export {
  dataRegistry,
  opsRegistry,
  createPixsimNamespace,
  initializeNamespace,
  useConsoleStore,
  moduleRegistry,
  registerConsoleManifest,
  registerConsoleManifests,
  coreManifest,
  workspaceManifest,
  statsManifest,
  toolsManifest,
  defaultModules,
  coreModule,
  workspaceModule,
  toolsModule,
  statsModule,
  useToolConsoleStore,
  pixsim,
  initializeConsole,
  isConsoleInitialized,
} from './console';
export type {
  DataStoreRegistration,
  Operation,
  OperationCategory,
  PixsimNamespace,
  ConsoleEntry,
  ConsoleState,
  ConsoleActions,
  ConsoleModule,
  ConsoleManifest,
  CategoryDeclaration,
  OperationDeclaration,
  OpsDeclaration,
  ManifestRegistrationContext,
} from './console';
