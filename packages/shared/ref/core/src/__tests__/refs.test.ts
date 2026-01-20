/**
 * Ref Core Tests
 *
 * Tests for ref builders, parsers, type guards, and extractors.
 */

import { describe, it, expect } from 'vitest';
import {
  Ref,
  parseRef,
  tryParseRef,
  isNpcRef,
  isSceneIdRef,
  isLocationRef,
  isCharacterRef,
  isEntityRef,
  extractNpcId,
  extractSceneId,
  extractSceneInfo,
  extractLocationId,
  getRefType,
} from '../index';

describe('Ref Builders', () => {
  it('builds npc ref', () => {
    expect(Ref.npc(123)).toBe('npc:123');
  });

  it('builds scene ref with default game type', () => {
    expect(Ref.scene(456)).toBe('scene:game:456');
  });

  it('builds scene ref with explicit content type', () => {
    expect(Ref.scene(789, 'content')).toBe('scene:content:789');
  });

  it('builds location ref', () => {
    expect(Ref.location(42)).toBe('location:42');
  });

  it('builds character ref', () => {
    expect(Ref.character('550e8400-e29b-41d4-a716-446655440000')).toBe(
      'character:550e8400-e29b-41d4-a716-446655440000'
    );
  });

  it('builds role ref', () => {
    expect(Ref.role(123, 'protagonist')).toBe('role:123:protagonist');
  });
});

describe('Type Guards', () => {
  it('isNpcRef validates npc refs', () => {
    expect(isNpcRef('npc:123')).toBe(true);
    expect(isNpcRef('npc:0')).toBe(true);
    expect(isNpcRef('npc:-1')).toBe(false);
    expect(isNpcRef('npc:')).toBe(false);
    expect(isNpcRef('npc:abc')).toBe(false);
    expect(isNpcRef('location:123')).toBe(false);
  });

  it('isSceneIdRef validates scene refs', () => {
    expect(isSceneIdRef('scene:game:123')).toBe(true);
    expect(isSceneIdRef('scene:content:456')).toBe(true);
    expect(isSceneIdRef('scene:123')).toBe(false); // missing type
    expect(isSceneIdRef('scene:other:123')).toBe(false); // invalid type
  });

  it('isLocationRef validates location refs', () => {
    expect(isLocationRef('location:42')).toBe(true);
    expect(isLocationRef('location:abc')).toBe(false);
  });

  it('isCharacterRef validates character refs with UUID', () => {
    expect(isCharacterRef('character:550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isCharacterRef('character:not-a-uuid')).toBe(false);
    expect(isCharacterRef('character:123')).toBe(false);
  });

  it('isEntityRef validates any entity ref', () => {
    expect(isEntityRef('npc:123')).toBe(true);
    expect(isEntityRef('scene:game:456')).toBe(true);
    expect(isEntityRef('location:42')).toBe(true);
    expect(isEntityRef('invalid:ref')).toBe(false);
  });
});

describe('parseRef', () => {
  it('parses npc ref', () => {
    const result = parseRef('npc:123');
    expect(result).toEqual({ type: 'npc', id: 123 });
  });

  it('parses scene ref with type', () => {
    const result = parseRef('scene:game:456');
    expect(result).toEqual({ type: 'scene', id: 456, sceneType: 'game' });
  });

  it('parses scene ref with content type', () => {
    const result = parseRef('scene:content:789');
    expect(result).toEqual({ type: 'scene', id: 789, sceneType: 'content' });
  });

  it('parses location ref', () => {
    const result = parseRef('location:42');
    expect(result).toEqual({ type: 'location', id: 42 });
  });

  it('parses role ref', () => {
    const result = parseRef('role:123:protagonist');
    expect(result).toEqual({ type: 'role', sceneId: 123, roleName: 'protagonist' });
  });

  it('returns null for invalid refs', () => {
    expect(parseRef('')).toBeNull();
    expect(parseRef('invalid')).toBeNull();
    expect(parseRef('npc:')).toBeNull();
    expect(parseRef('npc:abc')).toBeNull();
    expect(parseRef('scene:123')).toBeNull(); // missing type
    expect(parseRef('scene:invalid:123')).toBeNull(); // invalid type
  });

  it('parses character ref with UUID', () => {
    const result = parseRef('character:550e8400-e29b-41d4-a716-446655440000');
    expect(result).toEqual({
      type: 'character',
      id: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('rejects character ref with invalid UUID', () => {
    expect(parseRef('character:not-a-uuid')).toBeNull();
  });
});

describe('tryParseRef', () => {
  it('returns success for valid refs', () => {
    const result = tryParseRef('npc:123');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.parsed).toEqual({ type: 'npc', id: 123 });
    }
  });

  it('returns error context for invalid refs', () => {
    const result = tryParseRef('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('empty_string');
    }
  });

  it('returns missing_scene_type for scene:123', () => {
    const result = tryParseRef('scene:123');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('missing_scene_type');
    }
  });

  it('returns invalid_scene_type for scene:other:123', () => {
    const result = tryParseRef('scene:other:123');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('invalid_scene_type');
    }
  });
});

describe('Extractors', () => {
  it('extractNpcId returns number for valid ref', () => {
    expect(extractNpcId('npc:123')).toBe(123);
    expect(extractNpcId('location:123')).toBeNull();
    expect(extractNpcId('invalid')).toBeNull();
  });

  it('extractSceneId returns number for valid ref', () => {
    expect(extractSceneId('scene:game:456')).toBe(456);
    expect(extractSceneId('scene:content:789')).toBe(789);
    expect(extractSceneId('scene:123')).toBeNull();
  });

  it('extractSceneInfo returns id and type', () => {
    expect(extractSceneInfo('scene:game:456')).toEqual({ id: 456, sceneType: 'game' });
    expect(extractSceneInfo('scene:content:789')).toEqual({ id: 789, sceneType: 'content' });
    expect(extractSceneInfo('npc:123')).toBeNull();
  });

  it('extractLocationId returns number for valid ref', () => {
    expect(extractLocationId('location:42')).toBe(42);
    expect(extractLocationId('npc:42')).toBeNull();
  });
});

describe('getRefType', () => {
  it('extracts type prefix without full parsing', () => {
    expect(getRefType('npc:123')).toBe('npc');
    expect(getRefType('scene:game:456')).toBe('scene');
    expect(getRefType('character:uuid')).toBe('character');
  });

  it('returns null for invalid strings', () => {
    expect(getRefType('')).toBeNull();
    expect(getRefType('no-colon')).toBeNull();
  });
});
