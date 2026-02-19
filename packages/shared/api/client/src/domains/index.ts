/**
 * Domain-specific API helpers built on top of PixSimApiClient.
 *
 * These are environment-neutral (no DOM, no localStorage). For browser-only
 * helpers, place code under `../browser/`.
 */

export { createAccountsApi } from './accounts';
export { createCodegenApi } from './codegen';
export { createActionBlocksApi } from './actionBlocks';
export { createBlockTemplatesApi } from './blockTemplates';
export { createAdminApi } from './admin';
export { createAnalyzersApi } from './analyzers';
export { createAssetsApi } from './assets';
export { createAutomationApi } from './automation';
export { createCompositionApi } from './composition';
export { createConceptsApi } from './concepts';
export { createDevArchitectureApi } from './devArchitecture';
export { createDevDocsApi } from './devDocs';
export { createGameApi } from './game';
export { createGenerationOperationsApi } from './generationOperations';
export { createGenerationsApi } from './generations';
export { createInteractionsApi } from './interactions';
export { createLogsApi } from './logs';
export { createPluginsApi } from './plugins';
export { createPromptsApi } from './prompts';
export { createProvidersApi } from './providers';
export { createTagsApi } from './tags';
export { createUserPreferencesApi } from './userPreferences';

export type {
  AccountResponse,
  AccountUpdate,
  AccountStatus,
  CreateApiKeyResponse,
  DevPixverseDryRunResponse,
} from './accounts';
export type {
  BlockTemplateSummary,
  BlockTemplateDetail,
  RollResult,
  SlotPreviewResult,
  TemplateSlot,
  CharacterBinding,
  CharacterBindings,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  RollTemplateRequest,
  ListTemplatesQuery,
} from './blockTemplates';

export type {
  ActionBlockSummary,
  ActionBlockSearchQuery,
  SimilarActionBlockQuery,
  SimilarActionBlocksByTextRequest,
  SimilarActionBlockMatch,
  EmbedActionBlockQuery,
  EmbedActionBlockResponse,
  EmbedActionBlocksBatchRequest,
  EmbedActionBlocksBatchResponse,
} from './actionBlocks';

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
  AssetGroupBy,
  AssetGroupListResponse,
  AssetGroupRequest,
  AssetGroupSummary,
  EnrichAssetResponse,
  ExtractFrameRequest,
  ReuploadAssetRequest,
  ListAssetsQuery,
  AssetSearchRequest,
  AssetGroupPathEntry,
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
  ResetDeviceStatusResponse,
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
  PluginSyncItem,
  PluginSyncRequest,
  PluginSyncResponse,
} from './plugins';

export type {
  UserPreferences,
  UpdateUserPreferencesRequest,
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

export type { DocsIndexResponse, DocsSearchResponse } from './devDocs';

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
  GameHotspotInputDTO,
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
} from './prompts';

// ===== Tags Types =====
export type { TagSummary, TagListResponse, ListTagsQuery } from './tags';

// ===== Codegen Types =====
export type {
  CodegenTask,
  CodegenTasksResponse,
  CodegenRunRequest,
  CodegenRunResponse,
} from './codegen';

// ===== Providers Types =====
export type {
  ProviderSpec,
  ProviderAccount,
  CreateAccountRequest,
  UpdateAccountRequest,
  CreateApiKeyResponse as ProviderCreateApiKeyResponse,
  SetAccountCreditRequest,
  SetAccountCreditResponse,
  AccountStatsResponse,
  PixverseStatusResponse,
} from './providers';
