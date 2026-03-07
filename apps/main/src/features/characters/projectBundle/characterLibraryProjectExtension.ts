import {
  createCharacter,
  getCharacter,
  listCharacters,
  type CharacterDetail,
  type CharacterSummary,
  type CreateCharacterRequest,
  type ReferenceAsset,
  type UpdateCharacterRequest,
  updateCharacter,
} from '@lib/api/characters';
import { createApiSnapshotAuthoringContributor } from '@lib/game/projectBundle/apiContributorFactory';

const CHARACTER_LIBRARY_PROJECT_EXTENSION_KEY = 'authoring.characters';
const CHARACTER_LIBRARY_PROJECT_EXTENSION_VERSION = 1;
const CHARACTERS_PAGE_SIZE = 200;

interface AuthoringCharacterSnapshot {
  character_id: string;
  name: string | null;
  display_name: string | null;
  category: string;
  species: string | null;
  archetype: string | null;
  visual_traits: Record<string, unknown>;
  personality_traits: Record<string, unknown>;
  behavioral_patterns: Record<string, unknown>;
  voice_profile: Record<string, unknown>;
  render_style: string | null;
  render_instructions: string | null;
  reference_images: string[];
  reference_assets: ReferenceAsset[];
  game_npc_id: number | null;
  sync_with_game: boolean;
  tags: Record<string, unknown>;
  version_family_id: string | null;
  parent_character_id: string | null;
  version_number: number | null;
}

interface AuthoringCharacterVariantFamily {
  id: string;
  name: string;
  count: number;
  members: Array<{
    character_id: string;
    display_name: string | null;
    version_number: number | null;
  }>;
}

interface AuthoringCharactersPayloadV1 {
  version: number;
  items: AuthoringCharacterSnapshot[];
  variant_families: AuthoringCharacterVariantFamily[];
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeReferenceAssets(value: unknown): ReferenceAsset[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is ReferenceAsset => !!entry && typeof entry === 'object')
    .map((entry) => cloneJson(entry));
}

function toCharacterSnapshot(detail: CharacterDetail): AuthoringCharacterSnapshot {
  return {
    character_id: detail.character_id,
    name: detail.name,
    display_name: detail.display_name,
    category: detail.category || 'creature',
    species: detail.species,
    archetype: detail.archetype,
    visual_traits: cloneJson(normalizeRecord(detail.visual_traits)),
    personality_traits: cloneJson(normalizeRecord(detail.personality_traits)),
    behavioral_patterns: cloneJson(normalizeRecord(detail.behavioral_patterns)),
    voice_profile: cloneJson(normalizeRecord(detail.voice_profile)),
    render_style: detail.render_style,
    render_instructions: detail.render_instructions,
    reference_images: cloneJson(normalizeStringList(detail.reference_images)),
    reference_assets: cloneJson(normalizeReferenceAssets(detail.reference_assets)),
    game_npc_id: typeof detail.game_npc_id === 'number' ? detail.game_npc_id : null,
    sync_with_game: Boolean(detail.sync_with_game),
    tags: cloneJson(normalizeRecord(detail.tags)),
    version_family_id: detail.version_family_id || null,
    parent_character_id: detail.parent_character_id || null,
    version_number:
      typeof detail.version_number === 'number' && Number.isFinite(detail.version_number)
        ? detail.version_number
        : null,
  };
}

function toCreateRequest(snapshot: AuthoringCharacterSnapshot): CreateCharacterRequest {
  return {
    character_id: snapshot.character_id,
    name: snapshot.name ?? undefined,
    display_name: snapshot.display_name ?? undefined,
    category: snapshot.category,
    species: snapshot.species ?? undefined,
    archetype: snapshot.archetype ?? undefined,
    visual_traits: cloneJson(snapshot.visual_traits),
    personality_traits: cloneJson(snapshot.personality_traits),
    behavioral_patterns: cloneJson(snapshot.behavioral_patterns),
    voice_profile: cloneJson(snapshot.voice_profile),
    render_style: snapshot.render_style ?? undefined,
    render_instructions: snapshot.render_instructions ?? undefined,
    reference_images: cloneJson(snapshot.reference_images),
    reference_assets: cloneJson(snapshot.reference_assets),
    game_npc_id: snapshot.game_npc_id,
    sync_with_game: snapshot.sync_with_game,
    tags: cloneJson(snapshot.tags),
  };
}

