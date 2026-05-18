import { describe, expect, it } from 'vitest';
import { buildEntityRefForKind } from '../entityRefStrategy';

/**
 * Parity guard: these expectations are exactly what the old hardcoded
 * `GameRuntime.buildEntityRef` switch produced for the same normalized inputs.
 */
function build(kind: string, id: string) {
  const numeric = Number(id);
  return buildEntityRefForKind(kind, id, numeric, Number.isFinite(numeric));
}

describe('buildEntityRefForKind (switch-parity extraction)', () => {
  it('typed numeric kinds use canonical Ref builders', () => {
    expect(build('npc', '12')).toBe('npc:12');
    expect(build('location', '3')).toBe('location:3');
    expect(build('scene', '4')).toBe('scene:game:4'); // Ref.scene default type
    expect(build('asset', '5')).toBe('asset:5');
    expect(build('generation', '6')).toBe('generation:6');
    expect(build('world', '7')).toBe('world:7');
    expect(build('session', '8')).toBe('session:8');
  });

  it('typed kinds with a non-numeric id fall back to verbatim string ref', () => {
    expect(build('npc', 'bob')).toBe('npc:bob');
    expect(build('scene', 'intro')).toBe('scene:intro');
  });

  it('verbatim string kinds keep the id un-normalized', () => {
    expect(build('item', '007')).toBe('item:007');
    expect(build('prop', 'door_1')).toBe('prop:door_1');
    expect(build('trigger', 'zone-a')).toBe('trigger:zone-a');
    expect(build('player', 'p1')).toBe('player:p1');
    // numeric-looking id is NOT collapsed for these kinds
    expect(build('item', '010')).toBe('item:010');
  });

  it('default (custom) kinds numeric-normalize the id when numeric', () => {
    expect(build('vehicle', '07')).toBe('vehicle:7');
    expect(build('vehicle', 'shuttle_1')).toBe('vehicle:shuttle_1');
    expect(build('robot', '42')).toBe('robot:42');
  });
});
