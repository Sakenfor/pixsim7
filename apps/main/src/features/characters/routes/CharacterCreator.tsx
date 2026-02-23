import { Button, ConfirmModal } from '@pixsim7/shared.ui';
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
  type CharacterContextSummary,
} from '@features/contextHub';

import { CharacterEditor } from '../components/CharacterEditor';
import { CharacterSidebar } from '../components/CharacterSidebar';

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

export function CharacterCreator() {
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState<Partial<CharacterDetail>>(EMPTY_CHARACTER);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  const handleSelect = (characterId: string) => {
    setIsCreateMode(false);
    setSelectedCharacterId(characterId);
  };

  const handleCreateNew = () => {
    setIsCreateMode(true);
    setSelectedCharacterId(null);
    setEditBuffer({ ...EMPTY_CHARACTER });
  };

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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
        <h2 className="text-sm font-semibold text-neutral-200">Character Registry</h2>
        <div className="flex items-center gap-2">
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
        <div className="border-b border-red-800/40 bg-red-900/20 px-4 py-1.5 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <CharacterSidebar
          characters={characters}
          selectedCharacterId={selectedCharacterId}
          onSelect={handleSelect}
          onCreateNew={handleCreateNew}
          onSearchResults={handleSearchResults}
        />

        <div className="flex-1 overflow-hidden">
          {hasSelection ? (
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
          )}
        </div>
      </div>

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
