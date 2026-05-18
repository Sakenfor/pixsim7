import type { User } from '@pixsim7/shared.auth.core';
import { isAdminUser } from '@pixsim7/shared.auth.core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __resetBlockAuthoringMethodsForTest,
  listAvailableBlockAuthoringMethods,
  listBlockAuthoringMethods,
  registerBlockAuthoringMethod,
} from '../registry';
import type { BlockAuthoringMethod } from '../types';

// ── Fixtures ──────────────────────────────────────────────────────────

function makeMethod(
  id: string,
  overrides: Partial<BlockAuthoringMethod> = {},
): BlockAuthoringMethod {
  return {
    id,
    label: id,
    description: `${id} method`,
    Editor: () => null,
    ...overrides,
  };
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    email: 'u@example.com',
    username: 'u',
    is_active: true,
    created_at: '2020-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('block authoring registry — auth gating', () => {
  beforeEach(() => {
    __resetBlockAuthoringMethodsForTest();
  });
  afterEach(() => {
    __resetBlockAuthoringMethodsForTest();
  });

  it('includes methods without an isAvailable predicate for any user', () => {
    registerBlockAuthoringMethod(makeMethod('cue-pack'));
    expect(listAvailableBlockAuthoringMethods(null).map((m) => m.id)).toEqual(['cue-pack']);
    expect(listAvailableBlockAuthoringMethods(makeUser()).map((m) => m.id)).toEqual([
      'cue-pack',
    ]);
  });

  it('hides admin-only methods from non-admin users', () => {
    registerBlockAuthoringMethod(makeMethod('cue-pack'));
    registerBlockAuthoringMethod(
      makeMethod('core-pack', { isAvailable: (user) => isAdminUser(user) }),
    );

    const asGuest = listAvailableBlockAuthoringMethods(null).map((m) => m.id);
    expect(asGuest).toEqual(['cue-pack']);

    const asPlainUser = listAvailableBlockAuthoringMethods(makeUser({ role: 'user' })).map(
      (m) => m.id,
    );
    expect(asPlainUser).toEqual(['cue-pack']);
  });

  it('shows admin-only methods to admins (by role and by is_admin flag)', () => {
    registerBlockAuthoringMethod(makeMethod('cue-pack'));
    registerBlockAuthoringMethod(
      makeMethod('core-pack', { isAvailable: (user) => isAdminUser(user) }),
    );

    const byRole = listAvailableBlockAuthoringMethods(makeUser({ role: 'admin' })).map(
      (m) => m.id,
    );
    expect(byRole).toContain('core-pack');

    const byFlag = listAvailableBlockAuthoringMethods(
      makeUser({ is_admin: true }),
    ).map((m) => m.id);
    expect(byFlag).toContain('core-pack');
  });

  it('preserves sort order across the available filter', () => {
    registerBlockAuthoringMethod(makeMethod('z-method', { order: 5 }));
    registerBlockAuthoringMethod(
      makeMethod('a-admin', { order: 1, isAvailable: () => true }),
    );
    registerBlockAuthoringMethod(makeMethod('m-mid', { order: 3 }));
    expect(listAvailableBlockAuthoringMethods(makeUser()).map((m) => m.id)).toEqual([
      'a-admin',
      'm-mid',
      'z-method',
    ]);
  });

  it('returns an empty list when every method is gated and the user passes none', () => {
    registerBlockAuthoringMethod(
      makeMethod('admin-only', { isAvailable: (user) => isAdminUser(user) }),
    );
    expect(listAvailableBlockAuthoringMethods(null)).toEqual([]);
    expect(listAvailableBlockAuthoringMethods(makeUser({ role: 'user' }))).toEqual([]);
  });

  it('supports permission-based gates', () => {
    registerBlockAuthoringMethod(
      makeMethod('experimental', {
        isAvailable: (user) =>
          !!user?.permissions?.includes('authoring.experimental'),
      }),
    );

    expect(listAvailableBlockAuthoringMethods(makeUser()).map((m) => m.id)).toEqual([]);
    expect(
      listAvailableBlockAuthoringMethods(
        makeUser({ permissions: ['authoring.experimental'] }),
      ).map((m) => m.id),
    ).toEqual(['experimental']);
  });

  it('keeps `listBlockAuthoringMethods` unfiltered', () => {
    registerBlockAuthoringMethod(
      makeMethod('admin-only', { isAvailable: () => false }),
    );
    expect(listBlockAuthoringMethods().map((m) => m.id)).toEqual(['admin-only']);
  });
});
