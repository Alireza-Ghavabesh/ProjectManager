import React, { useState, useMemo } from 'react';
import { DynamicField, User } from '../types';
import { api } from '../services/api';
import { formatBudgetDisplay, formatCurrencyInput } from '../utils/formatters';
import {
  Sliders,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  Layers,
  X,
  GripVertical,
  ArrowDownToLine,
  CornerDownLeft,
  Eye,
  Move,
  ArrowUpFromLine,
  Hash,
  Coins,
  Type,
  ListChecks,
} from 'lucide-react';

interface DynamicFieldsManagerProps {
  fields: DynamicField[];
  currentUser: User;
  onRefresh: () => void;
}

const FIELD_TYPE_META: Record<
  string,
  { label: string; icon: React.ReactNode; badgeClass: string }
> = {
  number: {
    label: 'عددی / تعداد',
    icon: <Hash className="w-3.5 h-3.5" />,
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  currency: {
    label: 'مبلغ / هزینه',
    icon: <Coins className="w-3.5 h-3.5" />,
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  text: {
    label: 'متنی / توضیح',
    icon: <Type className="w-3.5 h-3.5" />,
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  select: {
    label: 'انتخابی (لیست)',
    icon: <ListChecks className="w-3.5 h-3.5" />,
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
  },
};

export const DynamicFieldsManager: React.FC<DynamicFieldsManagerProps> = ({
  fields,
  currentUser,
  onRefresh,
}) => {
  // Add / Edit Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<DynamicField | null>(null);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('نفر');
  const [defaultValue, setDefaultValue] = useState('1');
  const [category, setCategory] = useState('عوامل تولید');
  const [fieldType, setFieldType] = useState<'number' | 'currency' | 'text' | 'select'>('number');
  const [optionsText, setOptionsText] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [required, setRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Preview Toggle
  const [showPreview, setShowPreview] = useState(false);

  // Drag & Drop State
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isAdmin =
    currentUser.role === 'ADMIN' ||
    (Array.isArray(currentUser.permissions) && currentUser.permissions.includes('projects.fields.manage'));

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 3500);
  };

  // Build hierarchical tree from flat fields list
  const fieldTree = useMemo(() => {
    const validIds = new Set(fields.map((f) => f.id));
    const buildBranch = (pId: string | null): DynamicField[] => {
      return fields
        .filter((f) => {
          const effParent = f.parentId && validIds.has(f.parentId) ? f.parentId : null;
          return effParent === pId;
        })
        .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0) || a.name.localeCompare(b.name, 'fa'))
        .map((f) => ({
          ...f,
          children: buildBranch(f.id),
        }));
    };
    return buildBranch(null);
  }, [fields]);

  const isFieldDescendant = (potentialAncestorId: string, fieldId: string): boolean => {
    if (potentialAncestorId === fieldId) return true;
    let cur = fields.find((f) => f.id === fieldId);
    const seen = new Set<string>();
    while (cur && cur.parentId) {
      if (seen.has(cur.id)) break;
      seen.add(cur.id);
      if (cur.parentId === potentialAncestorId) return true;
      cur = fields.find((f) => f.id === cur?.parentId);
    }
    return false;
  };

  const handleOpenAdd = (initialParentId: string | null = null) => {
    setEditingField(null);
    setName('');
    setFieldType(initialParentId ? 'currency' : 'number');
    setUnit(initialParentId ? 'تومان' : 'نفر');
    setDefaultValue(initialParentId ? '0' : '1');
    const parentField = initialParentId ? fields.find((f) => f.id === initialParentId) : null;
    setCategory(parentField?.category || 'عوامل تولید');
    setOptionsText('');
    setParentId(initialParentId);
    setRequired(false);
    setError('');
    setModalOpen(true);
  };

  const handleOpenEdit = (fld: DynamicField) => {
    setEditingField(fld);
    setName(fld.name);
    setFieldType((fld.fieldType as any) || 'number');
    setUnit(fld.unit ?? '');
    setDefaultValue(fld.defaultValue ?? '');
    setCategory(fld.category || 'عوامل تولید');
    let parsedOpts = '';
    if (fld.optionsJson) {
      try {
        const arr = JSON.parse(fld.optionsJson);
        if (Array.isArray(arr)) parsedOpts = arr.join('، ');
      } catch {}
    }
    setOptionsText(parsedOpts);
    setParentId(fld.parentId || null);
    setRequired(Boolean(fld.required));
    setError('');
    setModalOpen(true);
  };

  const handleFieldTypeChange = (nextType: 'number' | 'currency' | 'text' | 'select') => {
    setFieldType(nextType);
    if (!editingField) {
      if (nextType === 'currency') {
        setUnit('تومان');
        setDefaultValue('0');
      } else if (nextType === 'number') {
        setUnit('نفر');
        setDefaultValue('1');
      } else {
        setUnit('');
        setDefaultValue('');
      }
    }
  };

  const handleSaveField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('نام فیلد الزامی است.');
      return;
    }

    setLoading(true);
    setError('');

    const optionsList = optionsText
      .split(/[،,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      if (editingField) {
        await api.updateDynamicField(editingField.id, {
          name: name.trim(),
          fieldType,
          unit: unit.trim(),
          defaultValue: defaultValue.trim(),
          optionsJson: JSON.stringify(optionsList),
          category,
          parentId: parentId || null,
          required,
        });
        showToast('success', `فیلد «${name.trim()}» با موفقیت ویرایش شد.`);
      } else {
        const key = `fld_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        await api.createDynamicField({
          name: name.trim(),
          key,
          unit: unit.trim(),
          defaultValue: defaultValue.trim(),
          optionsJson: JSON.stringify(optionsList),
          category,
          fieldType,
          parentId: parentId || null,
          required,
        });
        showToast('success', `فیلد «${name.trim()}» ایجاد شد.`);
      }

      setModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'خطا در ذخیره فیلد');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteField = async (id: string, fieldName: string) => {
    if (!confirm(`آیا از حذف فیلد «${fieldName}» اطمینان دارید؟ (در صورت داشتن ویژگی زیرمجموعه، به سطح والد منتقل می‌شوند)`)) return;
    try {
      await api.deleteDynamicField(id);
      showToast('success', `فیلد «${fieldName}» حذف شد.`);
      onRefresh();
    } catch (err: any) {
      showToast('error', err.message || 'خطا در حذف فیلد');
    }
  };

  // Drag & Drop persistence helper
  const moveFieldNode = async (
    movingFieldId: string,
    newParentId: string | null,
    insertBeforeFieldId?: string | null
  ) => {
    if (movingFieldId === newParentId) return;
    if (newParentId && isFieldDescendant(movingFieldId, newParentId)) {
      showToast('error', 'یک فیلد نمی‌تواند زیرمجموعه زیرشاخه‌های خودش قرار گیرد.');
      return;
    }

    const movingField = fields.find((f) => f.id === movingFieldId);
    if (!movingField) return;

    const validIds = new Set(fields.map((f) => f.id));
    const siblings = fields
      .filter((f) => {
        const effP = f.parentId && validIds.has(f.parentId) ? f.parentId : null;
        return effP === (newParentId || null) && f.id !== movingFieldId;
      })
      .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0) || a.name.localeCompare(b.name, 'fa'));

    let insertIdx = siblings.length;
    if (insertBeforeFieldId) {
      const idx = siblings.findIndex((s) => s.id === insertBeforeFieldId);
      if (idx !== -1) insertIdx = idx;
    }

    const updatedSiblings = [...siblings];
    updatedSiblings.splice(insertIdx, 0, { ...movingField, parentId: newParentId });

    const payload = updatedSiblings.map((f, idx) => ({
      id: f.id,
      parentId: newParentId,
      orderIndex: idx,
    }));

    try {
      await api.reorderDynamicFields(payload);
      onRefresh();
      if (newParentId) {
        const parentObj = fields.find((f) => f.id === newParentId);
        showToast('success', `فیلد «${movingField.name}» به عنوان ویژگی زیرمجموعه «${parentObj?.name || ''}» قرار گرفت.`);
      } else {
        showToast('success', `جایگاه فیلد «${movingField.name}» در سطح اصلی ذخیره شد.`);
      }
    } catch (err: any) {
      showToast('error', err.message || 'خطا در تغییر سلسله‌مراتب فیلد');
    }
  };

  // Recursive Tree Node Renderer
  const renderFieldNode = (field: DynamicField, depth: number = 0, indexInSiblings: number = 0) => {
    const typeMeta = FIELD_TYPE_META[field.fieldType] || FIELD_TYPE_META.number;
    const isBeingDragged = draggedFieldId === field.id;
    const isInvalidTarget = draggedFieldId ? isFieldDescendant(draggedFieldId, field.id) : false;
    const isDropHighlight = dropTargetKey === `field:${field.id}` && !isInvalidTarget;
    const dropBetweenKey = `before:${field.parentId || 'root'}:${field.id}`;
    const hasChildren = field.children && field.children.length > 0;

    return (
      <div key={field.id} className="relative flex flex-col items-stretch">
        {/* Drop Strip BEFORE sibling for reordering */}
        {isAdmin && draggedFieldId && (
          <div
            onDragOver={(e) => {
              if (draggedFieldId === field.id || (field.parentId && isFieldDescendant(draggedFieldId, field.parentId))) return;
              e.preventDefault();
              e.stopPropagation();
              setDropTargetKey(dropBetweenKey);
            }}
            onDragLeave={(e) => {
              e.stopPropagation();
              if (dropTargetKey === dropBetweenKey) setDropTargetKey(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDropTargetKey(null);
              const movingId = draggedFieldId;
              setDraggedFieldId(null);
              if (movingId) moveFieldNode(movingId, field.parentId || null, field.id);
            }}
            style={{ marginRight: `${depth * 24}px` }}
            className={`transition-all rounded-full my-0.5 ${
              dropTargetKey === dropBetweenKey
                ? 'h-3 bg-indigo-500 border border-indigo-600 shadow-xs'
                : 'h-1.5 bg-transparent hover:bg-indigo-200/70'
            }`}
          />
        )}

        {/* Field Card */}
        <div
          draggable={isAdmin}
          onDragStart={(e) => {
            if (!isAdmin) return;
            e.stopPropagation();
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', field.id);
            setDraggedFieldId(field.id);
          }}
          onDragEnd={() => {
            setDraggedFieldId(null);
            setDropTargetKey(null);
          }}
          onDragOver={(e) => {
            if (!isAdmin || !draggedFieldId || isInvalidTarget) return;
            e.preventDefault();
            e.stopPropagation();
            setDropTargetKey(`field:${field.id}`);
          }}
          onDragLeave={(e) => {
            e.stopPropagation();
            if (dropTargetKey === `field:${field.id}`) setDropTargetKey(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDropTargetKey(null);
            const movingId = draggedFieldId;
            setDraggedFieldId(null);
            if (movingId && !isInvalidTarget) {
              moveFieldNode(movingId, field.id);
            }
          }}
          style={{ marginRight: `${depth * 24}px` }}
          className={`p-4 rounded-2xl border transition shadow-2xs group ${
            isBeingDragged
              ? 'opacity-45 scale-[0.99] border-dashed border-indigo-400 bg-indigo-50/40'
              : isDropHighlight
              ? 'ring-2 ring-indigo-500 border-indigo-500 bg-indigo-50/60 shadow-md'
              : depth === 0
              ? 'bg-white border-slate-200 hover:border-indigo-300'
              : 'bg-slate-50/90 border-indigo-200/80 hover:border-indigo-400'
          }`}
        >
          {isDropHighlight && (
            <div className="mb-2.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-[11px] font-bold flex items-center gap-1.5">
              <ArrowDownToLine className="w-3.5 h-3.5" />
              <span>رها کنید تا به عنوان ویژگی زیرمجموعه «{field.name}» قرار گیرد</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Left Info */}
            <div className="flex items-center gap-2.5 min-w-0">
              {isAdmin && (
                <span
                  className="p-1.5 rounded-lg bg-slate-100 text-slate-400 group-hover:text-indigo-600 cursor-grab active:cursor-grabbing shrink-0 transition"
                  title="برای تغییر والد یا ترتیب بکشید و رها کنید"
                >
                  <GripVertical className="w-4 h-4" />
                </span>
              )}

              <span
                className={`w-7 h-7 rounded-xl font-bold text-xs flex items-center justify-center border shrink-0 ${
                  depth === 0
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-indigo-700 border-indigo-200'
                }`}
              >
                {depth === 0 ? indexInSiblings + 1 : <CornerDownLeft className="w-3.5 h-3.5" />}
              </span>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">{field.name}</h3>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border ${typeMeta.badgeClass}`}
                  >
                    {typeMeta.icon}
                    {typeMeta.label}
                  </span>
                  {hasChildren && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {field.children!.length} ویژگی زیرمجموعه
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-1.5">
                  {field.unit && (
                    <span className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-700">
                      واحد: <strong className="text-indigo-600">{field.unit}</strong>
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-700">
                    پیش‌فرض:{' '}
                    <strong className="text-emerald-700">
                      {field.fieldType === 'currency' && field.defaultValue
                        ? formatBudgetDisplay(field.defaultValue)
                        : field.defaultValue || '—'}
                    </strong>
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-indigo-50/60 border border-indigo-200/60 text-indigo-800">
                    {field.category || 'عوامل تولید'}
                  </span>
                  {depth > 0 && field.parentName && (
                    <span className="text-[10px] text-indigo-600 font-semibold">
                      ویژگیِ «{field.parentName}»
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right Actions */}
            {isAdmin && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleOpenAdd(field.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-[11px] font-bold transition cursor-pointer"
                  title="افزودن ویژگی زیرمجموعه برای این فیلد (مثلاً هزینه یا ساعت کار)"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>افزودن ویژگی</span>
                </button>

                {depth > 0 && (
                  <button
                    type="button"
                    onClick={() => moveFieldNode(field.id, null)}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer"
                    title="انتقال به سطح اصلی (فیلد مستقل)"
                  >
                    <ArrowUpFromLine className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleOpenEdit(field)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
                  title="ویرایش فیلد"
                >
                  <Edit3 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteField(field.id, field.name)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                  title="حذف فیلد"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Recursive Children */}
        {hasChildren && (
          <div className="mt-2.5 space-y-2.5 pr-3 border-r-2 border-indigo-200">
            {field.children!.map((child, cIdx) => renderFieldNode(child, depth + 1, cIdx))}
          </div>
        )}
      </div>
    );
  };

  // Recursive Preview Renderer for Project Form
  const renderPreviewNode = (fld: DynamicField, depth: number = 0) => (
    <div
      key={fld.id}
      className={`rounded-2xl border p-3 ${
        depth === 0 ? 'bg-white border-slate-200' : 'bg-indigo-50/40 border-indigo-200/80'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-xs font-bold text-slate-800">{fld.name}</span>
        {fld.unit && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
            {fld.unit}
          </span>
        )}
      </div>
      <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
        {fld.fieldType === 'currency'
          ? `${formatCurrencyInput(fld.defaultValue || '0') || '۰'} ${fld.unit || 'تومان'}`
          : fld.defaultValue || (fld.fieldType === 'select' ? 'انتخاب از لیست...' : 'مقدار...')}
      </div>
      {fld.children && fld.children.length > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-indigo-100 space-y-2 pr-3 border-r-2 border-indigo-300">
          <div className="text-[10px] font-bold text-indigo-700">
            ویژگی‌های زیرمجموعه «{fld.name}»:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {fld.children.map((ch) => renderPreviewNode(ch, depth + 1))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-5 sm:p-6 rounded-3xl bg-indigo-50/70 border border-indigo-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-1.5 rounded-xl bg-indigo-100 text-indigo-700">
              <Sliders className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              مدیریت و ساختار درختی فیلدهای پویای پروژه
            </h2>
          </div>
          <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
            هر فیلد را بسازید و با <strong>کشیدن و رها کردن (درگ‌اند‌دراپ)</strong> مشخص کنید چه فیلدهایی زیرمجموعه یا ویژگی یک فیلد دیگر باشند (مثلاً «هزینه دستمزد» و «ساعات کار» زیرمجموعه «تعداد تصویربردار»).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl border text-xs font-bold transition cursor-pointer ${
              showPreview
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Eye className="w-4 h-4" />
            <span>{showPreview ? 'بستن پیش‌نمایش فرم' : 'پیش‌نمایش فرم پروژه'}</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => handleOpenAdd(null)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>تعریف فیلد جدید</span>
            </button>
          )}
        </div>
      </div>

      {toast && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-2 animate-in fade-in duration-150 ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} className="p-0.5 hover:opacity-70 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Optional Live Preview Panel */}
      {showPreview && (
        <div className="p-5 rounded-3xl bg-white border-2 border-emerald-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Eye className="w-4 h-4 text-emerald-600" />
              <span>پیش‌نمایش نحوه نمایش فیلدهای سلسله‌مراتبی هنگام ثبت پروژه</span>
            </h3>
            <span className="text-[11px] text-slate-500">{fields.length} فیلد فعال</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {fieldTree.map((fld) => renderPreviewNode(fld, 0))}
          </div>
        </div>
      )}

      {/* Visual Drag & Drop Hierarchy Builder */}
      <div className="p-4 sm:p-6 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">
              بوم چیدمان سلسله‌مراتب و ویژگی‌های فیلدها
            </h3>
          </div>
          {isAdmin && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-xl bg-slate-100 text-slate-600">
              <Move className="w-3.5 h-3.5 text-indigo-600" />
              هر فیلد را روی فیلد دیگری رها کنید تا ویژگیِ آن شود
            </span>
          )}
        </div>

        {/* Root Drop Zone */}
        {isAdmin && (
          <div
            onDragOver={(e) => {
              if (!draggedFieldId) return;
              e.preventDefault();
              setDropTargetKey('root-zone');
            }}
            onDragLeave={() => {
              if (dropTargetKey === 'root-zone') setDropTargetKey(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDropTargetKey(null);
              const movingId = draggedFieldId;
              setDraggedFieldId(null);
              if (movingId) moveFieldNode(movingId, null);
            }}
            className={`p-3 rounded-2xl border-2 border-dashed text-center text-xs transition ${
              dropTargetKey === 'root-zone'
                ? 'border-indigo-600 bg-indigo-50 text-indigo-800 font-bold'
                : draggedFieldId
                ? 'border-indigo-300 bg-indigo-50/30 text-indigo-700 font-semibold'
                : 'border-slate-200 bg-slate-50/70 text-slate-500'
            }`}
          >
            سطح اصلی (فیلد مستقل) — فیلدهای زیرمجموعه را اینجا رها کنید تا به سطح اصلی برگردند
          </div>
        )}

        {fieldTree.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-50 border border-dashed border-slate-300 space-y-2">
            <p className="text-sm font-bold text-slate-700">هنوز فیلد پویایی تعریف نشده است</p>
            <p className="text-xs text-slate-500">
              با زدن دکمه «تعریف فیلد جدید» می‌توانید فیلدهای نیاز پروژه و ویژگی‌های زیرمجموعه آن‌ها را بسازید.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {fieldTree.map((fld, idx) => renderFieldNode(fld, 0, idx))}
          </div>
        )}
      </div>

      {/* Modal: Create / Edit Dynamic Field */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-800 my-6">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/80">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-600" />
                {editingField ? `ویرایش فیلد «${editingField.name}»` : 'تعریف فیلد / ویژگی پویای جدید'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="m-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSaveField} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  نام فیلد یا ویژگی *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: تعداد تصویربردار، هزینه دستمزد، ساعات کار..."
                  className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
                  required
                />
              </div>

              {/* Parent Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  جایگاه در ساختار (زیرمجموعه کدام فیلد باشد؟)
                </label>
                <select
                  value={parentId || ''}
                  onChange={(e) => setParentId(e.target.value || null)}
                  className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-indigo-900 font-bold focus:outline-none focus:border-indigo-500 transition"
                >
                  <option value="">سطح اصلی (فیلد مستقل بدون والد)</option>
                  {fields
                    .filter((f) =>
                      editingField
                        ? f.id !== editingField.id && !isFieldDescendant(editingField.id, f.id)
                        : true
                    )
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        ویژگیِ زیرمجموعه: {f.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Field Type */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  نوع مقدار فیلد
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['number', 'currency', 'text', 'select'] as const).map((t) => {
                    const meta = FIELD_TYPE_META[t];
                    const active = fieldType === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => handleFieldTypeChange(t)}
                        className={`p-2 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 cursor-pointer transition ${
                          active
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {meta.icon}
                        <span className="text-[11px]">{meta.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {fieldType === 'select' && (
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    گزینه‌های لیست (با ویرگول «،» یا خط جدید جدا کنید)
                  </label>
                  <textarea
                    rows={2}
                    value={optionsText}
                    onChange={(e) => setOptionsText(e.target.value)}
                    placeholder="مثال: ساعتی، روزانه، پروژه‌ای"
                    className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    واحد سنجش
                  </label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="نفر، ساعت، تومان، دستگاه..."
                    className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    مقدار پیش‌فرض
                  </label>
                  <input
                    type="text"
                    value={defaultValue}
                    onChange={(e) => setDefaultValue(e.target.value)}
                    placeholder="1"
                    className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 transition text-center shadow-2xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    دسته‌بندی فیلد
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-xl bg-white border border-slate-300 px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-indigo-500 transition shadow-2xs"
                  >
                    <option value="عوامل تولید">عوامل تولید</option>
                    <option value="عوامل فنی و تصویر">عوامل فنی و تصویر</option>
                    <option value="تیم کارگردانی">تیم کارگردانی</option>
                    <option value="پشتیبانی و لجستیک">پشتیبانی و لجستیک</option>
                    <option value="طراحی صحنه و لباس">طراحی صحنه و لباس</option>
                    <option value="پس‌تولید و تدوین">پس‌تولید و تدوین</option>
                    <option value="تجهیزات تخصصی">تجهیزات تخصصی</option>
                    <option value="مالی و دستمزد">مالی و دستمزد</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={required}
                    onChange={(e) => setRequired(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-bold text-slate-700">تکمیل این فیلد اجباری باشد</span>
                </label>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white hover:bg-slate-100 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer disabled:opacity-50"
                >
                  {loading
                    ? 'در حال ذخیره...'
                    : editingField
                    ? 'ذخیره تغییرات فیلد'
                    : 'افزودن به ساختار فیلدها'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
