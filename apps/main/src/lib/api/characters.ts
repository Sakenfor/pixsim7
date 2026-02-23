/**
 * Characters API Client (web wrapper)
 *
 * Delegates to environment-neutral domain client in @pixsim7/shared.api.client.
 */
import { createCharactersApi } from '@pixsim7/shared.api.client/domains';

import { pixsimClient } from './client';

export type {
  CharacterSummary,
  CharacterDetail,
  CreateCharacterRequest,
  UpdateCharacterRequest,
  ListCharactersQuery,
  ReferenceAsset,
} from '@pixsim7/shared.api.client/domains';

const charactersApi = createCharactersApi(pixsimClient);

export const listCharacters = charactersApi.listCharacters;
export const searchCharacters = charactersApi.searchCharacters;
export const getCharacter = charactersApi.getCharacter;
export const createCharacter = charactersApi.createCharacter;
export const updateCharacter = charactersApi.updateCharacter;
export const deleteCharacter = charactersApi.deleteCharacter;
export const getCharacterHistory = charactersApi.getCharacterHistory;
export const evolveCharacter = charactersApi.evolveCharacter;
