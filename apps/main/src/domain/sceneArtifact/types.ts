export type SceneArtifactStatus =
  | 'draft'
  | 'explored'
  | 'composed'
  | 'refined'
  | 'published';

export type SceneArtifactStage = 'explore' | 'compose' | 'refine' | 'custom';
export type SceneArtifactExecutionMode = 'fanout' | 'sequential';
export type SceneArtifactOperationMode = 'auto' | 'text_to_image' | 'image_to_image';
export type SceneArtifactCandidateGroup = 'location' | 'style' | 'mood' | 'prop' | 'other';

export interface SceneArtifactCastRow {
  id: string;
  role: string;
  character_id: string;
}

export interface SceneArtifactGuidanceRefRow {
  id: string;
  key: string;
  asset_id: string;
  kind: string;
  label?: string;
  priority?: string;
}

export interface SceneArtifactCandidateAssetRow {
  id: string;
  asset_id: string;
  group: SceneArtifactCandidateGroup;
  note?: string;
}

export interface SceneArtifactVariantRow {
  id: string;
  key: string;
  label: string;
  promptSuffix: string;
  shot?: string;
  view?: string;
  state?: string;
}

export interface SceneArtifactLaunchHistoryEntry {
  id: string;
  launchId: string;
  stage: SceneArtifactStage;
  createdAtMs: number;
  estimatedRows: number;
  executionMode: SceneArtifactExecutionMode;
  reusePreviousOutputAsInput: boolean;
  sourceAssetId: number | null;
  executionId?: number;
  generationCount?: number;
}

export interface SceneArtifactStageHandoff {
  sourceAssetId: string;
  fromStage: SceneArtifactStage;
  fromLaunchId: string;
  capturedAtMs: number;
}

export interface SceneArtifactPrepState {
  templateId: string;
  providerId: string;
  basePrompt: string;
  sceneName: string;
  stage: SceneArtifactStage;
  variantCount: string;
  executionMode: SceneArtifactExecutionMode;
  reusePreviousOutputAsInput: boolean;
  operationMode: SceneArtifactOperationMode;
  sourceAssetId: string;
  matrixQuery: string;
  discoveryNotes: string;
  castRows: SceneArtifactCastRow[];
  guidanceRefRows: SceneArtifactGuidanceRefRow[];
  candidateAssets: SceneArtifactCandidateAssetRow[];
  variantRows: SceneArtifactVariantRow[];
  launchHistory: SceneArtifactLaunchHistoryEntry[];
  stageHandoff: SceneArtifactStageHandoff | null;
}

export interface SceneArtifact {
  id: string;
  title: string;
  status: SceneArtifactStatus;
  prep: SceneArtifactPrepState;
  gameSceneId?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SceneArtifactUpsertInput {
  artifactId?: string | null;
  title: string;
  status: SceneArtifactStatus;
  prep: SceneArtifactPrepState;
  metadata?: Record<string, unknown>;
  gameSceneId?: string | null;
}
