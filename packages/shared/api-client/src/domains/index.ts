/**
 * Domain-specific API helpers built on top of PixSimApiClient.
 *
 * These are environment-neutral (no DOM, no localStorage). For browser-only
 * helpers, place code under `../browser/`.
 */

export { createAccountsApi } from './accounts';
export { createAnalyzersApi } from './analyzers';
export { createAssetsApi } from './assets';
export { createAutomationApi } from './automation';
export { createCompositionApi } from './composition';
export { createConceptsApi } from './concepts';
export { createGenerationOperationsApi } from './generationOperations';
export { createGenerationsApi } from './generations';
export { createLogsApi } from './logs';
export { createPluginsApi } from './plugins';
export { createUserPreferencesApi } from './userPreferences';

export type {
  AccountResponse,
  AccountUpdate,
  AccountStatus,
  CreateApiKeyResponse,
} from './accounts';

export type {
  AnalyzerInfo,
  AnalyzerInstance,
  AnalyzerInstanceListResponse,
  CreateAnalyzerInstanceRequest,
  UpdateAnalyzerInstanceRequest,
  AnalyzerKind,
  AnalyzerTarget,
  AnalyzersListResponse,
  ListAnalyzersOptions,
} from './analyzers';

export type {
  AssetResponse,
  AssetListResponse,
  ExtractFrameRequest,
  ReuploadAssetRequest,
  ListAssetsQuery,
  AssetSearchRequest,
  FilterDefinition,
  FilterMetadataResponse,
  FilterMetadataQueryOptions,
  FilterOptionValue,
} from './assets';

export type {
  AndroidDevice,
  AutomationExecution,
  ExecutionLoop,
  AppActionPreset,
  CompletePairingRequest,
  ExecutePresetRequest,
  TestActionsRequest,
  DeviceScanResponse,
  CompletePairingResponse,
  ExecutePresetResponse,
  TestActionsResponse,
  ClearExecutionsResponse,
  ListExecutionsQuery,
  ListLoopsQuery,
} from './automation';

export type { GenerationOperationMetadataItem } from './generationOperations';

export type {
  GenerationResponse,
  GenerationListResponse,
  CreateGenerationRequest,
  GenerationStatus,
  OperationType,
  GenerationNodeConfigSchema,
  GenerationSocialContext,
  SceneRef,
  PlayerContextSnapshot,
  ListGenerationsQuery,
} from './generations';

export type {
  LogEntryResponse,
  LogIngestRequest,
  LogIngestResponse,
  LogBatchIngestRequest,
  LogQueryResponse,
  LogQueryParams,
  ConsoleFieldDefinition,
  ConsoleFieldsResponse,
} from './logs';

export type {
  PluginMetadata,
  PluginInfo,
  PluginListResponse,
  PluginStateResponse,
} from './plugins';

export type {
  DebugPreferences,
  DevToolsPreferences,
  DevToolSettingValue,
  UserPreferences,
  UserPreferencesResponse,
} from './userPreferences';

export type { CompositionPackagesResponse } from './composition';

export type { RoleConceptResponse, RolesListResponse } from './concepts';
export {
  KNOWN_KINDS,
  isKnownConceptKind,
} from './concepts';
export type {
  ConceptKind,
  KnownConceptKind,
  ConceptKindInfo,
  ConceptKindsResponse,
  ConceptResponse,
  ConceptsListResponse,
} from './concepts';
