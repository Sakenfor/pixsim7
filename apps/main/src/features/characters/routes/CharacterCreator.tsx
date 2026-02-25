import { Button, ConfirmModal, Select, SidebarPaneShell } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  listCharacters,
  getCharacter,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  type CharacterSummary,
  type CharacterDetail,
  type CreateCharacterRequest,
  type UpdateCharacterRequest,
  type ReferenceAsset,
} from '@lib/api/characters';

import {
  useProvideCapability,
  CAP_CHARACTER_CONTEXT,
  CAP_CHARACTER_INGEST_ACTION,
  CAP_CHARACTER_SCENE_PREP_PREFILL,
  type CharacterContextSummary,
  type CharacterIngestActionContext,
  type CharacterScenePrepPrefillContext,
} from '@features/contextHub';


import { CharacterEditor } from '../components/CharacterEditor';
import { CharacterSidebar } from '../components/CharacterSidebar';
import { buildCharacterScenePrepPrefill, parseCharacterReferenceSlotsFromTags } from '../lib/scenePrepPrefill';

const EMPTY_CHARACTER: Partial<CharacterDetail> = {
  character_id: '',
  name: '',
  display_name: '',
  category: 'creature',
  species: '',
  archetype: '',
  visual_traits: {},
  personality_traits: {},
  behavioral_patterns: {},
  voice_profile: {},
  render_style: 'realistic',
  render_instructions: '',
  reference_images: [],
  reference_assets: [],
  game_npc_id: null,
  sync_with_game: false,
  tags: {},
};

type CharacterReferenceIngestItem = {
  id: string;
  asset_id: string;
  status: 'ingest' | 'analyzing' | 'analyzed' | 'suggested' | 'ready' | 'error';
  updated_at?: number;
};

function appendAssetsToReferenceIngestTags(
  rawTags: Record<string, unknown> | undefined,
  assetIds: Array<number | string>,
): Record<string, unknown> {
  const tags = { ...(rawTags || {}) };
  const rawIngest = (tags._reference_ingest && typeof tags._reference_ingest === 'object')
    ? (tags._reference_ingest as Record<string, unknown>)
    : {};
  const existingItems = Array.isArray(rawIngest.items) ? rawIngest.items : [];
  const normalizedExisting: CharacterReferenceIngestItem[] = existingItems
    .filter((item): item is CharacterReferenceIngestItem => !!item && typeof item === 'object')
    .map((item: any) => ({
      id: typeof item.id === 'string' ? item.id : `ingest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      asset_id: String(item.asset_id ?? '').trim(),
      status: typeof item.status === 'string' ? item.status : 'ingest',
      updated_at: typeof item.updated_at === 'number' ? item.updated_at : undefined,
    }))
    .filter((item) => item.asset_id);

  const existingIds = new Set(normalizedExisting.map((item) => item.asset_id));
  const nextItems = [...normalizedExisting];
  for (const raw of assetIds) {
    const assetId = String(raw).trim();
    if (!assetId || existingIds.has(assetId)) continue;
    existingIds.add(assetId);
    nextItems.unshift({
      id: `ingest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      asset_id: assetId,
      status: 'ingest',
      updated_at: Date.now(),
    });
  }

  tags._reference_ingest = { items: nextItems };
  return tags;
}

