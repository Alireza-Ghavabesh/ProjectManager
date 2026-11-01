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
  AlertTriangle,
  Lock,
  Save,
  Layers
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-2xl rounded-3xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>ساختار درختی سطح دسترسی‌های سمت:</span>
                <span className="text-cyan-400 font-extrabold">{position.title}</span>
              </h3>
              <p className="text-xs text-slate-400">
                تعیین دقیق مجوزهای کاربری (عدم امکان افزودن ادمین یا تغییر فیلدها مگر با فعال‌سازی گره مربوطه)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="m-5 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
            {error}
          </div>
        )}

        {/* Tree Content */}
        <div className="p-5 max-h-[500px] overflow-y-auto space-y-4">
          {loading ? (
            <div className="text-center py-10 text-slate-400 text-xs">
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
                  className="rounded-2xl border border-slate-800 bg-slate-950/50 overflow-hidden"
                >
                  {/* Root Branch */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-900/90 hover:bg-slate-900 transition">
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => toggleExpand(root.code)}
                        className="text-slate-400 hover:text-white cursor-pointer"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-cyan-400" />
                        ) : (
                          <ChevronLeft className="w-4 h-4 text-slate-500" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => togglePermission(root.code, true, children)}
                        className="flex items-center gap-2 cursor-pointer text-right"
                      >
                        {isRootSelected ? (
                          <CheckSquare className="w-4 h-4 text-cyan-400 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-600 shrink-0" />
                        )}
                        <div>
                          <span className="text-xs font-bold text-white block">
                            {root.title}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {root.code}
                          </span>
                        </div>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium">
                        {selectedChildrenCount} از {children.length} مجوز فعال
                      </span>
                    </div>
                  </div>

                  {/* Children Nodes (Indented Tree Leaves) */}
                  {isExpanded && children.length > 0 && (
                    <div className="p-3 pr-8 space-y-2 border-t border-slate-800/80 bg-slate-950/30">
                      {children.map((child) => {
                        const isChildSelected = selectedCodes.has(child.code);
                        return (
                          <div
                            key={child.code}
                            className={`p-2.5 rounded-xl border transition flex items-center justify-between gap-3 ${
                              isChildSelected
                                ? 'bg-cyan-950/30 border-cyan-500/30 text-white'
                                : 'bg-slate-900/50 border-slate-800/80 text-slate-300'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => togglePermission(child.code, false)}
                              className="flex items-start gap-2.5 cursor-pointer text-right flex-1"
                            >
                              <div className="mt-0.5">
                                {isChildSelected ? (
                                  <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
                                ) : (
                                  <Square className="w-3.5 h-3.5 text-slate-600" />
                                )}
                              </div>
                              <div>
                                <div className="text-xs font-semibold leading-tight flex items-center gap-2">
                                  <span>{child.title}</span>
                                  {child.isDanger ? (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1 font-bold">
                                      <ShieldAlert className="w-2.5 h-2.5" />
                                      اختیار حساس
                                    </span>
                                  ) : null}
                                </div>
                                {child.description && (
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    {child.description}
                                  </div>
                                )}
                              </div>
                            </button>

                            <span className="text-[9px] text-slate-500 font-mono shrink-0 hidden sm:inline" dir="ltr">
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
        <div className="flex items-center justify-between p-4 border-t border-slate-800 bg-slate-950/60">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>مجموع مجوزهای انتخاب‌شده: <strong>{selectedCodes.size}</strong> گره</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-xs font-bold text-white shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
