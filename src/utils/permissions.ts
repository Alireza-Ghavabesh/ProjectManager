import { User } from '../types';

export function hasPerm(user: User | null | undefined, code: string | string[]): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const perms = Array.isArray(user.permissions) ? user.permissions : [];
  if (Array.isArray(code)) {
    return code.some((c) => perms.includes(c));
  }
  return perms.includes(code);
}

export function hasAnyPerm(user: User | null | undefined, codes: string[]): boolean {
  return hasPerm(user, codes);
}

export function hasAllPerms(user: User | null | undefined, codes: string[]): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const perms = Array.isArray(user.permissions) ? user.permissions : [];
  return codes.every((c) => perms.includes(c));
}
