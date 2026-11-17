import { User } from '../types';

export const EXPLICIT_ONLY_PERMISSIONS = new Set([
  'projects.manual_approve',
  'project_list.view',
  'project_list.create',
  'project_list.edit',
  'project_list.delete',
]);

export function hasPerm(user: User | null | undefined, code: string | string[]): boolean {
  if (!user) return false;
  const perms = Array.isArray(user.permissions) ? user.permissions : [];
  const checkSingle = (c: string) => {
    if (EXPLICIT_ONLY_PERMISSIONS.has(c)) {
      return perms.includes(c);
    }
    return user.role === 'ADMIN' || perms.includes(c);
  };
  if (Array.isArray(code)) {
    return code.some((c) => checkSingle(c));
  }
  return checkSingle(code);
}

export function hasAnyPerm(user: User | null | undefined, codes: string[]): boolean {
  return hasPerm(user, codes);
}

export function hasAllPerms(user: User | null | undefined, codes: string[]): boolean {
  if (!user) return false;
  const perms = Array.isArray(user.permissions) ? user.permissions : [];
  return codes.every((c) => {
    if (EXPLICIT_ONLY_PERMISSIONS.has(c)) {
      return perms.includes(c);
    }
    return user.role === 'ADMIN' || perms.includes(c);
  });
}