function toUpdateRequest(snapshot: AuthoringCharacterSnapshot): UpdateCharacterRequest {
  return {
    name: snapshot.name ?? undefined,
    display_name: snapshot.display_name ?? undefined,
    visual_traits: cloneJson(snapshot.visual_traits),
    personality_traits: cloneJson(snapshot.personality_traits),
    behavioral_patterns: cloneJson(snapshot.behavioral_patterns),
    voice_profile: cloneJson(snapshot.voice_profile),
    render_instructions: snapshot.render_instructions ?? undefined,
    reference_images: cloneJson(snapshot.reference_images),
    reference_assets: cloneJson(snapshot.reference_assets),
    tags: cloneJson(snapshot.tags),
    render_style: snapshot.render_style ?? undefined,
    game_npc_id: snapshot.game_npc_id,
    sync_with_game: snapshot.sync_with_game,
  };
}

async function listAllCharacterSummaries(): Promise<CharacterSummary[]> {
  const all: CharacterSummary[] = [];
  let offset = 0;
  for (let page = 0; page < 100; page += 1) {
    const batch = await listCharacters({ limit: CHARACTERS_PAGE_SIZE, offset });
    all.push(...batch);
    if (batch.length < CHARACTERS_PAGE_SIZE) {
      break;
    }
    offset += CHARACTERS_PAGE_SIZE;
  }
  return all;
}

