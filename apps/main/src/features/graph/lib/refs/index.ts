/**
 * Graph Reference Utilities
 *
 * @module graph/refs
 */

export type {
  NormalizeResult,
  NormalizeOptions,
  NpcId,
  CharacterId,
  InstanceId,
  SceneId,
  LocationId,
  AssetId,
  NpcRef,
  CharacterRef,
  InstanceRef,
  SceneIdRef,
  LocationRef,
  AssetRef,
  EntityRef,
  ParsedRef,
} from './graphRefs';
export {
  normalizeNpcRef,
  extractNpcIdFromRef,
  normalizeInstanceRef,
  extractInstanceIdFromRef,
  normalizeCharacterRef,
  extractCharacterIdFromRef,
  normalizeSceneRef,
  extractSceneIdFromRef,
  normalizeLocationRef,
  extractLocationIdFromRef,
  normalizeAssetRef,
  extractAssetIdFromRef,
  tryParseEntityRef,
  isAnyEntityRef,
  normalizeRefBatch,
  Ref,
  parseRef,
  isUUID,
} from './graphRefs';

export type {
  NodeLinkInfo,
  ResolvedLink,
  TemplateRef,
  TemplateKind,
  RuntimeKind,
  SyncDirection,
} from './objectLinks';
export {
  createTemplateRef,
  createNpcLinkInfo,
  createItemLinkInfo,
  createPropLinkInfo,
  resolveLinkInfo,
  extractLinksFromMetadata,
  buildRuntimeTemplateRefs,
  buildRuntimeLinkMap,
  createMappingId,
  createTemplateRefKey,
  parseTemplateRefKey,
} from './objectLinks';
