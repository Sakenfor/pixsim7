import type { User } from '@pixsim7/shared.auth.core';
import { isAdminUser } from '@pixsim7/shared.auth.core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __resetAuthoringMethodsForTest,
  listAvailableAuthoringMethods,
  listAuthoringMethods,
  registerAuthoringMethod,
} from '../registry';
import type { AuthoringMethod } from '../types';

// ── Fixtures ──────────────────────────────────────────────────────────

function makeMethod(
  id: string,
  overrides: Partial<AuthoringMethod> = {},
): AuthoringMethod {
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
    __resetAuthoringMethodsForTest();
  });
  afterEach(() => {
    __resetAuthoringMethodsForTest();
  });

  it('includes methods without an isAvailable predicate for any user', () => {
    registerAuthoringMethod(makeMethod('cue-pack'));
    expect(listAvailableAuthoringMethods(null).map((m) => m.id)).toEqual(['cue-pack']);
    expect(listAvailableAuthoringMethods(makeUser()).map((m) => m.id)).toEqual([
      'cue-pack',
    ]);
  });

  it('hides admin-only methods from non-admin users', () => {
    registerAuthoringMethod(makeMethod('cue-pack'));
    registerAuthoringMethod(
      makeMethod('core-pack', { isAvailable: (user) => isAdminUser(user) }),
    );

    const asGuest = listAvailableAuthoringMethods(null).map((m) => m.id);
    expect(asGuest).toEqual(['cue-pack']);

    const asPlainUser = listAvailableAuthoringMethods(makeUser({ role: 'user' })).map(
      (m) => m.id,
    );
    expect(asPlainUser).toEqual(['cue-pack']);
  });

  it('shows admin-only methods to admins (by role and by is_admin flag)', () => {
    registerAuthoringMethod(makeMethod('cue-pack'));
    registerAuthoringMethod(
      makeMethod('core-pack', { isAvailable: (user) => isAdminUser(user) }),
    );

    const byRole = listAvailableAuthoringMethods(makeUser({ role: 'admin' })).map(
      (m) => m.id,
    );
    expect(byRole).toContain('core-pack');

    const byFlag = listAvailableAuthoringMethods(
      makeUser({ is_admin: true }),
    ).map((m) => m.id);
    expect(byFlag).toContain('core-pack');
  });

  it('preserves sort order across the available filter', () => {
    registerAuthoringMethod(makeMethod('z-method', { order: 5 }));
    registerAuthoringMethod(
      makeMethod('a-admin', { order: 1, isAvailable: () => true }),
    );
    registerAuthoringMethod(makeMethod('m-mid', { order: 3 }));
    expect(listAvailableAuthoringMethods(makeUser()).map((m) => m.id)).toEqual([
      'a-admin',
      'm-mid',
      'z-method',
    ]);
  });

  it('returns an empty list when every method is gated and the user passes none', () => {
    registerAuthoringMethod(
      makeMethod('admin-only', { isAvailable: (user) => isAdminUser(user) }),
    );
    expect(listAvailableAuthoringMethods(null)).toEqual([]);
    expect(listAvailableAuthoringMethods(makeUser({ role: 'user' }))).toEqual([]);
  });

  it('supports permission-based gates', () => {
    registerAuthoringMethod(
      makeMethod('experimental', {
        isAvailable: (user) =>
          !!user?.permissions?.includes('authoring.experimental'),
      }),
    );

    expect(listAvailableAuthoringMethods(makeUser()).map((m) => m.id)).toEqual([]);
    expect(
      listAvailableAuthoringMethods(
        makeUser({ permissions: ['authoring.experimental'] }),
      ).map((m) => m.id),
    ).toEqual(['experimental']);
  });

  it('keeps `listAuthoringMethods` unfiltered', () => {
    registerAuthoringMethod(
      makeMethod('admin-only', { isAvailable: () => false }),
    );
    expect(listAuthoringMethods().map((m) => m.id)).toEqual(['admin-only']);
  });
});
