import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createCharacter,
  getCharacter,
  listCharacters,
  updateCharacter,
  type CharacterDetail,
  type CharacterSummary,
} from '@lib/api/characters';

import { authoringProjectBundleContributor } from '../characterLibraryProjectExtension';

vi.mock('@lib/api/characters', () => ({
  listCharacters: vi.fn(),
  getCharacter: vi.fn(),
  createCharacter: vi.fn(),
  updateCharacter: vi.fn(),
}));

function makeSummary(characterId: string): CharacterSummary {
  const now = '2026-03-07T00:00:00Z';
  return {
    id: characterId,
    character_id: characterId,
    name: characterId,
    display_name: characterId,
    category: 'creature',
    species: null,
    archetype: null,
    visual_traits: {},
    personality_traits: {},
    behavioral_patterns: {},
    render_style: null,
    version_number: null,
    usage_count: 0,
    created_at: now,
    updated_at: now,
  };
}

function makeDetail(
  characterId: string,
  opts?: { familyId?: string | null; parentId?: string | null; version?: number | null },
): CharacterDetail {
  return {
    ...makeSummary(characterId),
    voice_profile: {},
    render_instructions: null,
    reference_images: [],
    reference_assets: [],
    surface_assets: [],
    game_npc_id: null,
    sync_with_game: false,
    game_metadata: {},
    version_family_id: opts?.familyId ?? null,
    parent_character_id: opts?.parentId ?? null,
    version_message: null,
    last_used_at: null,
    tags: {},
    character_metadata: {},
    created_by: null,
    version_number: opts?.version ?? null,
  };
}

describe('characterLibraryProjectExtension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null payload when no characters exist', async () => {
    vi.mocked(listCharacters).mockResolvedValueOnce([]);

    const payload = await authoringProjectBundleContributor.export?.({
      worldId: 1,
      bundle: {} as never,
    });

    expect(payload).toBeNull();
    expect(getCharacter).not.toHaveBeenCalled();
  });

  it('exports character snapshots and variant families', async () => {
    vi.mocked(listCharacters)
      .mockResolvedValueOnce([makeSummary('hero'), makeSummary('hero_v2')])
      .mockResolvedValueOnce([]);
    vi.mocked(getCharacter)
      .mockResolvedValueOnce(
        makeDetail('hero', { familyId: 'hero_family', version: 1 }),
      )
      .mockResolvedValueOnce(
        makeDetail('hero_v2', { familyId: 'hero_family', version: 2 }),
      );

    const payload = (await authoringProjectBundleContributor.export?.({
      worldId: 1,
      bundle: {} as never,
    })) as {
      version: number;
      items: Array<{ character_id: string }>;
      variant_families: Array<{ id: string; count: number }>;
    };

    expect(payload.version).toBe(1);
    expect(payload.items.map((item) => item.character_id)).toEqual(['hero', 'hero_v2']);
    expect(payload.variant_families).toEqual([
      {
        id: 'hero_family',
        name: 'hero_family',
        count: 2,
        members: [
          { character_id: 'hero', display_name: 'hero', version_number: 1 },
          { character_id: 'hero_v2', display_name: 'hero_v2', version_number: 2 },
        ],
      },
    ]);
  });

  it('imports by updating existing characters and creating missing ones', async () => {
    vi.mocked(listCharacters)
      .mockResolvedValueOnce([makeSummary('existing_character')])
      .mockResolvedValueOnce([]);
    vi.mocked(updateCharacter).mockResolvedValueOnce(
      makeDetail('existing_character'),
    );
    vi.mocked(createCharacter).mockResolvedValueOnce(
      makeDetail('new_character'),
    );

    const outcome = await authoringProjectBundleContributor.import?.(
      {
        version: 1,
        items: [
          {
            character_id: 'existing_character',
            name: 'Existing',
            display_name: 'Existing',
            category: 'creature',
            species: null,
            archetype: null,
            visual_traits: {},
            personality_traits: {},
            behavioral_patterns: {},
            voice_profile: {},
            render_style: null,
            render_instructions: null,
            reference_images: [],
            reference_assets: [],
            game_npc_id: null,
            sync_with_game: false,
            tags: {},
            version_family_id: null,
            parent_character_id: null,
            version_number: null,
          },
          {
            character_id: 'new_character',
            name: 'New',
            display_name: 'New',
            category: 'creature',
            species: null,
            archetype: null,
            visual_traits: {},
            personality_traits: {},
            behavioral_patterns: {},
            voice_profile: {},
            render_style: null,
            render_instructions: null,
            reference_images: [],
            reference_assets: [],
            game_npc_id: null,
            sync_with_game: false,
            tags: {},
            version_family_id: null,
            parent_character_id: null,
            version_number: null,
          },
        ],
        variant_families: [],
      },
      {} as never,
    );

    expect(updateCharacter).toHaveBeenCalledWith(
      'existing_character',
      expect.objectContaining({ display_name: 'Existing' }),
    );
    expect(createCharacter).toHaveBeenCalledWith(
      expect.objectContaining({ character_id: 'new_character' }),
    );
    expect(outcome).toEqual({});
  });
});