export function CharacterCreator() {
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState<Partial<CharacterDetail>>(EMPTY_CHARACTER);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRegistryPanel, setShowRegistryPanel] = useState(false);

  // Provide selected character to other panels via ContextHub
  const characterContextValue = useMemo<CharacterContextSummary | null>(() => {
    if (isCreateMode || !selectedCharacterId || !editBuffer.character_id) return null;
    return {
      characterId: editBuffer.character_id,
      name: editBuffer.name ?? null,
      displayName: editBuffer.display_name ?? null,
      category: editBuffer.category ?? 'creature',
      species: editBuffer.species ?? null,
      archetype: editBuffer.archetype ?? null,
      gameNpcId: editBuffer.game_npc_id ?? null,
    };
  }, [isCreateMode, selectedCharacterId, editBuffer.character_id, editBuffer.name, editBuffer.display_name, editBuffer.category, editBuffer.species, editBuffer.archetype, editBuffer.game_npc_id]);

  const characterIngestActionValue = useMemo<CharacterIngestActionContext | null>(() => {
    if (isCreateMode || !selectedCharacterId || !editBuffer.character_id) return null;
    const characterLabel =
      (typeof editBuffer.display_name === 'string' && editBuffer.display_name.trim())
      || (typeof editBuffer.name === 'string' && editBuffer.name.trim())
      || editBuffer.character_id;
    return {
      characterId: editBuffer.character_id,
      characterLabel,
      addAssetsToIngest: (assetIds) => {
        setEditBuffer((prev) => ({
          ...prev,
          tags: appendAssetsToReferenceIngestTags(prev.tags as Record<string, unknown> | undefined, assetIds),
        }));
      },
    };
  }, [isCreateMode, selectedCharacterId, editBuffer.character_id, editBuffer.display_name, editBuffer.name]);

  const characterScenePrepPrefillValue = useMemo<CharacterScenePrepPrefillContext | null>(() => {
    if (isCreateMode || !selectedCharacterId || !editBuffer.character_id) return null;
    const characterLabel =
      (typeof editBuffer.display_name === 'string' && editBuffer.display_name.trim())
      || (typeof editBuffer.name === 'string' && editBuffer.name.trim())
      || editBuffer.character_id;
    const prefill = buildCharacterScenePrepPrefill({
      characterId: editBuffer.character_id,
      characterDisplayName: characterLabel,
      suggestedScenePrompt: `${characterLabel} at cafe`,
      referenceSlots: parseCharacterReferenceSlotsFromTags(editBuffer.tags as Record<string, unknown> | undefined),
    });
    return {
      characterId: editBuffer.character_id,
      characterLabel,
      sceneName: prefill.sceneName,
      basePrompt: prefill.basePrompt,
      sourceAssetId: prefill.sourceAssetId,
      cast: prefill.cast,
      guidanceRefs: prefill.guidanceRefs,
      matrixQuery: prefill.matrixQuery,
      discoveryNotes: prefill.discoveryNotes,
    };
  }, [isCreateMode, selectedCharacterId, editBuffer.character_id, editBuffer.display_name, editBuffer.name, editBuffer.tags]);

  useProvideCapability<CharacterContextSummary>(
    CAP_CHARACTER_CONTEXT,
    {
      id: 'character-creator',
      label: 'Character Creator',
      priority: 10,
      isAvailable: () => characterContextValue != null,
      getValue: () => characterContextValue!,
    },
    [characterContextValue],
    { scope: 'parent' },
  );
  useProvideCapability<CharacterIngestActionContext>(
    CAP_CHARACTER_INGEST_ACTION,
    {
      id: 'character-creator:ingest',
      label: 'Character Ingest',
      priority: 10,
      exposeToContextMenu: true,
      isAvailable: () => characterIngestActionValue != null,
      getValue: () => characterIngestActionValue!,
    },
    [characterIngestActionValue],
    { scope: 'root' },
  );
  useProvideCapability<CharacterScenePrepPrefillContext>(
    CAP_CHARACTER_SCENE_PREP_PREFILL,
    {
      id: 'character-creator:scene-prep',
      label: 'Character Scene Prep Prefill',
      priority: 10,
      isAvailable: () => characterScenePrepPrefillValue != null,
      getValue: () => characterScenePrepPrefillValue!,
    },
    [characterScenePrepPrefillValue],
    { scope: 'root' },
  );

  const loadCharacters = useCallback(async () => {
    try {
      const list = await listCharacters();
      setCharacters(list);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }, []);

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  useEffect(() => {
    if (!selectedCharacterId || isCreateMode) return;
    setIsLoading(true);
    setError(null);
    getCharacter(selectedCharacterId)
      .then((detail) => {
        setEditBuffer({ ...detail });
      })
      .catch((e: any) => setError(String(e?.message ?? e)))
      .finally(() => setIsLoading(false));
  }, [selectedCharacterId, isCreateMode]);

  const handleSelect = useCallback((characterId: string) => {
    setIsCreateMode(false);
    setSelectedCharacterId(characterId);
  }, []);

  const handleCreateNew = useCallback(() => {
    setIsCreateMode(true);
    setSelectedCharacterId(null);
    setEditBuffer({ ...EMPTY_CHARACTER });
  }, []);

  const handleChange = (patch: Partial<CharacterDetail>) => {
    setEditBuffer((prev) => ({ ...prev, ...patch }));
  };

  const handleSearchResults = (results: CharacterSummary[] | null) => {
    if (results) {
      setCharacters(results);
    } else {
      loadCharacters();
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      if (isCreateMode) {
        const req: CreateCharacterRequest = {
          character_id: editBuffer.character_id!,
          name: editBuffer.name || undefined,
          display_name: editBuffer.display_name || undefined,
          category: editBuffer.category,
          species: editBuffer.species || undefined,
          archetype: editBuffer.archetype || undefined,
          visual_traits: editBuffer.visual_traits as Record<string, unknown>,
          personality_traits: editBuffer.personality_traits as Record<string, unknown>,
          behavioral_patterns: editBuffer.behavioral_patterns as Record<string, unknown>,
          voice_profile: editBuffer.voice_profile as Record<string, unknown>,
          render_style: editBuffer.render_style || undefined,
          render_instructions: editBuffer.render_instructions || undefined,
          reference_images: editBuffer.reference_images,
          reference_assets: editBuffer.reference_assets as ReferenceAsset[],
          game_npc_id: editBuffer.game_npc_id,
          sync_with_game: editBuffer.sync_with_game,
          tags: editBuffer.tags as Record<string, unknown>,
        };
        const created = await createCharacter(req);
        setIsCreateMode(false);
        setSelectedCharacterId(created.character_id);
        setEditBuffer({ ...created });
      } else {
        const req: UpdateCharacterRequest = {
          name: editBuffer.name || undefined,
          display_name: editBuffer.display_name || undefined,
          visual_traits: editBuffer.visual_traits as Record<string, unknown>,
          personality_traits: editBuffer.personality_traits as Record<string, unknown>,
          behavioral_patterns: editBuffer.behavioral_patterns as Record<string, unknown>,
          voice_profile: editBuffer.voice_profile as Record<string, unknown>,
          render_instructions: editBuffer.render_instructions || undefined,
          reference_images: editBuffer.reference_images,
          reference_assets: editBuffer.reference_assets as ReferenceAsset[],
          tags: editBuffer.tags as Record<string, unknown>,
          render_style: editBuffer.render_style || undefined,
          game_npc_id: editBuffer.game_npc_id,
          sync_with_game: editBuffer.sync_with_game,
        };
        const updated = await updateCharacter(selectedCharacterId!, req);
        setEditBuffer({ ...updated });
      }
      await loadCharacters();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCharacterId) return;
    try {
      await deleteCharacter(selectedCharacterId, true);
      setSelectedCharacterId(null);
      setEditBuffer({ ...EMPTY_CHARACTER });
      setIsCreateMode(false);
      await loadCharacters();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
    setShowDeleteConfirm(false);
  };

  const handleEvolved = () => {
    if (selectedCharacterId) {
      getCharacter(selectedCharacterId).then((detail) => {
        setEditBuffer({ ...detail });
      });
      loadCharacters();
    }
  };

  const hasSelection = isCreateMode || selectedCharacterId != null;
  const selectedCharacterSummary = useMemo(
    () => characters.find((c) => c.character_id === selectedCharacterId) ?? null,
    [characters, selectedCharacterId],
  );
  const selectedCharacterLabel =
    (typeof editBuffer.display_name === 'string' && editBuffer.display_name.trim())
    || (typeof editBuffer.name === 'string' && editBuffer.name.trim())
    || selectedCharacterSummary?.display_name
    || selectedCharacterSummary?.name
    || selectedCharacterId
    || null;
  const headerCharacterSelectValue = isCreateMode
    ? '__create_new__'
    : (selectedCharacterId || '');

  const handleHeaderCharacterSelect = useCallback((value: string) => {
    if (value === '__create_new__') {
      handleCreateNew();
      return;
    }
    if (!value) return;
    handleSelect(value);
  }, [handleCreateNew, handleSelect]);

  const mainContent = hasSelection ? (
    isLoading ? (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Loading...
      </div>
    ) : (
      <CharacterEditor
        character={editBuffer}
        onChange={handleChange}
        isCreateMode={isCreateMode}
        onEvolved={handleEvolved}
      />
    )
  ) : (
    <div className="flex h-full items-center justify-center text-sm text-neutral-500">
      Select a character or create a new one
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-800 px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
            Characters
          </span>
          <div className="min-w-[240px] max-w-[420px] flex-1">
            <Select
              size="sm"
              value={headerCharacterSelectValue}
              onChange={(e) => handleHeaderCharacterSelect(e.target.value)}
            >
              <option value="">Select character...</option>
              <option value="__create_new__">+ Create New Character</option>
              {selectedCharacterId && !characters.some((c) => c.character_id === selectedCharacterId) && (
                <option value={selectedCharacterId}>
                  {selectedCharacterLabel || selectedCharacterId}
                </option>
              )}
              {characters.map((char) => (
                <option key={char.character_id} value={char.character_id}>
                  {char.display_name || char.name || char.character_id}
                </option>
              ))}
            </Select>
          </div>
          {/* Metadata chips — visible on medium+ screens */}
          {!isCreateMode && selectedCharacterId ? (
            <div className="hidden items-center gap-1.5 md:flex">
              <code className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
                {editBuffer.character_id}
              </code>
              {editBuffer.species && (
                <span className="rounded bg-blue-900/50 px-1.5 py-0.5 text-[10px] text-blue-300">
                  {editBuffer.species}
                </span>
              )}
              {editBuffer.archetype && (
                <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-300">
                  {editBuffer.archetype}
                </span>
              )}
            </div>
          ) : isCreateMode ? (
            <span className="hidden text-[11px] text-neutral-500 md:block">New draft</span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setShowRegistryPanel((v) => !v)}
          >
            {showRegistryPanel ? 'Hide Registry' : 'Show Registry'}
          </Button>
          {hasSelection && !isCreateMode && (
            <Button
              variant="danger"
              size="xs"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete
            </Button>
          )}
          {hasSelection && (
            <Button
              variant="primary"
              size="xs"
              onClick={handleSave}
              loading={isSaving}
              disabled={isCreateMode && !editBuffer.character_id}
            >
              {isCreateMode ? 'Create' : 'Save'}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="shrink-0 border-b border-red-800/40 bg-red-900/20 px-4 py-1.5 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Body */}
      {showRegistryPanel ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <SidebarPaneShell
            title="Registry"
            variant="dark"
            widthClassName="w-[300px]"
            bodyScrollable={false}
          >
            <CharacterSidebar
              embedded
              characters={characters}
              selectedCharacterId={selectedCharacterId}
              onSelect={handleSelect}
              onCreateNew={handleCreateNew}
              onSearchResults={handleSearchResults}
            />
          </SidebarPaneShell>
          <div className="min-h-0 flex-1 overflow-hidden">
            {mainContent}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden">
          {mainContent}
        </div>
      )}

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Character"
      >
        Are you sure you want to delete &ldquo;
        {editBuffer.display_name || editBuffer.name || selectedCharacterId}
        &rdquo;? This will soft-delete the character.
      </ConfirmModal>
    </div>
  );
}
