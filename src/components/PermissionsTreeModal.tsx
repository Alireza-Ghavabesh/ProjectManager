import React, { useState, useEffect, useMemo } from 'react';
import { Position, Permission, User } from '../types';
import { api } from '../services/api';
import { 
  ShieldAlert, 
  CheckSquare, 
  Square, 
  ChevronDown, 
  ChevronLeft, 
  X, 
  Sparkles, 
  Lock,
  Save,
  RotateCcw,
  Search,
  Check,
  AlertCircle
} from 'lucide-react';

interface PermissionsTreeModalProps {
  position?: Position | null;
  user?: User | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const PermissionsTreeModal: React.FC<PermissionsTreeModalProps> = ({
  position,
  user,
  onClose,
  onSuccess,
}) => {
  const [tree, setTree] = useState<Permission[]>([]);
  const [allPermissionsList, setAllPermissionsList] = useState<Permission[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [hasCustomPerms, setHasCustomPerms] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const targetTitle = user ? user.name : position ? position.title : 'سطح دسترسی';
  const isUserTarget = Boolean(user);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const permData = await api.getPermissions();
      setTree(permData.tree);
      setAllPermissionsList(permData.permissions || []);
      // Expand all root nodes by default
      setExpandedNodes(new Set(permData.tree.map((r) => r.code)));

      if (user) {
        const userPermsData = await api.getUserPermissions(user.id);
        setSelectedCodes(new Set(userPermsData.permissions));
        setHasCustomPerms(Boolean(userPermsData.hasCustomPermissions));
      } else if (position) {
        const posPerms = await api.getPositionPermissions(position.id);
        setSelectedCodes(new Set(posPerms));
      }
    } catch (err: any) {
      setError(err.message || 'خطا در بارگذاری ماتریس دسترسی‌ها');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [position?.id, user?.id]);

  const toggleExpand = (code: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleExpandAll = () => {
    if (expandedNodes.size === tree.length) {
      setExpandedNodes(new Set());
    } else {
      setExpandedNodes(new Set(tree.map((r) => r.code)));
    }
  };

  const selectAll = () => {
    const all = new Set<string>();
    allPermissionsList.forEach((p) => all.add(p.code));
    setSelectedCodes(all);
  };

  const deselectAll = () => {
    setSelectedCodes(new Set());
  };

  const togglePermission = (code: string, isParent: boolean, children?: Permission[]) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
        // If parent, also remove children
        if (isParent && children) {
          children.forEach((c) => next.delete(c.code));
        }
      } else {
        next.add(code);
        // If parent, also grant children
        if (isParent && children) {
          children.forEach((c) => next.add(c.code));
        }
      }
      return next;
    });
  };

  const toggleChildPermission = (childCode: string, parentCode: string) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(childCode)) {
        next.delete(childCode);
      } else {
        next.add(childCode);
        // Automatically ensure parent root permission is active
        next.add(parentCode);
      }
      return next;
    });
  };

  const handleResetToPosition = async () => {
    if (!user) return;
    if (!confirm('آیا از بازنشانی مجوزهای این کاربر به تنظیمات پیش‌فرض سمت سازمانی اطمینان دارید؟')) {
      return;
    }
    setResetting(true);
    setError('');
    try {
      await api.resetUserPermissions(user.id);
      setSuccessMsg('مجوزهای کاربر به پیش‌فرض سمت بازنشانی شد.');
      await loadData();
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'خطا در بازنشانی دسترسی‌ها');
    } finally {
      setResetting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const codes = Array.from(selectedCodes);
      if (user) {
        await api.updateUserPermissions(user.id, codes);
      } else if (position) {
        await api.updatePositionPermissions(position.id, codes);
      }
      setSuccessMsg('تغییرات با موفقیت ذخیره شدند.');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 500);
    } catch (err: any) {
      setError(err.message || 'خطا در ذخیره دسترسی‌ها');
    } finally {
      setSaving(false);
    }
  };

  // Filter tree based on search query
  const filteredTree = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tree;

    return tree
      .map((root) => {
        const rootMatches =
          root.title.toLowerCase().includes(q) ||
          root.code.toLowerCase().includes(q) ||
          (root.description && root.description.toLowerCase().includes(q));

        const matchedChildren = (root.children || []).filter(
          (c) =>
            c.title.toLowerCase().includes(q) ||
            c.code.toLowerCase().includes(q) ||
            (c.description && c.description.toLowerCase().includes(q))
        );

        if (rootMatches || matchedChildren.length > 0) {
          return {
            ...root,
            children: rootMatches ? root.children : matchedChildren,
          };
        }
        return null;
      })
      .filter(Boolean) as Permission[];
  }, [tree, searchQuery]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-3xl rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-4 sm:my-6 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/80 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center shrink-0 mt-0.5">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500 font-medium">
                  {isUserTarget ? 'مدیریت و انتصاب مجوزهای کاربر:' : 'ماتریس درختی مجوزهای سمت سازمانی:'}
                </span>
                <span className="text-sm font-bold text-slate-900">{targetTitle}</span>
                {user?.positionTitle && (
                  <span className="text-[11px] px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
                    سمت: {user.positionTitle}
                  </span>
                )}
                {isUserTarget && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                      hasCustomPerms
                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    }`}
                  >
                    {hasCustomPerms ? 'مجوزهای اختصاصی فعال است' : 'ارث‌بری مستقیم از سمت'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {isUserTarget
                  ? 'تعیین دقیق اختیارات این کاربر در سامانه. تغییر مجوزها بلافاصله در نشست کاربری اعمال می‌شود.'
                  : 'تعریف اختیارات پایه سمت. پرسنل منتسب به این سمت به‌صورت خودکار این دسترسی‌ها را دریافت می‌کنند.'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status / Alerts */}
        {error && (
          <div className="m-4 mb-0 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="m-4 mb-0 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Toolbar: Search & Quick Actions */}
        <div className="p-3 sm:px-5 border-b border-slate-100 bg-white flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو در نام یا کد مجوز..."
              className="w-full rounded-xl bg-slate-50 border border-slate-200 pr-8 pl-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={selectAll}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700 transition cursor-pointer"
            >
              انتخاب همه
            </button>
            <button
              type="button"
              onClick={deselectAll}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700 transition cursor-pointer"
            >
              لغو همه
            </button>
            <button
              type="button"
              onClick={toggleExpandAll}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700 transition cursor-pointer"
            >
              {expandedNodes.size === tree.length ? 'بستن همه' : 'گسترش همه'}
            </button>

            {isUserTarget && hasCustomPerms && (
              <button
                type="button"
                onClick={handleResetToPosition}
                disabled={resetting}
                className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-300 text-[11px] font-bold text-amber-900 transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                title="حذف مجوزهای دستی و ارث‌بری مجدد از سمت سازمانی"
              >
                <RotateCcw className={`w-3 h-3 ${resetting ? 'animate-spin' : ''}`} />
                <span>بازنشانی به سمت</span>
              </button>
            )}
          </div>
        </div>

        {/* Tree Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1">
          {loading ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              در حال بارگذاری ماتریس دسترسی‌ها...
            </div>
          ) : filteredTree.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs">
              مجوزی مطابق با «{searchQuery}» یافت نشد.
            </div>
          ) : (
            filteredTree.map((root) => {
              const isExpanded = expandedNodes.has(root.code) || searchQuery.trim().length > 0;
              const isRootSelected = selectedCodes.has(root.code);
              const children = root.children || [];
              const selectedChildrenCount = children.filter((c) => selectedCodes.has(c.code)).length;

              return (
                <div
                  key={root.code}
                  className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs"
                >
                  {/* Root Branch */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-50/90 hover:bg-indigo-50/40 transition">
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => toggleExpand(root.code)}
                        className="text-slate-400 hover:text-slate-700 cursor-pointer p-0.5"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-indigo-600" />
                        ) : (
                          <ChevronLeft className="w-4 h-4 text-slate-400" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => togglePermission(root.code, true, children)}
                        className="flex items-center gap-2 cursor-pointer text-right"
                      >
                        {isRootSelected ? (
                          <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <div>
                          <span className="text-xs font-bold text-slate-900 block leading-tight">
                            {root.title}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono" dir="ltr">
                            {root.code}
                          </span>
                        </div>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      {root.isDanger ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 font-bold">
                          <ShieldAlert className="w-2.5 h-2.5" />
                          حساس
                        </span>
                      ) : null}
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-semibold">
                        {selectedChildrenCount} از {children.length} فعال
                      </span>
                    </div>
                  </div>

                  {/* Children Nodes (Tree Leaves) */}
                  {isExpanded && children.length > 0 && (
                    <div className="p-3 pr-8 space-y-2 border-t border-slate-100 bg-slate-50/40">
                      {children.map((child) => {
                        const isChildSelected = selectedCodes.has(child.code);
                        return (
                          <div
                            key={child.code}
                            className={`p-2.5 rounded-xl border transition flex items-center justify-between gap-3 ${
                              isChildSelected
                                ? 'bg-indigo-50/70 border-indigo-200 text-slate-900'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleChildPermission(child.code, root.code)}
                              className="flex items-start gap-2.5 cursor-pointer text-right flex-1"
                            >
                              <div className="mt-0.5">
                                {isChildSelected ? (
                                  <CheckSquare className="w-4 h-4 text-indigo-600" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-400" />
                                )}
                              </div>
                              <div>
                                <div className="text-xs font-bold leading-tight flex items-center gap-2">
                                  <span>{child.title}</span>
                                  {child.isDanger ? (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 font-bold">
                                      <ShieldAlert className="w-2.5 h-2.5" />
                                      اختیار حساس
                                    </span>
                                  ) : null}
                                </div>
                                {child.description && (
                                  <div className="text-[11px] text-slate-500 mt-0.5 font-normal">
                                    {child.description}
                                  </div>
                                )}
                              </div>
                            </button>

                            <span className="text-[10px] text-slate-400 font-mono shrink-0 hidden sm:inline" dir="ltr">
                              {child.code}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-between p-4 border-t border-slate-100 bg-slate-50/90 shrink-0">
          <div className="text-xs text-slate-600 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>مجموع مجوزهای انتخاب‌شده: <strong className="text-indigo-700">{selectedCodes.size}</strong> مجوز</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-xs text-slate-600 hover:bg-slate-100 cursor-pointer transition font-medium"
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'در حال ذخیره...' : 'ذخیره ماتریس دسترسی‌ها'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
