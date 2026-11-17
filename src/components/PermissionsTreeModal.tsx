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
  AlertCircle,
  Eye,
  PlusCircle,
  Edit3,
  Trash2
} from 'lucide-react';

interface PermissionsTreeModalProps {
  position?: Position | null;
  user?: User | null;
  onClose: () => void;
  onSuccess: () => void;
}

const CRUD_META = [
  { key: 'view', label: 'نمایش', icon: Eye, activeCls: 'bg-sky-50 border-sky-400 text-sky-900 ring-1 ring-sky-300', iconCls: 'text-sky-600' },
  { key: 'create', label: 'ثبت جدید', icon: PlusCircle, activeCls: 'bg-emerald-50 border-emerald-400 text-emerald-900 ring-1 ring-emerald-300', iconCls: 'text-emerald-600' },
  { key: 'edit', label: 'ویرایش', icon: Edit3, activeCls: 'bg-amber-50 border-amber-400 text-amber-900 ring-1 ring-amber-300', iconCls: 'text-amber-600' },
  { key: 'delete', label: 'حذف', icon: Trash2, activeCls: 'bg-rose-50 border-rose-400 text-rose-900 ring-1 ring-rose-300', iconCls: 'text-rose-600' },
] as const;

function getCrudSlot(code: string): 'view' | 'create' | 'edit' | 'delete' | null {
  if (
    code === 'workflow.history.view' ||
    code === 'voting.confidential.view_all' ||
    code === 'projects.cartable.view'
  ) {
    return null;
  }
  if (code.endsWith('.view')) return 'view';
  if (code.endsWith('.create')) return 'create';
  if (code.endsWith('.edit')) return 'edit';
  if (code.endsWith('.delete')) return 'delete';
  return null;
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
  const [inheritedPermissions, setInheritedPermissions] = useState<Set<string>>(new Set());
  const [inheritedSources, setInheritedSources] = useState<
    Array<{ positionId: string; positionTitle: string; structureTitle?: string }>
  >([]);
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
      setExpandedNodes(new Set(permData.tree.map((r) => r.code)));

      if (user) {
        const userPermsData = await api.getUserPermissions(user.id);
        setSelectedCodes(new Set(userPermsData.permissions));
        setInheritedPermissions(new Set(userPermsData.inheritedPermissions || []));
        setInheritedSources(userPermsData.inheritedSources || []);
        setHasCustomPerms(Boolean(userPermsData.hasCustomPermissions));
      } else if (position) {
        const posPerms = await api.getPositionPermissions(position.id);
        setSelectedCodes(new Set(posPerms));
        setInheritedPermissions(new Set());
        setInheritedSources([]);
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

  const selectViewOnlyAll = () => {
    const views = new Set<string>();
    tree.forEach((root) => {
      const viewChildren = (root.children || []).filter((c) => getCrudSlot(c.code) === 'view');
      if (viewChildren.length > 0) {
        views.add(root.code);
        viewChildren.forEach((c) => views.add(c.code));
      }
    });
    setSelectedCodes(views);
  };

  const deselectAll = () => {
    if (isUserTarget && inheritedPermissions.size > 0) {
      const kept = new Set<string>(inheritedPermissions);
      tree.forEach((root) => {
        if ((root.children || []).some((c) => kept.has(c.code))) {
          kept.add(root.code);
        }
      });
      setSelectedCodes(kept);
      return;
    }
    setSelectedCodes(new Set());
  };

  const toggleRootBranch = (root: Permission) => {
    const children = root.children || [];
    const allChildrenSelected = children.length > 0 && children.every((c) => selectedCodes.has(c.code));
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (allChildrenSelected || (children.length === 0 && next.has(root.code))) {
        children.forEach((c) => {
          if (!isUserTarget || !inheritedPermissions.has(c.code)) {
            next.delete(c.code);
          }
        });
        const anyRemaining = children.some((c) => next.has(c.code));
        if (!anyRemaining && (!isUserTarget || !inheritedPermissions.has(root.code))) {
          next.delete(root.code);
        }
      } else {
        next.add(root.code);
        children.forEach((c) => next.add(c.code));
      }
      return next;
    });
  };

  const toggleChildPermission = (childCode: string, root: Permission) => {
    if (isUserTarget && inheritedPermissions.has(childCode) && selectedCodes.has(childCode)) {
      return;
    }
    const children = root.children || [];
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(childCode)) {
        next.delete(childCode);
        const anyRemaining = children.some((c) => next.has(c.code));
        if (!anyRemaining && (!isUserTarget || !inheritedPermissions.has(root.code))) {
          next.delete(root.code);
        }
      } else {
        next.add(childCode);
        next.add(root.code);
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
      setSuccessMsg('مجوزهای اختصاصی پاک و ارث‌بری کامل از سمت برقرار شد.');
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
      if (user) {
        const rootCodes = new Set(tree.map((r) => r.code));
        const customLeaves = Array.from(selectedCodes).filter(
          (code) => !rootCodes.has(code) && !inheritedPermissions.has(code)
        );
        if (customLeaves.length === 0) {
          await api.resetUserPermissions(user.id);
        } else {
          const customSet = new Set<string>(customLeaves);
          tree.forEach((root) => {
            if ((root.children || []).some((c) => customSet.has(c.code))) {
              customSet.add(root.code);
            }
          });
          await api.updateUserPermissions(user.id, Array.from(customSet));
        }
      } else if (position) {
        await api.updatePositionPermissions(position.id, Array.from(selectedCodes));
      }
      setSuccessMsg('تغییرات با موفقیت ذخیره شدند.');
      onSuccess();
      setTimeout(() => {
        onClose();
      }, 350);
    } catch (err: any) {
      setError(err.message || 'خطا در ذخیره دسترسی‌ها');
    } finally {
      setSaving(false);
    }
  };

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

  // Leaf permissions count (more meaningful than including root container codes)
  const selectedLeafCount = useMemo(() => {
    const rootCodes = new Set(tree.map((r) => r.code));
    let count = 0;
    selectedCodes.forEach((c) => {
      if (!rootCodes.has(c)) count++;
    });
    return count;
  }, [selectedCodes, tree]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-4xl rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-4 sm:my-6 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/80 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center shrink-0 mt-0.5">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500 font-medium">
                  {isUserTarget ? 'ماتریس مجوزهای کاربر (ارث‌بری خودکار + اختصاصی):' : 'ماتریس مجوزهای پایه سمت سازمانی:'}
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
                    {hasCustomPerms ? 'ارث‌بری از سمت + مجوز اختصاصی' : 'ارث‌بری مستقیم از سمت'}
                  </span>
                )}
              </div>
              {isUserTarget && inheritedSources.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span className="text-[10px] font-bold text-emerald-800">سمت‌های فعال در ساختار و چارت:</span>
                  {inheritedSources.map((src, sIdx) => (
                    <span
                      key={`${src.positionId}_${sIdx}`}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold"
                    >
                      {src.positionTitle}
                      {src.structureTitle ? ` (${src.structureTitle})` : ''}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-slate-500 mt-1">
                {isUserTarget
                  ? 'مجوزهای دارای برچسب «از سمت» به‌صورت خودکار از سمت(های) انتصابی کاربر در ساختار و چارت ارث‌بری می‌شوند و با تغییر دسترسی سمت، بلافاصله برای کاربر نیز بروزرسانی می‌گردند.'
                  : 'هر دسترسی که به این سمت بدهید، به‌صورت خودکار برای تمام کاربرانی که در این سمت (در چارت یا ساختارهای پروژه) عضو هستند فعال می‌شود.'}
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
              placeholder="جستجو در موجودیت، عملیات یا کد مجوز..."
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
              onClick={selectViewOnlyAll}
              className="px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 border border-sky-200 text-[11px] font-bold text-sky-800 transition cursor-pointer flex items-center gap-1"
              title="فقط دسترسی نمایش تمام بخش‌ها را فعال می‌کند"
            >
              <Eye className="w-3 h-3 text-sky-600" />
              <span>فقط نمایش</span>
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

        {/* Entity CRUD Tree Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1 bg-slate-50/40">
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
              const children = root.children || [];
              const selectedChildrenCount = children.filter((c) => selectedCodes.has(c.code)).length;
              const allChildrenSelected = children.length > 0 && selectedChildrenCount === children.length;
              const partialSelected = selectedChildrenCount > 0 && !allChildrenSelected;

              // Separate standard CRUD leaves from specialized leaves
              const crudMap: Partial<Record<'view' | 'create' | 'edit' | 'delete', Permission>> = {};
              const specialChildren: Permission[] = [];
              children.forEach((child) => {
                const slot = getCrudSlot(child.code);
                if (slot && !crudMap[slot]) {
                  crudMap[slot] = child;
                } else {
                  specialChildren.push(child);
                }
              });
              const hasCrudStrip = Object.keys(crudMap).length > 0;

              return (
                <div
                  key={root.code}
                  className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs"
                >
                  {/* Entity Header Row */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-50/90 hover:bg-indigo-50/40 transition gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleExpand(root.code)}
                        className="text-slate-400 hover:text-slate-700 cursor-pointer p-0.5 shrink-0"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-indigo-600" />
                        ) : (
                          <ChevronLeft className="w-4 h-4 text-slate-400" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleRootBranch(root)}
                        className="flex items-center gap-2 cursor-pointer text-right min-w-0"
                        title="انتخاب یا لغو کل دسترسی‌های این موجودیت"
                      >
                        {allChildrenSelected ? (
                          <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                        ) : partialSelected ? (
                          <div className="w-4 h-4 rounded border-2 border-indigo-600 bg-indigo-100 flex items-center justify-center shrink-0">
                            <div className="w-2 h-0.5 bg-indigo-700 rounded" />
                          </div>
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <span className="text-xs sm:text-sm font-bold text-slate-900 block leading-tight">
                            {root.title}
                          </span>
                          {root.description && (
                            <span className="text-[11px] text-slate-500 block truncate mt-0.5">
                              {root.description}
                            </span>
                          )}
                        </div>
                      </button>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {root.isDanger ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 font-bold">
                          <ShieldAlert className="w-2.5 h-2.5" />
                          حساس
                        </span>
                      ) : null}
                      <span
                        className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${
                          selectedChildrenCount > 0
                            ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {selectedChildrenCount} از {children.length} فعال
                      </span>
                    </div>
                  </div>

                  {/* Expanded Body: 4-Column CRUD Strip + Extra Specialized Permissions */}
                  {isExpanded && children.length > 0 && (
                    <div className="p-3.5 space-y-3 border-t border-slate-100 bg-white">
                      {hasCrudStrip && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {CRUD_META.map((meta) => {
                            const perm = crudMap[meta.key];
                            if (!perm) {
                              return (
                                <div
                                  key={meta.key}
                                  className="px-3 py-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-[11px] text-slate-300 flex items-center justify-center"
                                >
                                  —
                                </div>
                              );
                            }
                            const checked = selectedCodes.has(perm.code);
                            const isInherited = isUserTarget && inheritedPermissions.has(perm.code);
                            const IconComp = meta.icon;
                            return (
                              <button
                                key={perm.code}
                                type="button"
                                onClick={() => toggleChildPermission(perm.code, root)}
                                title={
                                  isInherited
                                    ? 'ارث‌بری خودکار از سمت (برای تغییر، دسترسی سمت را ویرایش کنید)'
                                    : perm.description || perm.title
                                }
                                className={`px-3 py-2.5 rounded-xl border text-right transition flex items-center justify-between gap-2 ${
                                  isInherited
                                    ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 cursor-default'
                                    : checked
                                    ? `${meta.activeCls} cursor-pointer`
                                    : 'bg-slate-50/80 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300 cursor-pointer'
                                }`}
                              >
                                <span className="flex items-center gap-1.5 min-w-0">
                                  <IconComp className={`w-3.5 h-3.5 shrink-0 ${checked ? meta.iconCls : 'text-slate-400'}`} />
                                  <span className="text-xs font-bold truncate">
                                    {perm.code === 'projects.view' ? 'نمایش همه' : meta.label}
                                  </span>
                                  {isInherited && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold shrink-0">
                                      از سمت
                                    </span>
                                  )}
                                </span>
                                {isInherited ? (
                                  <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                ) : checked ? (
                                  <CheckSquare className={`w-4 h-4 shrink-0 ${meta.iconCls}`} />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-300 shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {specialChildren.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          {hasCrudStrip && (
                            <div className="text-[10px] font-bold text-slate-400 px-1">
                              اختیارات تخصصی و تکمیلی:
                            </div>
                          )}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {specialChildren.map((child) => {
                              const isChildSelected = selectedCodes.has(child.code);
                              const isChildInherited = isUserTarget && inheritedPermissions.has(child.code);
                              return (
                                <button
                                  key={child.code}
                                  type="button"
                                  onClick={() => toggleChildPermission(child.code, root)}
                                  title={
                                    isChildInherited
                                      ? 'ارث‌بری خودکار از سمت (برای تغییر، دسترسی سمت را ویرایش کنید)'
                                      : child.description || child.title
                                  }
                                  className={`p-2.5 rounded-xl border transition flex items-start justify-between gap-2 text-right ${
                                    isChildInherited
                                      ? 'bg-emerald-50/80 border-emerald-300 text-slate-900 cursor-default'
                                      : isChildSelected
                                      ? 'bg-indigo-50/70 border-indigo-300 text-slate-900 cursor-pointer'
                                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer'
                                  }`}
                                >
                                  <div className="flex items-start gap-2 min-w-0">
                                    <div className="mt-0.5 shrink-0">
                                      {isChildInherited ? (
                                        <Lock className="w-3.5 h-3.5 text-emerald-600" />
                                      ) : isChildSelected ? (
                                        <CheckSquare className="w-4 h-4 text-indigo-600" />
                                      ) : (
                                        <Square className="w-4 h-4 text-slate-400" />
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="text-xs font-bold leading-tight flex items-center gap-1.5 flex-wrap">
                                        <span>{child.title}</span>
                                        {isChildInherited && (
                                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold">
                                            ارث‌بری از سمت
                                          </span>
                                        )}
                                        {child.isDanger ? (
                                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 font-bold">
                                            <ShieldAlert className="w-2.5 h-2.5" />
                                            حساس
                                          </span>
                                        ) : null}
                                      </div>
                                      {child.description && (
                                        <div className="text-[11px] text-slate-500 mt-0.5 font-normal">
                                          {child.description}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
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
            <span>مجموع عملیات مجاز انتخاب‌شده: <strong className="text-indigo-700">{selectedLeafCount}</strong> مجوز</span>
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
