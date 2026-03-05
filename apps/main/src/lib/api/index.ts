/**
 * API Client - Frontend API for backend services
 *
 * Use `pixsimClient` for all API requests. It returns data directly (no `.data` unwrapping needed).
 * For reusable domain clients, see `@pixsim7/shared.api.client/domains`.
 */
export { pixsimClient, BACKEND_BASE, API_BASE_URL } from './client';
export {
  // Error message extraction
  extractErrorMessage,
  getErrorResponse,
  getErrorCode,
  isErrorCode,
  isErrorResponse,

  // Validation errors
  getValidationErrors,
  getFieldError,
  isValidationError,

  // HTTP status checks
  isHttpError,
  isNetworkError,
  getErrorStatusCode,

  // Common error type checks
  isUnauthorizedError,
  isNotFoundError,
  isConflictError,

  // Error codes
  ErrorCodes,
} from './errorHandling';

// Re-export types
export type { ErrorResponse, ErrorCode } from './errorHandling';

// Domain clients
export { addInventoryItem, addQuest, advanceGameWorldTime, attemptPickpocket, attemptSensualTouch, buildActionSelectionRequestFromBehavior, clearInventory, completeObjective, createGameSession, createGameWorld, deleteProjectDraft, deleteSavedGameProject, duplicateSavedGameProject, exportWorldProject, getGameLocation, getGameScene, getGameSession, getGameWorld, getInventoryItem, getInventoryStats, getNpcDetail, getNpcExpressions, getNpcPresence, getNpcSlots, getProjectDraft, getSavedGameProject, getSessionQuest, getWorldConfig, getWorldManifest, getWorldNpcRoles, importWorldProject, listGameLocations, listGameNpcs, listGameSessions, listGameWorlds, listInventoryItems, listNpcSurfacePackages, listSavedGameProjects, listSessionQuests, removeInventoryItem, renameSavedGameProject, resolveTemplate, resolveTemplateBatch, saveGameLocationHotspots, saveGameLocationMeta, saveGameProject, saveGameWorldMeta, saveNpcExpressions, saveNpcMeta, selectActionBlocksFromBehavior, setNpcSlots, setWorldManifest, setWorldNpcRoles, updateGameSession, updateGameWorldMeta, updateInventoryItem, updateObjectiveProgress, updateQuestStatus, upsertProjectDraft } from './game';
export type { ActionSelectionRequestPayload, ActionSelectionResponsePayload, BuildActionSelectionRequestFromBehaviorRequest, BuildActionSelectionRequestFromBehaviorResponse, DraftSummary, DuplicateSavedGameProjectRequest, GameHotspotDTO, GameLocationDetail, GameLocationSummary, GameNpcDetail, GameNpcSummary, GameProjectBundle, GameProjectImportResponse, GameSessionDTO, GameSessionSummary, GameWorldDetail, GameWorldSummary, InventoryItemDTO, InventoryStatsResponse, MessageResponse, NpcExpressionDTO, NpcPresenceDTO, NpcSlot2d, NpcSurfacePackage, PaginatedWorldsResponse, PickpocketRequest, PickpocketResponse, QuestDTO, QuestObjectiveDTO, RenameSavedGameProjectRequest, ResolveBatchResponse, ResolveTemplateResponse, SaveGameProjectRequest, SavedGameProjectDetail, SavedGameProjectSummary, SensualTouchRequest, SensualTouchResponse, SessionUpdatePayload, SessionUpdateResponse, TemplateKind, UpsertDraftRequest, WorldConfigResponse, WorldManifest } from './game';
export { connectPixverseWithGoogle, createApiKey, deleteAccount, dryRunPixverseSync, getAccountStats, getAccounts, getInvitedAccounts, toggleAccountStatus, updateAccount, updateAccountNickname } from './accounts';
export type { AccountResponse, AccountStatsResponse, AccountStatus, AccountUpdate, CreateApiKeyResponse, InvitedAccountsResponse } from './accounts';
export { embedActionBlock, embedActionBlocksBatch, findSimilarActionBlocks, findSimilarActionBlocksByText, searchActionBlocks } from './actionBlocks';
export type { ActionBlockSearchQuery, ActionBlockSummary, EmbedActionBlockQuery, EmbedActionBlockResponse, EmbedActionBlocksBatchRequest, EmbedActionBlocksBatchResponse, SimilarActionBlockMatch, SimilarActionBlockQuery, SimilarActionBlocksByTextRequest } from './actionBlocks';
export { archiveAsset, assignTags, bulkDeleteAssets, deleteAsset, downloadAsset, enrichAsset, extractFrame, getAsset, getAssetGenerationContext, getFilterMetadata, listAssetGroups, listAssets, uploadAssetToProvider } from './assets';
export type { AssetGenerationContext, AssetGroupBy, AssetGroupListResponse, AssetGroupRequest, AssetGroupSummary, AssetListResponse, AssetResponse, AssetSearchRequest, EnrichAssetResponse, ExtractFrameRequest, FilterDefinition, FilterMetadataQueryOptions, FilterMetadataResponse, FilterOptionValue, ReuploadAssetRequest } from './assets';
export { clearExecutions, completePairing, copyPreset, createLoop, createPreset, deleteLoop, deletePreset, executePreset, getExecution, getLoop, getPreset, listDevices, listExecutions, listLoops, listPresets, pauseLoop, resetDevice, runLoopNow, scanDevices, startLoop, testActions, updateLoop, updatePreset } from './automation';
export type { AndroidDevice, AppActionPreset, AutomationExecution, ClearExecutionsResponse, CompletePairingRequest, CompletePairingResponse, DeviceScanResponse, ExecutePresetRequest, ExecutePresetResponse, ExecutionLoop, ListExecutionsQuery, ListLoopsQuery, TestActionsRequest, TestActionsResponse } from './automation';
export { getCompositionPackages } from './composition';
export type { CompositionPackagesResponse } from './composition';
export { KNOWN_KINDS, getConceptKinds, getConcepts, getInfluenceRegions, getParts, getPoses, getRoles, isKnownConceptKind } from './concepts';
export type { ConceptKind, ConceptKindInfo, ConceptKindsResponse, ConceptResponse, ConceptsListResponse, KnownConceptKind } from './concepts';
export { clearPendingDialogue, executeInteraction, executePendingDialogue, getAllInteractions, getAvailableInteractions, getPendingDialogue, listInteractions } from './interactions';
export { buildSocialContext, cancelGeneration, createGeneration, deleteGeneration, getGeneration, listGenerations, patchGenerationPrompt, retryGeneration, validateGenerationConfig } from './generations';
export type { CreateGenerationRequest, GenerateContentRequest, GenerateContentResponse, GenerationListResponse, GenerationNodeConfig, GenerationNodeConfigSchema, GenerationResponse, GenerationSocialContext, GenerationStatus, ListGenerationsQuery, OperationType, PlayerContextSnapshot, SceneRef } from './generations';
export { getGenerationOperationMetadata } from './generationOperations';
export type { GenerationOperationMetadataItem } from './generationOperations';
export { createAnalysisPoint, createAnalyzerInstance, deleteAnalysisPoint, deleteAnalyzerInstance, getAnalyzer, getAnalyzerInstance, listAnalysisPoints, listAnalyzerInstances, listAnalyzers, listAssetAnalyzers, listPromptAnalyzers, updateAnalysisPoint, updateAnalyzerInstance } from './analyzers';
export type { AnalysisPointControl, AnalysisPointGroup, AnalysisPointInfo, AnalysisPointsListResponse, AnalyzerInfo, AnalyzerInputModality, AnalyzerInstance, AnalyzerInstanceListResponse, AnalyzerKind, AnalyzerTarget, AnalyzerTaskFamily, AnalyzersListResponse, CreateAnalysisPointRequest, CreateAnalyzerInstanceRequest, ListAnalyzersOptions, UpdateAnalysisPointRequest, UpdateAnalyzerInstanceRequest } from './analyzers';
export { cancelAnalysis, cancelAnalysisBackfill, createAnalysis, createAnalysisBackfill, getAnalysis, getAnalysisBackfill, listAnalysisBackfills, listAssetAnalyses, pauseAnalysisBackfill, resumeAnalysisBackfill } from './analyses';
export type { AnalysisBackfillListResponse, AnalysisBackfillResponse, AnalysisBackfillStatus, AnalysisListResponse, AnalysisResponse, AnalysisStatus, CreateAnalysisBackfillRequest, CreateAnalysisRequest, ListAnalysisBackfillsOptions, ListAssetAnalysesOptions } from './analyses';
export { getUserPreferences, updatePreferenceKey, updateUserPreferences } from './userPreferences';
export type { AnalyzerPreferences, AutoTagsPreferences, DebugPreferences, DevToolSettingValue, DevToolsPreferences, TagDisplayPreferences, UserPreferences, UserPreferencesResponse } from './userPreferences';
export { listAdminUsers, updateAdminUserPermissions } from './adminUsers';
export type { AdminUserPermissions, AdminUsersListResponse, ListAdminUsersParams } from './adminUsers';
export { listCodegenTasks, runCodegenTask } from './codegen';
export type { CodegenRunRequest, CodegenRunResponse, CodegenTask, CodegenTasksResponse } from './codegen';
export { createCharacter, deleteCharacter, evolveCharacter, getCharacter, getCharacterHistory, listCharacters, searchCharacters, updateCharacter } from './characters';
export type { CharacterDetail, CharacterSummary, CreateCharacterRequest, ListCharactersQuery, ReferenceAsset, UpdateCharacterRequest } from './characters';
export { createWorldRoutine, deleteWorldRoutine, getWorldBehavior, updateWorldRoutine } from './gameBehavior';
export type { BackendRoutineEdge, BackendRoutineGraph, BackendRoutineNode, BehaviorConfigResponse } from './gameBehavior';
export { listTags } from './tags';
export type { ListTagsQuery, TagListResponse, TagSummary } from './tags';

// Note: __simulate_extend.ts NOT exported (test utility)