function toVariantFamilies(
  snapshots: AuthoringCharacterSnapshot[],
): AuthoringCharacterVariantFamily[] {
  const groups = new Map<string, AuthoringCharacterSnapshot[]>();
  for (const snapshot of snapshots) {
    const familyId = snapshot.version_family_id || snapshot.parent_character_id;
    if (!familyId) {
      continue;
    }
    const list = groups.get(familyId) ?? [];
    list.push(snapshot);
    groups.set(familyId, list);
  }

  return Array.from(groups.entries())
    .map(([id, members]) => ({
      id,
      name: id,
      count: members.length,
      members: members
        .map((member) => ({
          character_id: member.character_id,
          display_name: member.display_name || member.name || member.character_id,
          version_number: member.version_number,
        }))
        .sort((a, b) => {
          const av = a.version_number ?? Number.MAX_SAFE_INTEGER;
          const bv = b.version_number ?? Number.MAX_SAFE_INTEGER;
          return av - bv;
        }),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function parseSnapshot(row: unknown): AuthoringCharacterSnapshot | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return null;
  }
  const data = row as Record<string, unknown>;
  const characterId =
    typeof data.character_id === 'string' ? data.character_id.trim() : '';
  if (!characterId) {
    return null;
  }

  return {
    character_id: characterId,
    name: typeof data.name === 'string' ? data.name : null,
    display_name: typeof data.display_name === 'string' ? data.display_name : null,
    category: typeof data.category === 'string' && data.category.trim() ? data.category : 'creature',
    species: typeof data.species === 'string' ? data.species : null,
    archetype: typeof data.archetype === 'string' ? data.archetype : null,
    visual_traits: normalizeRecord(data.visual_traits),
    personality_traits: normalizeRecord(data.personality_traits),
    behavioral_patterns: normalizeRecord(data.behavioral_patterns),
    voice_profile: normalizeRecord(data.voice_profile),
    render_style: typeof data.render_style === 'string' ? data.render_style : null,
    render_instructions:
      typeof data.render_instructions === 'string' ? data.render_instructions : null,
    reference_images: normalizeStringList(data.reference_images),
    reference_assets: normalizeReferenceAssets(data.reference_assets),
    game_npc_id:
      typeof data.game_npc_id === 'number' && Number.isFinite(data.game_npc_id)
        ? Math.trunc(data.game_npc_id)
        : null,
    sync_with_game: Boolean(data.sync_with_game),
    tags: normalizeRecord(data.tags),
    version_family_id:
      typeof data.version_family_id === 'string' ? data.version_family_id : null,
    parent_character_id:
      typeof data.parent_character_id === 'string' ? data.parent_character_id : null,
    version_number:
      typeof data.version_number === 'number' && Number.isFinite(data.version_number)
        ? Math.trunc(data.version_number)
        : null,
  };
}

function parseCharactersPayload(payload: unknown): AuthoringCharactersPayloadV1 | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const data = payload as Record<string, unknown>;
  const items = Array.isArray(data.items) ? data.items : [];
  const snapshots = items
    .map((item) => parseSnapshot(item))
    .filter((item): item is AuthoringCharacterSnapshot => item != null);

  return {
    version:
      typeof data.version === 'number' && Number.isFinite(data.version)
        ? Math.trunc(data.version)
        : CHARACTER_LIBRARY_PROJECT_EXTENSION_VERSION,
    items: snapshots,
    variant_families: toVariantFamilies(snapshots),
  };
}

export const authoringProjectBundleContributor = createApiSnapshotAuthoringContributor<
  CharacterSummary,
  AuthoringCharacterSnapshot,
  AuthoringCharactersPayloadV1
>({
  key: CHARACTER_LIBRARY_PROJECT_EXTENSION_KEY,
  version: CHARACTER_LIBRARY_PROJECT_EXTENSION_VERSION,
  inventory: {
    categories: [
      {
        key: 'characters',
        label: 'Characters',
        path: 'items',
        idFields: ['character_id', 'id'],
        labelFields: ['display_name', 'name', 'character_id'],
        panelId: 'character-creator',
        panelLabel: 'Character Creator',
      },
      {
        key: 'variant_families',
        label: 'Character Variant Families',
        path: 'variant_families',
        idFields: ['id'],
        labelFields: ['name', 'id'],
        panelId: 'character-creator',
        panelLabel: 'Character Creator',
      },
    ],
  },
  listExportSources: listAllCharacterSummaries,
  sourceToSnapshot: async (summary) => {
    const detail = await getCharacter(summary.character_id);
    return toCharacterSnapshot(detail);
  },
  buildPayload: (snapshots, version) => {
    if (snapshots.length === 0) {
      return null;
    }
    return {
      version,
      items: snapshots,
      variant_families: toVariantFamilies(snapshots),
    };
  },
  parsePayload: (payload, version) => {
    const parsed = parseCharactersPayload(payload);
    if (!parsed) {
      return null;
    }
    return {
      version:
        typeof parsed.version === 'number' && Number.isFinite(parsed.version)
          ? Math.trunc(parsed.version)
          : version,
      items: parsed.items,
    };
  },
  listExistingIds: async () =>
    new Set((await listAllCharacterSummaries()).map((entry) => entry.character_id)),
  getSnapshotId: (snapshot) => snapshot.character_id,
  createFromSnapshot: async (snapshot) => {
    await createCharacter(toCreateRequest(snapshot));
  },
  updateFromSnapshot: async (snapshot) => {
    await updateCharacter(snapshot.character_id, toUpdateRequest(snapshot));
  },
  invalidPayloadWarning: 'authoring.characters payload is invalid and was ignored',
  onVersionMismatch: (payloadVersion, version) => {
    console.warn(
      `[CharactersExtension] version mismatch: payload v${payloadVersion}, expected v${version} - attempting best-effort import`,
    );
  },
  formatImportWarning: (snapshotId, error) => {
    const message = error instanceof Error ? error.message : String(error);
    return `authoring.characters import ${snapshotId}: ${message}`;
  },
});
