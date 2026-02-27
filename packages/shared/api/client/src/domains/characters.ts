import type { PixSimApiClient } from '../client';

// ===== Structured Reference Asset =====

export interface ReferenceAsset {
  asset_id: string;
  kind: string; // identity, expression_ref, pose_ref, outfit_ref
  shot?: string; // full_body, bust, closeup_face
  view?: string; // front, three_quarter_left, profile_left, side, back
  pose?: string; // neutral_stand, sit, reach, turn, walk_ready
  expression_state?: string; // idle, thinking, smile, surprised, angry, sad
  outfit?: string; // base_neutral, uniform_a, ...
  background?: string; // neutral_gray, ...
  is_primary?: boolean;
  tags?: Record<string, unknown>;
}

// ===== Response Types =====

export interface CharacterSummary {
  id: string;
  character_id: string;
  name: string | null;
  display_name: string | null;
  category: string;
  species: string | null;
  archetype: string | null;
  visual_traits: Record<string, unknown>;
  personality_traits: Record<string, unknown>;
  behavioral_patterns: Record<string, unknown>;
  render_style: string | null;
  version_number: number | null;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface CharacterDetail extends CharacterSummary {
  voice_profile: Record<string, unknown>;
  render_instructions: string | null;
  reference_images: string[];
  reference_assets: ReferenceAsset[];
  surface_assets: Record<string, unknown>[];
  game_npc_id: number | null;
  sync_with_game: boolean;
  game_metadata: Record<string, unknown>;
  version_family_id: string | null;
  parent_character_id: string | null;
  version_message: string | null;
  last_used_at: string | null;
  tags: Record<string, unknown>;
  character_metadata: Record<string, unknown>;
  created_by: string | null;
}

// ===== Request Types =====

export interface CreateCharacterRequest {
  character_id: string;
  name?: string;
  display_name?: string;
  category?: string;
  species?: string;
  archetype?: string;
  visual_traits?: Record<string, unknown>;
  personality_traits?: Record<string, unknown>;
  behavioral_patterns?: Record<string, unknown>;
  voice_profile?: Record<string, unknown>;
  render_style?: string;
  render_instructions?: string;
  reference_images?: string[];
  reference_assets?: ReferenceAsset[];
  game_npc_id?: number | null;
  sync_with_game?: boolean;
  tags?: Record<string, unknown>;
}

export interface UpdateCharacterRequest {
  name?: string;
  display_name?: string;
  visual_traits?: Record<string, unknown>;
  personality_traits?: Record<string, unknown>;
  behavioral_patterns?: Record<string, unknown>;
  voice_profile?: Record<string, unknown>;
  render_instructions?: string;
  reference_images?: string[];
  reference_assets?: ReferenceAsset[];
  tags?: Record<string, unknown>;
  render_style?: string;
  game_npc_id?: number | null;
  sync_with_game?: boolean;
  create_version?: boolean;
  version_message?: string;
}

export interface ListCharactersQuery {
  category?: string;
  species?: string;
  limit?: number;
  offset?: number;
}

// ===== API Factory =====

export function createCharactersApi(client: PixSimApiClient) {
  return {
    async listCharacters(query?: ListCharactersQuery): Promise<CharacterSummary[]> {
      const response = await client.get<readonly CharacterSummary[]>(
        '/characters',
        { params: query },
      );
      return [...response];
    },

    async searchCharacters(q: string, limit?: number): Promise<CharacterSummary[]> {
      const response = await client.get<readonly CharacterSummary[]>(
        '/characters/search',
        { params: { q, limit } },
      );
      return [...response];
    },

    async getCharacter(characterId: string): Promise<CharacterDetail> {
      return client.get<CharacterDetail>(
        `/characters/${encodeURIComponent(characterId)}`,
      );
    },

    async createCharacter(request: CreateCharacterRequest): Promise<CharacterDetail> {
      return client.post<CharacterDetail>('/characters', request);
    },

    async updateCharacter(
      characterId: string,
      request: UpdateCharacterRequest,
    ): Promise<CharacterDetail> {
      return client.put<CharacterDetail>(
        `/characters/${encodeURIComponent(characterId)}`,
        request,
      );
    },

    async deleteCharacter(
      characterId: string,
      soft?: boolean,
    ): Promise<void> {
      await client.delete<void>(
        `/characters/${encodeURIComponent(characterId)}`,
        { params: soft != null ? { soft } : undefined },
      );
    },

    async getCharacterHistory(characterId: string): Promise<CharacterSummary[]> {
      const response = await client.get<readonly CharacterSummary[]>(
        `/characters/${encodeURIComponent(characterId)}/history`,
      );
      return [...response];
    },

    async evolveCharacter(
      characterId: string,
      request: UpdateCharacterRequest,
    ): Promise<CharacterDetail> {
      return client.post<CharacterDetail>(
        `/characters/${encodeURIComponent(characterId)}/evolve`,
        request,
      );
    },
  };
}
