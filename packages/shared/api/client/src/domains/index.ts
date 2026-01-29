/**
 * Domain-specific API helpers built on top of PixSimApiClient.
 *
 * These are environment-neutral (no DOM, no localStorage). For browser-only
 * helpers, place code under `../browser/`.
 */

export { createAccountsApi } from './accounts';
export { createAdminApi } from './admin';
export { createAnalyzersApi } from './analyzers';
export { createAssetsApi } from './assets';
export { createAutomationApi } from './automation';
export { createCompositionApi } from './composition';
export { createConceptsApi } from './concepts';
export { createDevArchitectureApi } from './devArchitecture';
export { createGameApi } from './game';
export { createGenerationOperationsApi } from './generationOperations';
export { createGenerationsApi } from './generations';
export { createInteractionsApi } from './interactions';
export { createLogsApi } from './logs';
export { createPluginsApi } from './plugins';
export { createPromptsApi } from './prompts';
export { createProvidersApi } from './providers';
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
  EnrichAssetResponse,
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

// ===== Admin Types =====
export type {
  ServiceStatus,
  ServicesStatusResponse,
  SystemMetrics,
  EventMetrics,
  PluginMetricsData,
  PluginMetricsSummary,
  PluginMetricsResponse,
  PluginHealthStatus,
  PluginHealthResponse,
  PluginListItem,
  PluginListResponse as AdminPluginListResponse,
  PluginDetails,
  ConditionInfo,
  EffectInfo,
  SimulationConfigProvider,
  BehaviorExtensionsResponse,
} from './admin';

// ===== Dev Architecture Types =====
export type {
  RouteInfo,
  CapabilityInfo,
  SubServiceInfo,
  ServiceInfo,
  BackendPluginInfo,
  ArchitectureMetrics,
  BackendArchitectureResponse,
  FrontendFeatureEntry,
  FrontendArchitectureResponse,
  UnifiedArchitectureMetrics,
  UnifiedArchitectureResponse,
} from './devArchitecture';

// ===== Game Types =====
export type {
  GameWorldSummary,
  GameWorldDetail,
  PaginatedWorldsResponse,
  WorldConfigResponse,
  GameSessionSummary,
  GameSessionDTO,
  SessionUpdatePayload,
  GameLocationSummary,
  GameHotspotDTO,
  GameLocationDetail,
  GameNpcSummary,
  GameNpcDetail,
  NpcExpressionDTO,
  NpcPresenceDTO,
  Scene,
  QuestObjectiveDTO,
  QuestDTO,
  InventoryItemDTO,
  InventoryStatsResponse,
  TemplateKind,
  ResolveTemplateResponse,
  ResolveBatchResponse,
} from './game';

// ===== Interactions Types =====
export type {
  InteractionParticipant,
  InteractionTarget,
  InteractionCondition,
  InteractionEffect,
  InteractionInstance,
  ListInteractionsRequest,
  ListInteractionsResponse,
  ExecuteInteractionRequest,
  ExecuteInteractionResponse,
  PendingDialogueRequest,
  DialogueExecutionResponse,
} from './interactions';

// ===== Prompts Types =====
export type {
  PromptFamilySummary,
  PromptFamilyDetail,
  PromptVersionSummary,
  PromptVersionDetail,
  PromptVariant,
  VariantFeedback,
  PromptAnalytics,
  PromptComparison,
  SemanticPack,
  PromptCategory,
} from './prompts';

// ===== Providers Types =====
export type {
  ProviderSpec,
  ProviderCapability,
  ProviderAccount,
  AccountUsageStats,
  CreateAccountRequest,
  UpdateAccountRequest,
  ApiKeyInfo,
  CreateApiKeyRequest,
  CreateApiKeyResponse as ProviderCreateApiKeyResponse,
  AccountCredits,
  CreditTransaction,
} from './providers';
