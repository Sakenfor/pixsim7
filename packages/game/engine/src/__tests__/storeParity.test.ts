/**
 * TS side of the TS<->Py store parity suite.
 *
 * Loads `tests/fixtures/store_parity_fixtures.json` (shared with the Python
 * test at `pixsim7/backend/tests/services/game/test_store_parity.py`) and runs
 * each scenario through the engine store. Both sides assert on the same facts
 * against the same fixture, so any normalization drift between the two
 * implementations shows up immediately.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import type { GameSessionDTO } from '@pixsim7/shared.types';
import {
  getSessionGameObjectStore,
  listSessionGameObjects,
  removeSessionGameObjects,
  upsertSessionGameObjects,
} from '../runtime/gameObjectStore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(
  __dirname,
  '../../../../../tests/fixtures/store_parity_fixtures.json'
);

type ExpectItem = { ref: string; name?: string; quantity?: number };
type ExpectNpc = {
  ref: string;
  name?: string;
  role?: string;
  components_by_type?: Record<string, Record<string, unknown>>;
};
type Scenario = {
  name: string;
  world_id: number;
  initial_flags: Record<string, unknown>;
  operations: Array<
    | { op: 'upsert'; objects: any[] }
    | { op: 'remove'; refs: string[] }
  >;
  expect: {
    canonical_refs?: string[];
    items?: ExpectItem[];
    npcs?: ExpectNpc[];
  };
};

const fixture = JSON.parse(
  fs.readFileSync(fixturePath, 'utf-8')
) as { scenarios: Scenario[] };

function makeSession(initialFlags: Record<string, unknown>, worldId: number): GameSessionDTO {
  return {
    id: 1,
    user_id: 1,
    scene_id: 1,
    current_node_id: 1,
    world_id: worldId,
    flags: JSON.parse(JSON.stringify(initialFlags)),
    stats: {},
    world_time: 0,
    version: 1,
  } as GameSessionDTO;
}

function execute(session: GameSessionDTO, ops: Scenario['operations']): GameSessionDTO {
  let current = session;
  for (const op of ops) {
    if (op.op === 'upsert') {
      current = upsertSessionGameObjects(current, op.objects);
    } else if (op.op === 'remove') {
      current = removeSessionGameObjects(current, op.refs);
    } else {
      throw new Error(`Unknown parity op: ${(op as any).op}`);
    }
  }
  return current;
}

describe('store parity (TS<->Py shared fixture)', () => {
  for (const scenario of fixture.scenarios) {
    it(scenario.name, () => {
      const session = execute(
        makeSession(scenario.initial_flags, scenario.world_id),
        scenario.operations
      );
      const expectFields = scenario.expect;

      // Canonical store keys (sorted).
      const store = getSessionGameObjectStore(session);
      const actualRefs = Object.keys(store.objects).sort();
      expect(actualRefs).toEqual([...(expectFields.canonical_refs ?? [])].sort());

      // Items projection.
      if (expectFields.items) {
        const items = listSessionGameObjects(session, { kind: 'item' });
        const byRef = new Map(items.map((i) => [i.ref ?? '', i]));
        expect([...byRef.keys()].sort()).toEqual(
          expectFields.items.map((i) => i.ref).sort()
        );
        for (const ei of expectFields.items) {
          const actual = byRef.get(ei.ref);
          expect(actual).toBeDefined();
          if (ei.name !== undefined) expect(actual!.name).toBe(ei.name);
          if (ei.quantity !== undefined) {
            const qty = (actual as any).itemData?.quantity;
            expect(qty).toBe(ei.quantity);
          }
        }
      }

      // NPCs projection.
      if (expectFields.npcs) {
        const npcs = listSessionGameObjects(session, { kind: 'npc' });
        const byRef = new Map(npcs.map((n) => [n.ref ?? '', n]));
        expect([...byRef.keys()].sort()).toEqual(
          expectFields.npcs.map((n) => n.ref).sort()
        );
        for (const en of expectFields.npcs) {
          const actual = byRef.get(en.ref);
          expect(actual).toBeDefined();
          if (en.name !== undefined) expect(actual!.name).toBe(en.name);
          if (en.role !== undefined) {
            const npcData = (actual as any).npcData;
            expect(npcData?.role).toBe(en.role);
          }
          if (en.components_by_type) {
            const components = ((actual as any).components ?? []) as any[];
            for (const [ctype, expectedData] of Object.entries(en.components_by_type)) {
              const comp = components.find((c) => c.type === ctype);
              expect(comp, `npc ${en.ref} missing component ${ctype}`).toBeDefined();
              for (const [key, value] of Object.entries(expectedData)) {
                expect((comp as any).data?.[key]).toBe(value);
              }
            }
          }
        }
      }
    });
  }
});
