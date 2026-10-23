import { describe, it, expect } from 'vitest';
import { hasPermission } from '../permission';

const roleWith = (perms) => ({ Role: { code: 'PROCUREMENT', Permissions: perms } });

describe('hasPermission — RBAC + admin bypass', () => {
  it('denies when there is no user', () => {
    expect(hasPermission(null, 'PR', 'CREATE')).toBe(false);
  });
  it('admin roles bypass every check', () => {
    for (const code of ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROVIDER_ADMIN', 'DEV_ADMIN']) {
      expect(hasPermission({ Role: { code } }, 'ANYTHING', 'DELETE')).toBe(true);
    }
  });
  it('grants when a role has the exact module+action permission', () => {
    const user = roleWith([{ module: 'PR', action: 'CREATE' }]);
    expect(hasPermission(user, 'PR', 'CREATE')).toBe(true);
  });
  it('matching is case-insensitive on module and action', () => {
    const user = roleWith([{ module: 'pr', action: 'create' }]);
    expect(hasPermission(user, 'PR', 'CREATE')).toBe(true);
  });
  it('denies when the permission is for a different module or action', () => {
    const user = roleWith([{ module: 'PR', action: 'VIEW' }]);
    expect(hasPermission(user, 'PR', 'CREATE')).toBe(false);
    expect(hasPermission(user, 'ASSET', 'VIEW')).toBe(false);
  });
  it('supports the Roles[] array shape', () => {
    const user = { Roles: [{ code: 'FINANCE', Permissions: [{ module: 'FINANCE', action: 'EDIT' }] }] };
    expect(hasPermission(user, 'FINANCE', 'EDIT')).toBe(true);
    expect(hasPermission(user, 'FINANCE', 'DELETE')).toBe(false);
  });
  it('denies a functional role with no permissions rows (the UAT gap)', () => {
    expect(hasPermission({ Role: { code: 'PROCUREMENT', Permissions: [] } }, 'PR', 'CREATE')).toBe(false);
  });
});
