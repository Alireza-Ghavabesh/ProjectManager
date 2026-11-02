import React, { useState, useEffect } from 'react';
import { Position, Permission } from '../types';
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
  Save
} from 'lucide-react';

interface PermissionsTreeModalProps {
  position: Position;
  onClose: () => void;
  onSuccess: () => void;
}

export const PermissionsTreeModal: React.FC<PermissionsTreeModalProps> = ({
  position,
  onClose,
  onSuccess,
}) => {
  const [tree, setTree] = useState<Permission[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [permData, currentPosPerms] = await Promise.all([
          api.getPermissions(),
          api.getPositionPermissions(position.id),
        ]);
        setTree(permData.tree);
        setSelectedCodes(new Set(currentPosPerms));
        // Expand all root nodes by default
        setExpandedNodes(new Set(permData.tree.map((r) => r.code)));
      } catch (err: any) {
        setError(err.message || 'خطا در بارگذاری ماتریس دسترسی‌ها');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [position.id]);

  const toggleExpand = (code: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
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

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await api.updatePositionPermissions(position.id, Array.from(selectedCodes));
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'خطا در ذخیره دسترسی‌ها');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-2xl rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>ساختار درختی سطح دسترسی‌های سمت:</span>
                <span className="text-blue-700 font-extrabold">{position.title}</span>
              </h3>
              <p className="text-xs text-slate-500">
                تعیین دقیق مجوزهای کاربری (عدم امکان افزودن ادمین یا تغییر فیلدها مگر با فعال‌سازی گره مربوطه)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="m-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            {error}
          </div>
        )}

        {/* Tree Content */}
        <div className="p-5 max-h-[500px] overflow-y-auto space-y-4">
          {loading ? (
            <div className="text-center py-10 text-slate-500 text-xs">
              در حال بارگذاری درخت دسترسی‌ها...
            </div>
          ) : (
            tree.map((root) => {
              const isExpanded = expandedNodes.has(root.code);
              const isRootSelected = selectedCodes.has(root.code);
              const children = root.children || [];
              const selectedChildrenCount = children.filter((c) => selectedCodes.has(c.code)).length;

              return (
                <div
                  key={root.code}
                  className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs"
                >
                  {/* Root Branch */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-blue-50/40 transition">
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => toggleExpand(root.code)}
                        className="text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-blue-600" />
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
                          <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <div>
                          <span className="text-xs font-bold text-slate-900 block">
                            {root.title}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {root.code}
                          </span>
                        </div>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-semibold">
                        {selectedChildrenCount} از {children.length} مجوز فعال
                      </span>
                    </div>
                  </div>

                  {/* Children Nodes (Indented Tree Leaves) */}
                  {isExpanded && children.length > 0 && (
                    <div className="p-3 pr-8 space-y-2 border-t border-slate-100 bg-slate-50/50">
                      {children.map((child) => {
                        const isChildSelected = selectedCodes.has(child.code);
                        return (
                          <div
                            key={child.code}
                            className={`p-2.5 rounded-xl border transition flex items-center justify-between gap-3 ${
                              isChildSelected
                                ? 'bg-blue-50/80 border-blue-200 text-slate-900'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => togglePermission(child.code, false)}
                              className="flex items-start gap-2.5 cursor-pointer text-right flex-1"
                            >
                              <div className="mt-0.5">
                                {isChildSelected ? (
                                  <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                                ) : (
                                  <Square className="w-3.5 h-3.5 text-slate-400" />
                                )}
                              </div>
                              <div>
                                <div className="text-xs font-semibold leading-tight flex items-center gap-2">
                                  <span>{child.title}</span>
                                  {child.isDanger ? (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 font-bold">
                                      <ShieldAlert className="w-2.5 h-2.5" />
                                      اختیار حساس
                                    </span>
                                  ) : null}
                                </div>
                                {child.description && (
                                  <div className="text-[10px] text-slate-500 mt-0.5">
                                    {child.description}
                                  </div>
                                )}
                              </div>
                            </button>

                            <span className="text-[9px] text-slate-400 font-mono shrink-0 hidden sm:inline" dir="ltr">
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

        {/* Modal Actions */}
        <div className="flex items-center justify-between p-4 border-t border-slate-100 bg-slate-50/60">
          <div className="text-xs text-slate-600 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>مجموع مجوزهای انتخاب‌شده: <strong>{selectedCodes.size}</strong> گره</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-xs text-slate-600 hover:bg-slate-100 cursor-pointer transition"
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition"
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
