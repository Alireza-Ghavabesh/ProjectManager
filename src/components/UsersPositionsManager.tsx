import React, { useState } from 'react';
import { User, Position } from '../types';
import { api } from '../services/api';
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
  CheckCircle2
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
  const [subTab, setSubTab] = useState<'users' | 'positions'>('users');
  const isAdmin = currentUser.role === 'ADMIN';

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

  return (
    <div className="space-y-6">
      
      {/* Top Bar with Sub-Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-3xl bg-slate-900 border border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-400" />
            مدیریت اعضای شورا، تعریف سمت‌ها و انتصاب‌ها
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            تعریف سمت‌های تخصصی در شورا و انتصاب اعضا به سمت‌ها با نام کاربری و رمز اختصاصی
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 self-stretch sm:self-auto">
          <button
            onClick={() => setSubTab('users')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              subTab === 'users'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            کاربران شورا ({users.length})
          </button>
          <button
            onClick={() => setSubTab('positions')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              subTab === 'positions'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            سمت‌های سازمانی ({positions.length})
          </button>
        </div>
      </div>

      {/* ======================= TAB 1: USERS LIST ======================= */}
      {subTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300">
              لیست کاربران ثبت شده با نام کاربری، رمز عبور، کارتابل و سمت:
            </span>
            {isAdmin && (
              <button
                onClick={() => openUserModal()}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-xs font-bold text-white shadow-md transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>تعریف کاربر جدید</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {users.map((u) => (
              <div
                key={u.id}
                className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 shadow-xl transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-cyan-600/30 to-indigo-600/30 text-cyan-300 font-extrabold text-sm flex items-center justify-center border border-cyan-500/30">
                        {u.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white leading-tight">
                          {u.name}
                        </h4>
                        <span className="text-[11px] text-slate-400 font-mono" dir="ltr">
                          @{u.username}
                        </span>
                      </div>
                    </div>

                    {/* Role badge */}
                    {u.role === 'ADMIN' ? (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        مدیر جلسه
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                        عضو شورا
                      </span>
                    )}
                  </div>

                  {/* Assigned Position Pill */}
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 mb-3">
                    <div className="text-[10px] text-slate-500 mb-0.5">سمت انتصاب یافته:</div>
                    <div className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-cyan-400" />
                      {u.positionTitle || 'بدون سمت (انتصاب نشده)'}
                    </div>
                  </div>

                  {u.phone && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-2">
                      <Phone className="w-3.5 h-3.5 text-slate-500" />
                      <span>{u.phone}</span>
                    </div>
                  )}
                </div>

                {isAdmin && (
                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-end gap-2">
                    <button
                      onClick={() => openUserModal(u)}
                      className="px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>تغییر سمت / مشخصات</span>
                    </button>
                    {u.id !== currentUser.id && (
                      <button
                        onClick={() => handleDeleteUser(u.id, u.name)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer"
                        title="حذف کاربر"
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

      {/* ======================= TAB 2: POSITIONS LIST ======================= */}
      {subTab === 'positions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300">
              سمت‌های سازمانی و شورایی (قابل انتصاب به کاربران):
            </span>
            {isAdmin && (
              <button
                onClick={() => openPosModal()}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-xs font-bold text-white shadow-md transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>تعریف سمت جدید</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {positions.map((p) => (
              <div
                key={p.id}
                className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 shadow-xl transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-cyan-400" />
                      {p.title}
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      {p.userCount || 0} نفر منتصب
                    </span>
                  </div>

                  {p.description && (
                    <p className="text-xs text-slate-400 leading-relaxed mt-2 bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/80">
                      {p.description}
                    </p>
                  )}
                </div>

                {isAdmin && (
                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-end gap-2 mt-4">
                    <button
                      onClick={() => openPosModal(p)}
                      className="px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>ویرایش سمت</span>
                    </button>
                    <button
                      onClick={() => handleDeletePosition(p.id, p.title)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer"
                      title="حذف سمت"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT USER */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/50">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-cyan-400" />
                {editingUser ? 'ویرایش مشخصات و انتصاب سمت' : 'تعریف کاربر جدید شورا'}
              </h3>
              <button
                onClick={() => setShowUserModal(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="m-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSaveUser} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  نام و نام خانوادگی *
                </label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="مثال: مهندس فرهاد کاظمی"
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  نام کاربری (جهت ورود به کارتابل) *
                </label>
                <input
                  type="text"
                  value={userUsername}
                  onChange={(e) => setUserUsername(e.target.value)}
                  placeholder="مثال: kazemi"
                  disabled={!!editingUser}
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono disabled:opacity-50"
                  dir="ltr"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  {editingUser ? 'رمز عبور جدید (اختیاری جهت تغییر)' : 'رمز عبور *'}
                </label>
                <input
                  type="password"
                  value={userPassword}
                  onChange={(e) => setUserPassword(e.target.value)}
                  placeholder="••••••"
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
                  dir="ltr"
                />
              </div>

              {/* Position Assignment Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  انتصاب سمت سازمانی در شورا *
                </label>
                <select
                  value={userPositionId}
                  onChange={(e) => setUserPositionId(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value="">-- بدون سمت --</option>
                  {positions.map((pos) => (
                    <option key={pos.id} value={pos.id}>
                      {pos.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  نقش دسترسی در سامانه
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setUserRole('COUNCIL')}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                      userRole === 'COUNCIL'
                        ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    عضو شورا (کارتابل و رای)
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserRole('ADMIN')}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                      userRole === 'ADMIN'
                        ? 'bg-amber-950/60 border-amber-500 text-amber-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    مدیر جلسه (ثبت پروژه و ناظر آرا)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  شماره تماس
                </label>
                <input
                  type="text"
                  value={userPhone}
                  onChange={(e) => setUserPhone(e.target.value)}
                  placeholder="0912xxxxxxx"
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  dir="ltr"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-xs text-slate-300 hover:bg-slate-800"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white shadow-md disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/50">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-cyan-400" />
                {editingPos ? 'ویرایش سمت سازمانی' : 'تعریف سمت سازمانی جدید'}
              </h3>
              <button
                onClick={() => setShowPosModal(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="m-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSavePosition} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  عنوان سمت *
                </label>
                <input
                  type="text"
                  value={posTitle}
                  onChange={(e) => setPosTitle(e.target.value)}
                  placeholder="مثال: ناظر فنی و کیفی، مدیر تدارکات، نماینده مالی..."
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  شرح وظایف و حیطه اختیارات
                </label>
                <textarea
                  rows={3}
                  value={posDesc}
                  onChange={(e) => setPosDesc(e.target.value)}
                  placeholder="شرح وظایف محوله در جلسات شورا..."
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 leading-relaxed"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowPosModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-xs text-slate-300 hover:bg-slate-800"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white shadow-md disabled:opacity-50"
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
