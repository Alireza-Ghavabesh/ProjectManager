import React, { useState, useEffect, useMemo } from 'react';
import { User, Position, StructurePositionSummary, UserGroup } from '../types';
import { api } from '../services/api';
import { PermissionsTreeModal } from './PermissionsTreeModal';
import { hasPerm, hasAnyPerm } from '../utils/permissions';
import { 
  Users, 
  Briefcase, 
  Plus, 
  Trash2, 
  Edit3, 
  Shield, 
  UserCheck, 
  X, 
  Phone, 
  Lock, 
  Search, 
  Crown,
  FolderTree,
  Layers,
  Check
} from 'lucide-react';

interface UsersPositionsManagerProps {
  users: User[];
  positions: Position[];
  currentUser: User;
  onRefresh: () => void;
}

export const UsersPositionsManager: React.FC<UsersPositionsManagerProps> = ({
  users,
  positions,
  currentUser,
  onRefresh,
}) => {
  const canViewUsers = hasAnyPerm(currentUser, [
    'system.users.view',
    'system.users.create',
    'system.users.edit',
    'system.users.delete',
    'system.permissions.manage',
  ]);
  const canCreateUser = hasPerm(currentUser, 'system.users.create');
  const canEditUser = hasPerm(currentUser, 'system.users.edit');
  const canDeleteUser = hasPerm(currentUser, 'system.users.delete');
  const canAssignAdmin = hasPerm(currentUser, 'system.users.assign_admin');
  const canManagePerms = hasPerm(currentUser, 'system.permissions.manage');

  const canViewPos = hasAnyPerm(currentUser, [
    'org.positions.view',
    'org.positions.create',
    'org.positions.edit',
    'org.positions.delete',
    'system.permissions.manage',
  ]);
  const canCreatePos = hasPerm(currentUser, 'org.positions.create');
  const canEditPos = hasPerm(currentUser, 'org.positions.edit');
  const canDeletePos = hasPerm(currentUser, 'org.positions.delete');

  const canManageGroups = canManagePerms || canEditUser || canCreateUser;

  const [subTab, setSubTab] = useState<'users' | 'positions' | 'groups' | 'permissions'>(() => {
    if (canViewUsers) return 'users';
    if (canViewPos) return 'positions';
    if (canManageGroups) return 'groups';
    return 'permissions';
  });

  useEffect(() => {
    if (subTab === 'users' && !canViewUsers) {
      setSubTab(canViewPos ? 'positions' : canManageGroups ? 'groups' : 'permissions');
    } else if (subTab === 'positions' && !canViewPos) {
      setSubTab(canViewUsers ? 'users' : canManageGroups ? 'groups' : 'permissions');
    } else if (subTab === 'groups' && !canManageGroups) {
      setSubTab(canViewUsers ? 'users' : canViewPos ? 'positions' : 'permissions');
    } else if (subTab === 'permissions' && !canManagePerms) {
      setSubTab(canViewUsers ? 'users' : canViewPos ? 'positions' : 'groups');
    }
  }, [subTab, canViewUsers, canViewPos, canManageGroups, canManagePerms]);

  // Selected for permissions modal
  const [selectedUserForPerms, setSelectedUserForPerms] = useState<User | null>(null);
  const [selectedGroupForPerms, setSelectedGroupForPerms] = useState<UserGroup | null>(null);
  const [selectedSpForPerms, setSelectedSpForPerms] = useState<{
    id: string;
    positionTitle: string;
    structureTitle?: string;
    structureId?: string;
  } | null>(null);

  // Groups state
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [searchGroupQuery, setSearchGroupQuery] = useState('');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<UserGroup | null>(null);
  const [groupTitle, setGroupTitle] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [groupColor, setGroupColor] = useState('violet');
  const [groupUserIds, setGroupUserIds] = useState<string[]>([]);
  const [groupMemberSearch, setGroupMemberSearch] = useState('');

  // Scoped structure-positions catalog for Permissions Matrix tab
  const [structurePositions, setStructurePositions] = useState<StructurePositionSummary[]>([]);
  const [structFilterId, setStructFilterId] = useState<string>('ALL');
  const [searchSpQuery, setSearchSpQuery] = useState('');

  const loadStructurePositions = async () => {
    try {
      const list = await api.getAllStructurePositions();
      setStructurePositions(list);
    } catch (err) {
      console.error('Error loading structure positions:', err);
    }
  };

  const loadGroups = async () => {
    try {
      const list = await api.getGroups();
      setGroups(list);
    } catch (err) {
      console.error('Error loading user groups:', err);
    }
  };

  useEffect(() => {
    if (canManageGroups || canViewUsers) {
      loadGroups();
    }
  }, [canManageGroups, canViewUsers, users.length]);

  useEffect(() => {
    if (canManagePerms && subTab === 'permissions') {
      loadStructurePositions();
      loadGroups();
    }
  }, [subTab, canManagePerms, users, positions]);

  const uniqueStructuresForFilter = useMemo(() => {
    const map = new Map<string, string>();
    for (const sp of structurePositions) {
      if (!map.has(sp.structureId)) {
        map.set(sp.structureId, sp.structureTitle);
      }
    }
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [structurePositions]);

  const filteredStructurePositions = useMemo(() => {
    const q = searchSpQuery.trim().toLowerCase();
    return structurePositions.filter((sp) => {
      if (structFilterId !== 'ALL' && sp.structureId !== structFilterId) return false;
      if (!q) return true;
      return (
        sp.positionTitle.toLowerCase().includes(q) ||
        sp.structureTitle.toLowerCase().includes(q)
      );
    });
  }, [structurePositions, structFilterId, searchSpQuery]);

  // Search filter
  const [searchUserQuery, setSearchUserQuery] = useState('');
  const [searchPosQuery, setSearchPosQuery] = useState('');

  // User creation / edit modal state
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userName, setUserName] = useState('');
  const [userUsername, setUserUsername] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRole, setUserRole] = useState<'ADMIN' | 'COUNCIL'>('COUNCIL');
  const [userPositionId, setUserPositionId] = useState('');
  const [userPhone, setUserPhone] = useState('');

  // Position creation / edit modal state
  const [showPosModal, setShowPosModal] = useState(false);
  const [editingPos, setEditingPos] = useState<Position | null>(null);
  const [posTitle, setPosTitle] = useState('');
  const [posDesc, setPosDesc] = useState('');
  const [posColor, setPosColor] = useState('indigo');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Open User modal
  const openUserModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setUserName(user.name);
      setUserUsername(user.username);
      setUserPassword('');
      setUserRole(user.role);
      setUserPositionId(user.positionId || '');
      setUserPhone(user.phone || '');
    } else {
      setEditingUser(null);
      setUserName('');
      setUserUsername('');
      setUserPassword('');
      setUserRole('COUNCIL');
      setUserPositionId('');
      setUserPhone('');
    }
    setError('');
    setShowUserModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim() || !userUsername.trim()) {
      setError('نام و نام کاربری الزامی هستند.');
      return;
    }
    if (!editingUser && !userPassword.trim()) {
      setError('رمز عبور برای کاربر جدید الزامی است.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (editingUser) {
        await api.updateUser(editingUser.id, {
          name: userName.trim(),
          role: userRole,
          positionId: userPositionId || undefined,
          phone: userPhone.trim(),
          password: userPassword.trim() || undefined,
        });
      } else {
        await api.createUser({
          name: userName.trim(),
          username: userUsername.trim().toLowerCase(),
          password: userPassword.trim(),
          role: userRole,
          positionId: userPositionId || undefined,
          phone: userPhone.trim(),
        });
      }

      setShowUserModal(false);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'خطا در ذخیره کاربر');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (id: string, name: string) => {
    if (!confirm(`آیا از حذف کاربر «${name}» اطمینان دارید؟`)) return;
    try {
      await api.deleteUser(id);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'خطا در حذف کاربر');
    }
  };

  // Open Position modal
  const openPosModal = (pos?: Position) => {
    if (pos) {
      setEditingPos(pos);
      setPosTitle(pos.title);
      setPosDesc(pos.description || '');
      setPosColor(pos.color || 'indigo');
    } else {
      setEditingPos(null);
      setPosTitle('');
      setPosDesc('');
      setPosColor('indigo');
    }
    setError('');
    setShowPosModal(true);
  };

  const handleSavePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!posTitle.trim()) {
      setError('عنوان سمت الزامی است.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (editingPos) {
        await api.updatePosition(editingPos.id, {
          title: posTitle.trim(),
          description: posDesc.trim(),
          color: posColor,
        });
      } else {
        await api.createPosition({
          title: posTitle.trim(),
          description: posDesc.trim(),
          color: posColor,
        });
      }

      setShowPosModal(false);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'خطا در ذخیره سمت');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePosition = async (id: string, title: string) => {
    if (!confirm(`آیا از حذف سمت «${title}» اطمینان دارید؟`)) return;
    try {
      await api.deletePosition(id);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'خطا در حذف سمت');
    }
  };


  const openGroupModal = (grp?: UserGroup) => {
    if (grp) {
      setEditingGroup(grp);
      setGroupTitle(grp.title);
      setGroupDesc(grp.description || '');
      setGroupColor(grp.color || 'violet');
      setGroupUserIds((grp.members || []).map((m) => m.id));
    } else {
      setEditingGroup(null);
      setGroupTitle('');
      setGroupDesc('');
      setGroupColor('violet');
      setGroupUserIds([]);
    }
    setGroupMemberSearch('');
    setError('');
    setShowGroupModal(true);
  };

  const toggleGroupMember = (uid: string) => {
    setGroupUserIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupTitle.trim()) {
      setError('عنوان گروه کاربری الزامی است.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (editingGroup) {
        await api.updateGroup(editingGroup.id, {
          title: groupTitle.trim(),
          description: groupDesc.trim(),
          color: groupColor,
          userIds: groupUserIds,
        });
      } else {
        await api.createGroup({
          title: groupTitle.trim(),
          description: groupDesc.trim(),
          color: groupColor,
          userIds: groupUserIds,
        });
      }
      setShowGroupModal(false);
      await loadGroups();
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'خطا در ذخیره گروه کاربری');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (id: string, title: string) => {
    if (!confirm(`آیا از حذف گروه «${title}» اطمینان دارید؟ دسترسی‌های ارث‌بری‌شده از این گروه برای اعضا لغو می‌شود.`)) return;
    try {
      await api.deleteGroup(id);
      await loadGroups();
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'خطا در حذف گروه کاربری');
    }
  };

  // Filtered lists
  const filteredUsers = users.filter((u) => {
    const q = searchUserQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      (u.positionTitle && u.positionTitle.toLowerCase().includes(q)) ||
      (u.phone && u.phone.includes(q))
    );
  });

  const filteredPositions = positions.filter((p) => {
    const q = searchPosQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      p.title.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  });

  const filteredGroups = groups.filter((g) => {
    const q = searchGroupQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      g.title.toLowerCase().includes(q) ||
      (g.description && g.description.toLowerCase().includes(q)) ||
      (g.members || []).some((m) => m.name.toLowerCase().includes(q) || m.username.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      
      {/* Top Bar with Sub-Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-3xl bg-white border border-slate-200/90 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            مدیریت کاربران، سمت‌های سازمانی و ماتریس دسترسی‌ها
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            تعریف سمت‌ها، انتصاب اعضا، ایجاد کاربر ارشد سیستم و مدیریت ماتریس دسترسی‌ها
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 self-stretch sm:self-auto overflow-x-auto">
          {canViewUsers && (
            <button
              onClick={() => setSubTab('users')}
              className={`flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                subTab === 'users'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              کاربران شورا ({users.length})
            </button>
          )}
          {canViewPos && (
            <button
              onClick={() => setSubTab('positions')}
              className={`flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                subTab === 'positions'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              سمت‌های سازمانی ({positions.length})
            </button>
          )}
          {canManageGroups && (
            <button
              onClick={() => setSubTab('groups')}
              className={`flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                subTab === 'groups'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>گروه‌های کاربری ({groups.length})</span>
            </button>
          )}
          {canManagePerms && (
            <button
              onClick={() => setSubTab('permissions')}
              className={`flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                subTab === 'permissions'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>ماتریس دسترسی‌ها</span>
            </button>
          )}
        </div>
      </div>

      {/* ======================= TAB 1: USERS LIST ======================= */}
      {subTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <input
                type="text"
                placeholder="جستجو در نام، نام کاربری یا سمت..."
                value={searchUserQuery}
                onChange={(e) => setSearchUserQuery(e.target.value)}
                className="w-full rounded-2xl bg-white border border-slate-200 px-4 py-2 pr-9 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 shadow-2xs"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
            </div>

            {canCreateUser && (
              <button
                onClick={() => openUserModal()}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>تعریف کاربر جدید</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUsers.map((u) => {
              const permCount = u.permissions?.length || 0;
              const isSuperAdmin = u.role === 'ADMIN';

              return (
                <div
                  key={u.id}
                  className={`p-5 rounded-2xl bg-white border shadow-2xs hover:shadow-xs transition flex flex-col justify-between text-slate-800 ${
                    isSuperAdmin ? 'border-amber-300 ring-1 ring-amber-200/50' : 'border-slate-200/90'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-2xl font-extrabold text-sm flex items-center justify-center border shrink-0 ${
                          isSuperAdmin 
                            ? 'bg-amber-100 text-amber-900 border-amber-300' 
                            : 'bg-indigo-100 text-indigo-700 border-indigo-200'
                        }`}>
                          {u.name.charAt(0)}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 leading-tight flex items-center gap-1.5">
                            <span>{u.name}</span>
                            {isSuperAdmin && (
                              <span title="کاربر ارشد سیستم">
                                <Crown className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              </span>
                            )}
                          </h4>
                          <span className="text-[11px] text-slate-500 font-mono" dir="ltr">
                            @{u.username}
                          </span>
                        </div>
                      </div>

                      {/* Role badge */}
                      {isSuperAdmin ? (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 shrink-0 flex items-center gap-1">
                          <Crown className="w-3 h-3 text-amber-600" />
                          <span>کاربر ارشد</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 shrink-0">
                          عضو شورا
                        </span>
                      )}
                    </div>

                    {/* Assigned Position Pill */}
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 mb-3 space-y-1.5">
                      <div className="text-[10px] text-slate-500">سمت(های) انتصاب یافته (با ارث‌بری خودکار مجوز):</div>
                      <div className="text-xs font-bold text-indigo-700 flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span className="truncate">{u.positionTitle || 'بدون سمت اصلی'}</span>
                      </div>
                      {u.structurePositions && u.structurePositions.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-200/70">
                          {u.structurePositions.map((sp, spIdx) => (
                            <span
                              key={`${sp.structureId}_${sp.positionId}_${spIdx}`}
                              className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold"
                            >
                              {sp.positionTitle} ({sp.structureTitle})
                            </span>
                          ))}
                        </div>
                      )}
                      {u.groups && u.groups.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-200/70">
                          {u.groups.map((grp) => (
                            <span
                              key={grp.id}
                              className="text-[10px] px-2 py-0.5 rounded-md bg-violet-50 text-violet-800 border border-violet-200 font-semibold"
                            >
                              گروه: {grp.title}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Permissions summary badge */}
                    <div className="flex items-center justify-between text-[11px] px-3 py-1.5 rounded-xl bg-slate-100/70 border border-slate-200 text-slate-600 mb-3">
                      <span className="flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-indigo-600" />
                        <span>سطح دسترسی:</span>
                      </span>
                      <span className="font-bold text-indigo-700">
                        {isSuperAdmin ? 'دسترسی کامل و تام (۳۰ مجوز)' : `${permCount} مجوز فعال`}
                      </span>
                    </div>

                    {u.phone && (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-2">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{u.phone}</span>
                      </div>
                    )}
                  </div>

                  {(canManagePerms || canEditUser || canDeleteUser) && (
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      {canManagePerms ? (
                        <button
                          onClick={() => setSelectedUserForPerms(u)}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                          title="تنظیم و ویرایش مستقیم سطوح دسترسی کاربر"
                        >
                          <Shield className="w-3.5 h-3.5 text-indigo-600" />
                          <span>تنظیم دسترسی‌ها</span>
                        </button>
                      ) : <span />}

                      <div className="flex items-center gap-1">
                        {canEditUser && (
                          <button
                            onClick={() => openUserModal(u)}
                            className="px-2.5 py-1.5 rounded-xl text-xs text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition flex items-center gap-1 cursor-pointer"
                            title="ویرایش سمت، مشخصات یا سطح ارشد"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">مشخصات</span>
                          </button>
                        )}
                        {canDeleteUser && u.id !== currentUser.id && (
                          <button
                            onClick={() => handleDeleteUser(u.id, u.name)}
                            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="حذف کاربر"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================= TAB 2: POSITIONS LIST ======================= */}
      {subTab === 'positions' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <input
                type="text"
                placeholder="جستجو در عناوین یا وظایف سمت‌ها..."
                value={searchPosQuery}
                onChange={(e) => setSearchPosQuery(e.target.value)}
                className="w-full rounded-2xl bg-white border border-slate-200 px-4 py-2 pr-9 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 shadow-2xs"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
            </div>

            {canCreatePos && (
              <button
                onClick={() => openPosModal()}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>تعریف سمت جدید</span>
              </button>
            )}
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
            سمت‌ها به عنوان نقش‌های سازمانی در سیستم تعریف می‌شوند، اما <strong>اختیارات و دسترسی هر سمت به‌طور مجزا درون هر ساختار</strong> (در بخش مدیریت ساختار سازمانی یا ماتریس دسترسی‌ها) تعیین می‌گردد.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPositions.map((p) => (
              <div
                key={p.id}
                className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 transition flex flex-col justify-between text-slate-800"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span>{p.title}</span>
                    </h3>
                    <span className="text-[11px] font-semibold text-slate-500 tabular-nums shrink-0">
                      {p.userCount || 0} نفر
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 mb-2.5 text-[11px]">
                    <span className="text-slate-500">ساختارهای فعال:</span>
                    {p.structures && p.structures.length > 0 ? (
                      p.structures.map((st) => (
                        <span
                          key={st.id}
                          className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-medium"
                        >
                          {st.title}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-400">هنوز در ساختاری قرار نگرفته است</span>
                    )}
                  </div>

                  {p.description && (
                    <p className="text-xs text-slate-600 leading-relaxed mt-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 line-clamp-3">
                      {p.description}
                    </p>
                  )}
                </div>

                {(canEditPos || canDeletePos) && (
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-1.5 mt-4">
                    {canEditPos && (
                      <button
                        onClick={() => openPosModal(p)}
                        className="px-2.5 py-1.5 rounded-xl text-xs text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>ویرایش</span>
                      </button>
                    )}
                    {canDeletePos && (
                      <button
                        onClick={() => handleDeletePosition(p.id, p.title)}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        title="حذف سمت"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======================= TAB 3: USER GROUPS ======================= */}
      {subTab === 'groups' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <input
                type="text"
                placeholder="جستجو در نام گروه یا اعضای آن..."
                value={searchGroupQuery}
                onChange={(e) => setSearchGroupQuery(e.target.value)}
                className="w-full rounded-2xl bg-white border border-slate-200 px-4 py-2 pr-9 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 shadow-2xs"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
            </div>

            {canManageGroups && (
              <button
                onClick={() => openGroupModal()}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>ایجاد گروه کاربری جدید</span>
              </button>
            )}
          </div>

          <div className="p-3.5 rounded-2xl bg-violet-50/70 border border-violet-200 text-xs text-violet-950">
            با ایجاد <strong>گروه‌های کاربری</strong> و عضو کردن افراد در آن‌ها، می‌توانید دسترسی‌ها را یک‌جا به گروه اعطا کنید تا تمام اعضای گروه به‌طور خودکار همان مجوزها را دریافت کنند.
          </div>

          {filteredGroups.length === 0 ? (
            <div className="p-10 rounded-2xl bg-white border border-dashed border-slate-300 text-center space-y-2">
              <Layers className="w-8 h-8 text-slate-300 mx-auto" />
              <div className="text-sm font-bold text-slate-700">هنوز گروه کاربری تعریف نشده است</div>
              <p className="text-xs text-slate-500">
                برای اعطای سریع دسترسی مشترک به چند کاربر، روی «ایجاد گروه کاربری جدید» کلیک کنید.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredGroups.map((g) => (
                <div
                  key={g.id}
                  className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-violet-300 transition flex flex-col justify-between gap-4 text-slate-800 shadow-2xs"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <Layers className="w-4 h-4 text-violet-600 shrink-0" />
                          <span className="truncate">{g.title}</span>
                        </h3>
                        {g.description && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                            {g.description}
                          </p>
                        )}
                      </div>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-800 border border-violet-200 shrink-0 tabular-nums">
                        {g.memberCount} عضو
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600">
                      <span className="flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-violet-600" />
                        <span>مجوزهای تعریف‌شده برای گروه:</span>
                      </span>
                      <span className="font-bold text-violet-700 tabular-nums">
                        {g.permissionCount} مجوز
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold text-slate-500">اعضای گروه:</div>
                      {g.members && g.members.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {g.members.map((m) => (
                            <span
                              key={m.id}
                              className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 font-semibold"
                            >
                              {m.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">هنوز عضوی به این گروه اضافه نشده است</span>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    {canManagePerms ? (
                      <button
                        onClick={() => setSelectedGroupForPerms(g)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        <span>تنظیم دسترسی گروه</span>
                      </button>
                    ) : <span />}

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openGroupModal(g)}
                        className="px-2.5 py-1.5 rounded-xl text-xs text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition flex items-center gap-1 cursor-pointer"
                        title="ویرایش گروه و اعضا"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>اعضا</span>
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(g.id, g.title)}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        title="حذف گروه"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB 4: PERMISSIONS MATRIX OVERVIEW ======================= */}
      {subTab === 'permissions' && (
        <div className="space-y-5">
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                ماتریس دسترسی کاربران، گروه‌های کاربری و سمت‌های منتصب در ساختارها
              </h3>
              <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-relaxed">
                مجوزها به ۳ روش قابل تنظیم هستند: مستقیماً برای <strong>کاربر</strong>، یک‌جا برای یک <strong>گروه کاربری</strong>، یا برای یک <strong>سمت داخل ساختار مشخص</strong>. دسترسی‌های کاربر مجموع ارث‌بری از گروه‌ها، سمت‌هایش در ساختارها و مجوزهای اختصاصی او است.
              </p>
            </div>
          </div>

          {/* Quick Selection Grid for Users, Groups & Structure Positions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Box 1: User Permissions Access */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-indigo-600" />
                  <span>دسترسی‌های مستقیم کاربران</span>
                </h3>
                <span className="text-xs text-slate-500 tabular-nums">{users.length} کاربر</span>
              </div>

              <div className="space-y-2 max-h-[440px] overflow-y-auto pl-1">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="p-3 rounded-xl border border-slate-200 hover:border-indigo-300 bg-slate-50/50 hover:bg-indigo-50/30 transition flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0">
                        {u.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1">
                          <span>{u.name}</span>
                          {u.role === 'ADMIN' && <Crown className="w-3 h-3 text-amber-600" />}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          <span className="font-mono">@{u.username}</span>
                          {u.structurePositions && u.structurePositions.length > 0
                            ? ` • ${u.structurePositions.length} سمت در ساختارها`
                            : ' • بدون انتصاب در ساختار'}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => setSelectedUserForPerms(u)}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>تنظیم مجوزها</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Box 2: Structure-Scoped Position Permissions Access */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FolderTree className="w-4 h-4 text-indigo-600" />
                  <span>دسترسی‌های سمت در هر ساختار</span>
                </h3>
                <span className="text-xs text-slate-500 tabular-nums">{filteredStructurePositions.length} شاخه</span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={structFilterId}
                  onChange={(e) => setStructFilterId(e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:border-indigo-500"
                >
                  <option value="ALL">همه ساختارها</option>
                  {uniqueStructuresForFilter.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchSpQuery}
                    onChange={(e) => setSearchSpQuery(e.target.value)}
                    placeholder="جستجوی سمت یا ساختار..."
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 pr-8 pl-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-2 max-h-[380px] overflow-y-auto pl-1">
                {filteredStructurePositions.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                    سمتی در ساختارها یافت نشد. ابتدا در بخش «مدیریت ساختار سازمانی» سمت را به درخت ساختار اضافه کنید.
                  </div>
                ) : (
                  filteredStructurePositions.map((sp) => (
                    <div
                      key={sp.id}
                      className="p-3 rounded-xl border border-slate-200 hover:border-indigo-300 bg-slate-50/50 hover:bg-indigo-50/30 transition flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 font-bold text-xs flex items-center justify-center border border-indigo-200 shrink-0">
                          <Briefcase className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {sp.positionTitle}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate tabular-nums">
                            ساختار: <span className="font-semibold text-indigo-700">{sp.structureTitle}</span> • {sp.userCount} نفر • {sp.permissionCount} مجوز
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() =>
                          setSelectedSpForPerms({
                            id: sp.id,
                            positionTitle: sp.positionTitle,
                            structureTitle: sp.structureTitle,
                            structureId: sp.structureId,
                          })
                        }
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <Lock className="w-3.5 h-3.5 text-indigo-600" />
                        <span>مجوزها</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
            {/* Box 3: User Groups Permissions Access */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-violet-600" />
                  <span>دسترسی‌های گروه‌های کاربری</span>
                </h3>
                <button
                  type="button"
                  onClick={() => openGroupModal()}
                  className="text-[11px] font-bold text-violet-700 hover:text-violet-900 bg-violet-50 hover:bg-violet-100 px-2.5 py-1 rounded-lg border border-violet-200 transition cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>گروه جدید</span>
                </button>
              </div>

              <div className="space-y-2 max-h-[440px] overflow-y-auto pl-1">
                {groups.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                    گروه کاربری ایجاد نشده است. از دکمه «گروه جدید» یا تب «گروه‌های کاربری» گروه بسازید.
                  </div>
                ) : (
                  groups.map((g) => (
                    <div
                      key={g.id}
                      className="p-3 rounded-xl border border-slate-200 hover:border-violet-300 bg-slate-50/50 hover:bg-violet-50/30 transition flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 font-bold text-xs flex items-center justify-center border border-violet-200 shrink-0">
                          <Layers className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {g.title}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate tabular-nums">
                            {g.memberCount} عضو • {g.permissionCount} مجوز فعال
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => setSelectedGroupForPerms(g)}
                        className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>مجوزها</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== PERMISSIONS TREE MODAL ===================== */}
      {selectedUserForPerms && (
        <PermissionsTreeModal
          user={selectedUserForPerms}
          onClose={() => setSelectedUserForPerms(null)}
          onSuccess={() => {
            onRefresh();
            loadStructurePositions();
            loadGroups();
          }}
        />
      )}

      {selectedGroupForPerms && (
        <PermissionsTreeModal
          group={selectedGroupForPerms}
          onClose={() => setSelectedGroupForPerms(null)}
          onSuccess={() => {
            onRefresh();
            loadGroups();
          }}
        />
      )}

      {selectedSpForPerms && (
        <PermissionsTreeModal
          structurePosition={selectedSpForPerms}
          onClose={() => setSelectedSpForPerms(null)}
          onSuccess={() => {
            onRefresh();
            loadStructurePositions();
          }}
        />
      )}

      {/* MODAL: CREATE / EDIT USER WITH "کاربر ارشد سیستم" CHECKBOX */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-800">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/80">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-600" />
                {editingUser ? 'ویرایش مشخصات و سمت کاربر' : 'تعریف کاربر جدید شورا'}
              </h3>
              <button
                onClick={() => setShowUserModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="m-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSaveUser} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  نام و نام خانوادگی *
                </label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="مثال: مهندس فرهاد کاظمی"
                  className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-2xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  نام کاربری (جهت ورود به کارتابل) *
                </label>
                <input
                  type="text"
                  value={userUsername}
                  onChange={(e) => setUserUsername(e.target.value)}
                  placeholder="kazemi"
                  disabled={!!editingUser}
                  className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono disabled:opacity-50 shadow-2xs"
                  dir="ltr"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  {editingUser ? 'رمز عبور جدید (اختیاری جهت تغییر)' : 'رمز عبور *'}
                </label>
                <input
                  type="password"
                  value={userPassword}
                  onChange={(e) => setUserPassword(e.target.value)}
                  placeholder="حداقل ۴ کاراکتر"
                  className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-2xs"
                  dir="rtl"
                />
              </div>

              {/* Position Assignment Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  انتصاب سمت سازمانی در شورا *
                </label>
                <select
                  value={userPositionId}
                  onChange={(e) => setUserPositionId(e.target.value)}
                  className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                >
                  <option value="">-- بدون سمت --</option>
                  {positions.map((pos) => (
                    <option key={pos.id} value={pos.id}>
                      {pos.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Senior System Admin (کاربر ارشد سیستم) Checkbox Requirement */}
              {canAssignAdmin && (
                <div
                  className={`p-3.5 rounded-2xl border transition ${
                    userRole === 'ADMIN'
                      ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-400/40 shadow-xs'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={userRole === 'ADMIN'}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        setUserRole(isChecked ? 'ADMIN' : 'COUNCIL');
                      }}
                      className="mt-1 w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer shrink-0"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Crown className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>کاربر ارشد سیستم (مدیر ارشد با کلیه دسترسی‌ها)</span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                        با فعال‌سازی این تیک، کاربر دقیقاً مشابه مدیر اصلی سیستم تعریف می‌شود و کلیه دسترسی‌های سامانه را خواهد داشت.
                      </p>
                    </div>
                  </label>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  شماره تماس
                </label>
                <input
                  type="text"
                  value={userPhone}
                  onChange={(e) => setUserPhone(e.target.value)}
                  placeholder="0912xxxxxxx"
                  className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-2xs"
                  dir="ltr"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white hover:bg-slate-100"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 disabled:opacity-50"
                >
                  {loading ? 'در حال ذخیره...' : 'ذخیره کاربر'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT POSITION */}
      {showPosModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-800">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/80">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-indigo-600" />
                {editingPos ? 'ویرایش سمت سازمانی' : 'تعریف سمت سازمانی جدید'}
              </h3>
              <button
                onClick={() => setShowPosModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="m-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSavePosition} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  عنوان سمت *
                </label>
                <input
                  type="text"
                  value={posTitle}
                  onChange={(e) => setPosTitle(e.target.value)}
                  placeholder="مثال: ناظر فنی و کیفی، مدیر تدارکات، نماینده مالی..."
                  className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-2xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  شرح وظایف و حیطه اختیارات
                </label>
                <textarea
                  rows={3}
                  value={posDesc}
                  onChange={(e) => setPosDesc(e.target.value)}
                  placeholder="شرح وظایف محوله در جلسات شورا..."
                  className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 leading-relaxed shadow-2xs"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowPosModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white hover:bg-slate-100"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 disabled:opacity-50"
                >
                  {loading ? 'در حال ذخیره...' : 'ذخیره سمت'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT USER GROUP */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-800 my-6">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/80">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-violet-600" />
                {editingGroup ? 'ویرایش گروه کاربری و اعضا' : 'ایجاد گروه کاربری جدید'}
              </h3>
              <button
                onClick={() => setShowGroupModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="m-4 mb-0 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSaveGroup} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  نام گروه کاربری *
                </label>
                <input
                  type="text"
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  placeholder="مثال: گروه کارشناسان بررسی طرح، گروه ناظران، ثبت‌کنندگان پروژه..."
                  className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 shadow-2xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  توضیحات گروه
                </label>
                <textarea
                  rows={2}
                  value={groupDesc}
                  onChange={(e) => setGroupDesc(e.target.value)}
                  placeholder="کاربرد و حیطه دسترسی‌های مشترک اعضای این گروه..."
                  className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 leading-relaxed shadow-2xs"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-800">
                    انتخاب اعضای گروه ({groupUserIds.length} نفر انتخاب‌شده)
                  </label>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setGroupUserIds(users.map((u) => u.id))}
                      className="text-violet-700 hover:underline font-semibold cursor-pointer"
                    >
                      انتخاب همه
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setGroupUserIds([])}
                      className="text-slate-500 hover:underline cursor-pointer"
                    >
                      پاک کردن
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={groupMemberSearch}
                    onChange={(e) => setGroupMemberSearch(e.target.value)}
                    placeholder="جستجو بین کاربران..."
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 pr-8 pl-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-violet-500"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2 pointer-events-none" />
                </div>

                <div className="max-h-56 overflow-y-auto rounded-2xl border border-slate-200 divide-y divide-slate-100 bg-slate-50/40">
                  {users
                    .filter((u) => {
                      const q = groupMemberSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        u.name.toLowerCase().includes(q) ||
                        u.username.toLowerCase().includes(q)
                      );
                    })
                    .map((u) => {
                      const selected = groupUserIds.includes(u.id);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => toggleGroupMember(u.id)}
                          className={`w-full px-3 py-2 flex items-center justify-between gap-2 text-right transition cursor-pointer ${
                            selected ? 'bg-violet-50/90' : 'hover:bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition ${
                                selected
                                  ? 'bg-violet-600 border-violet-600 text-white'
                                  : 'bg-white border-slate-300'
                              }`}
                            >
                              {selected && <Check className="w-3.5 h-3.5" />}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-900 truncate">{u.name}</div>
                              <div className="text-[10px] text-slate-500 font-mono truncate" dir="ltr">
                                @{u.username}
                              </div>
                            </div>
                          </div>
                          {u.positionTitle && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 shrink-0">
                              {u.positionTitle}
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowGroupModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white hover:bg-slate-100 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-xs font-bold text-white shadow-md shadow-violet-500/20 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'در حال ذخیره...' : 'ذخیره گروه کاربری'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
