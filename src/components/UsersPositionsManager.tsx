import React, { useState, useEffect } from 'react';
import { User, Position } from '../types';
import { api } from '../services/api';
import { PermissionsTreeModal } from './PermissionsTreeModal';
import { 
  Users, 
  Briefcase, 
  Plus, 
  Trash2, 
  Edit3, 
  Shield, 
  UserCheck, 
  Key, 
  X, 
  Sparkles, 
  Phone, 
  CheckCircle2, 
  Lock, 
  Search, 
  Check, 
  AlertCircle,
  Crown
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
  const [subTab, setSubTab] = useState<'users' | 'positions' | 'permissions'>('users');
  const isAdmin = currentUser.role === 'ADMIN';

  // Selected for permissions modal
  const [selectedUserForPerms, setSelectedUserForPerms] = useState<User | null>(null);
  const [selectedPosForPerms, setSelectedPosForPerms] = useState<Position | null>(null);

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
      setUserPositionId(positions[0]?.id || '');
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

            {isAdmin && (
              <button
                onClick={() => openUserModal()}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>تعریف کاربر جدید (با امکان تعیین کاربر ارشد)</span>
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
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 mb-3">
                      <div className="text-[10px] text-slate-500 mb-0.5">سمت انتصاب یافته:</div>
                      <div className="text-xs font-bold text-indigo-700 flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span className="truncate">{u.positionTitle || 'بدون سمت (انتصاب نشده)'}</span>
                      </div>
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

                  {isAdmin && (
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        onClick={() => setSelectedUserForPerms(u)}
                        className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        title="تنظیم و ویرایش مستقیم سطوح دسترسی کاربر"
                      >
                        <Shield className="w-3.5 h-3.5 text-indigo-600" />
                        <span>تنظیم دسترسی‌ها</span>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openUserModal(u)}
                          className="px-2.5 py-1.5 rounded-xl text-xs text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition flex items-center gap-1 cursor-pointer"
                          title="ویرایش سمت، مشخصات یا سطح ارشد"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">مشخصات</span>
                        </button>
                        {u.id !== currentUser.id && (
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

            {isAdmin && (
              <button
                onClick={() => openPosModal()}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>تعریف سمت جدید</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPositions.map((p) => {
              const posPermCount = p.permissions?.length || 0;
              return (
                <div
                  key={p.id}
                  className="p-5 rounded-2xl bg-white border border-slate-200/90 hover:border-slate-300 shadow-2xs hover:shadow-xs transition flex flex-col justify-between text-slate-800"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Briefcase className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span>{p.title}</span>
                      </h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                        {p.userCount || 0} نفر منتصب
                      </span>
                    </div>

                    {/* Permissions summary */}
                    <div className="flex items-center justify-between text-[11px] px-3 py-1.5 rounded-xl bg-indigo-50/50 border border-indigo-100 text-indigo-900 mb-2.5">
                      <span className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-indigo-600" />
                        <span>مجوزهای پیش‌فرض سمت:</span>
                      </span>
                      <span className="font-bold">{posPermCount} مجوز</span>
                    </div>

                    {p.description && (
                      <p className="text-xs text-slate-600 leading-relaxed mt-1 bg-slate-50 p-2.5 rounded-xl border border-slate-200 line-clamp-3">
                        {p.description}
                      </p>
                    )}
                  </div>

                  {isAdmin && (
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 mt-4">
                      <button
                        onClick={() => setSelectedPosForPerms(p)}
                        className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        title="تنظیم درخت مجوزهای این سمت"
                      >
                        <Shield className="w-3.5 h-3.5 text-indigo-600" />
                        <span>دسترسی‌های سمت</span>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openPosModal(p)}
                          className="px-2.5 py-1.5 rounded-xl text-xs text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>ویرایش</span>
                        </button>
                        <button
                          onClick={() => handleDeletePosition(p.id, p.title)}
                          className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          title="حذف سمت"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================= TAB 3: PERMISSIONS MATRIX OVERVIEW ======================= */}
      {subTab === 'permissions' && (
        <div className="space-y-6">
          <div className="p-5 rounded-3xl bg-indigo-50/60 border border-indigo-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  سامانه مدیریت یکپارچه و سلسله‌مراتبی سطوح دسترسی
                </h3>
                <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                  هر سمت سازمانی دارای یک بسته مجوز پایه است. همچنین می‌توانید برای هر عضو شورا به صورت تفکیک‌شده، مجوزهای شخصی‌سازی‌شده اعمال نمایید یا هر زمان که نیاز بود، آن را به پیش‌فرض سمت بازنشانی فرمایید.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-stretch sm:self-auto">
              <button
                onClick={() => {
                  if (positions.length > 0) setSelectedPosForPerms(positions[0]);
                }}
                className="flex-1 sm:flex-none px-4 py-2.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-bold text-indigo-700 shadow-2xs transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Lock className="w-4 h-4 text-indigo-600" />
                <span>دسترسی‌های سمت‌ها</span>
              </button>
            </div>
          </div>

          {/* Quick Selection Grid for Users & Positions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Box 1: User Permissions Access */}
            <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-indigo-600" />
                  <span>دسترسی‌های اختصاصی پرسنل و اعضا</span>
                </h3>
                <span className="text-[11px] text-slate-500">{users.length} کاربر</span>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="p-3 rounded-2xl border border-slate-200/90 hover:border-indigo-300 bg-slate-50/50 hover:bg-indigo-50/30 transition flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0">
                        {u.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1">
                          <span>{u.name}</span>
                          {u.role === 'ADMIN' && <Crown className="w-3 h-3 text-amber-600" />}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {u.positionTitle || 'بدون سمت'} • <span className="font-mono">@{u.username}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => setSelectedUserForPerms(u)}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-2xs transition flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>تنظیم مجوزها</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Box 2: Position Permissions Access */}
            <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-indigo-600" />
                  <span>دسترسی‌های پایه سمت‌های سازمانی</span>
                </h3>
                <span className="text-[11px] text-slate-500">{positions.length} سمت</span>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {positions.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-2xl border border-slate-200/90 hover:border-indigo-300 bg-slate-50/50 hover:bg-indigo-50/30 transition flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 font-bold text-xs flex items-center justify-center border border-indigo-200 shrink-0">
                        <Briefcase className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">{p.title}</div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {p.userCount || 0} کاربر منتصب • {p.permissions?.length || 0} مجوز فعال
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => setSelectedPosForPerms(p)}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold shadow-2xs transition flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Lock className="w-3.5 h-3.5 text-indigo-600" />
                      <span>ویرایش مجوزها</span>
                    </button>
                  </div>
                ))}
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
          }}
        />
      )}

      {selectedPosForPerms && (
        <PermissionsTreeModal
          position={selectedPosForPerms}
          onClose={() => setSelectedPosForPerms(null)}
          onSuccess={() => {
            onRefresh();
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
                      با فعال‌سازی این تیک، کاربر دقیقاً مشابه مدیر اصلی سیستم تعریف می‌شود و کلیه ۳۰ سطح دسترسی (شامل ماتریس دسترسی‌ها، ساختارها، حذف و ویرایش کاربران، صدور مصوبه نهایی و نظارت بر آرا) را خواهد داشت.
                    </p>
                  </div>
                </label>
              </div>

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

    </div>
  );
};
