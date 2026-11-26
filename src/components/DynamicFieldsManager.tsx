import React, { useState, useMemo } from 'react';
import {
  DynamicField,
  DynamicFieldType,
  ProjectType,
  CustomEntity,
  CustomEntityRecord,
  EntityFieldSchema,
  EntityFieldType,
  FieldFileValue,
  User,
  Workflow,
} from '../types';
import { api, formatFileSize } from '../services/api';
import { formatBudgetDisplay, formatCurrencyInput } from '../utils/formatters';
import { hasPerm } from '../utils/permissions';
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
  FolderKanban,
  GitBranch,
  Link2,
  CheckSquare,
  Square,
  Paperclip,
  Database,
  ListPlus,
  Download,
  Upload,
  ChevronDown,
  ChevronUp,
  Star,
} from 'lucide-react';

interface DynamicFieldsManagerProps {
  fields: DynamicField[];
  projectTypes?: ProjectType[];
  entities?: CustomEntity[];
  workflows?: Workflow[];
  currentUser: User;
  onRefresh: () => void;
}

const FIELD_TYPE_META: Record<
  DynamicFieldType,
  { label: string; shortLabel: string; icon: React.ReactNode; badgeClass: string }
> = {
  text: {
    label: 'متن',
    shortLabel: 'متن',
    icon: <Type className="w-3.5 h-3.5" />,
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  number: {
    label: 'عددی',
    shortLabel: 'عددی',
    icon: <Hash className="w-3.5 h-3.5" />,
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  currency: {
    label: 'مبلغ / هزینه',
    shortLabel: 'مبلغ',
    icon: <Coins className="w-3.5 h-3.5" />,
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  file: {
    label: 'فایل / پیوست',
    shortLabel: 'فایل',
    icon: <Paperclip className="w-3.5 h-3.5" />,
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  checkbox: {
    label: 'چک‌باکس (بله/خیر)',
    shortLabel: 'چک‌باکس',
    icon: <CheckSquare className="w-3.5 h-3.5" />,
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-200',
  },
  select: {
    label: 'سلکت‌باکس تک‌انتخابی',
    shortLabel: 'تک‌انتخابی',
    icon: <ListChecks className="w-3.5 h-3.5" />,
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  multiselect: {
    label: 'سلکت‌باکس چندانتخابی',
    shortLabel: 'چندانتخابی',
    icon: <ListPlus className="w-3.5 h-3.5" />,
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  entity: {
    label: 'فیلد از نوع موجودیت',
    shortLabel: 'موجودیت',
    icon: <Database className="w-3.5 h-3.5" />,
    badgeClass: 'bg-cyan-50 text-cyan-800 border-cyan-200',
  },
  entity_select: {
    label: 'سلکت‌باکس تک‌انتخابی موجودیت',
    shortLabel: 'انتخاب موجودیت',
    icon: <Database className="w-3.5 h-3.5" />,
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  entity_multiselect: {
    label: 'سلکت‌باکس چندانتخابی موجودیت',
    shortLabel: 'چندانتخابی موجودیت',
    icon: <Database className="w-3.5 h-3.5" />,
    badgeClass: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200',
  },
};

const ENTITY_SUBFIELD_TYPE_LABELS: Record<EntityFieldType, string> = {
  text: 'متن',
  number: 'عددی',
  currency: 'مبلغ (تومان)',
  checkbox: 'چک‌باکس',
  select: 'تک‌انتخابی',
  multiselect: 'چندانتخابی',
  file: 'فایل',
};

const ALL_DYNAMIC_FIELD_TYPES: DynamicFieldType[] = [
  'text',
  'number',
  'currency',
  'file',
  'checkbox',
  'select',
  'multiselect',
  'entity',
  'entity_select',
  'entity_multiselect',
];

export const DynamicFieldsManager: React.FC<DynamicFieldsManagerProps> = ({
  fields,
  projectTypes = [],
  entities = [],
  workflows = [],
  currentUser,
  onRefresh,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'fields' | 'entities' | 'types'>('fields');

  // Add / Edit Dynamic Field Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<DynamicField | null>(null);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('نفر');
  const [defaultValue, setDefaultValue] = useState('1');
  const [category, setCategory] = useState('عوامل تولید');
  const [fieldType, setFieldType] = useState<DynamicFieldType>('number');
  const [optionsText, setOptionsText] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [required, setRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Custom Entity Modal State
  const [entityModalOpen, setEntityModalOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<CustomEntity | null>(null);
  const [entityTitle, setEntityTitle] = useState('');
  const [entityDescription, setEntityDescription] = useState('');
  const [entityFieldsDraft, setEntityFieldsDraft] = useState<Array<EntityFieldSchema & { optionsRaw?: string }>>([]);
  const [entitySaving, setEntitySaving] = useState(false);
  const [entityError, setEntityError] = useState('');
  const [expandedEntityIds, setExpandedEntityIds] = useState<Record<string, boolean>>({});

  // Custom Entity Record Modal State
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [recordTargetEntity, setRecordTargetEntity] = useState<CustomEntity | null>(null);
  const [editingRecord, setEditingRecord] = useState<CustomEntityRecord | null>(null);
  const [recordFormData, setRecordFormData] = useState<Record<string, any>>({});
  const [recordSaving, setRecordSaving] = useState(false);
  const [recordError, setRecordError] = useState('');
  const [uploadingAttrKey, setUploadingAttrKey] = useState<string | null>(null);

  // Project Type Modal State
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<ProjectType | null>(null);
  const [typeTitle, setTypeTitle] = useState('');
  const [typeDescription, setTypeDescription] = useState('');
  const [typeDefaultWorkflowId, setTypeDefaultWorkflowId] = useState<string>('');
  const [typeIsActive, setTypeIsActive] = useState(true);
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [typeSaving, setTypeSaving] = useState(false);
  const [typeError, setTypeError] = useState('');

  // Preview Toggle
  const [showPreview, setShowPreview] = useState(false);

  // Drag & Drop State
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const canCreateField = hasPerm(currentUser, 'projects.fields.create');
  const canEditField = hasPerm(currentUser, 'projects.fields.edit');
  const canDeleteField = hasPerm(currentUser, 'projects.fields.delete');

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

  const collectDescendantIds = (fieldId: string): string[] => {
    const result: string[] = [fieldId];
    const children = fields.filter((f) => f.parentId === fieldId);
    for (const ch of children) {
      result.push(...collectDescendantIds(ch.id));
    }
    return result;
  };

  const isEntityFieldType = (t: DynamicFieldType) =>
    t === 'entity' || t === 'entity_select' || t === 'entity_multiselect';

  const handleOpenAdd = (initialParentId: string | null = null) => {
    setEditingField(null);
    setName('');
    setFieldType(initialParentId ? 'currency' : 'number');
    setUnit(initialParentId ? 'تومان' : 'نفر');
    setDefaultValue(initialParentId ? '0' : '1');
    const parentField = initialParentId ? fields.find((f) => f.id === initialParentId) : null;
    setCategory(parentField?.category || 'عوامل تولید');
    setOptionsText('');
    setSelectedEntityId(entities[0]?.id || '');
    setParentId(initialParentId);
    setRequired(false);
    setError('');
    setModalOpen(true);
  };

  const handleOpenEdit = (fld: DynamicField) => {
    setEditingField(fld);
    setName(fld.name);
    setFieldType((fld.fieldType as DynamicFieldType) || 'number');
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
    setSelectedEntityId(fld.entityId || entities[0]?.id || '');
    setParentId(fld.parentId || null);
    setRequired(Boolean(fld.required));
    setError('');
    setModalOpen(true);
  };

  const handleFieldTypeChange = (nextType: DynamicFieldType) => {
    setFieldType(nextType);
    if (isEntityFieldType(nextType) && !selectedEntityId && entities.length > 0) {
      setSelectedEntityId(entities[0].id);
    }
    if (!editingField) {
      if (nextType === 'currency') {
        setUnit('تومان');
        setDefaultValue('0');
      } else if (nextType === 'number') {
        setUnit('نفر');
        setDefaultValue('1');
      } else if (nextType === 'checkbox') {
        setUnit('');
        setDefaultValue('false');
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

    if (isEntityFieldType(fieldType) && !selectedEntityId) {
      setError('لطفاً موجودیت مرتبط با این فیلد را انتخاب کنید (یا ابتدا از تب موجودیت‌ها بسازید).');
      return;
    }

    const optionsList = optionsText
      .split(/[،,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if ((fieldType === 'select' || fieldType === 'multiselect') && optionsList.length === 0) {
      setError('لطفاً حداقل یک گزینه برای لیست انتخابی وارد کنید.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const resolvedEntityId = isEntityFieldType(fieldType) ? selectedEntityId : null;
      if (editingField) {
        await api.updateDynamicField(editingField.id, {
          name: name.trim(),
          fieldType,
          unit: unit.trim(),
          defaultValue: defaultValue.trim(),
          optionsJson: JSON.stringify(optionsList),
          entityId: resolvedEntityId,
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
          entityId: resolvedEntityId,
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

  // ==================== CUSTOM ENTITY & RECORD CRUD HANDLERS ====================

  const handleOpenAddEntity = () => {
    setEditingEntity(null);
    setEntityTitle('');
    setEntityDescription('');
    setEntityFieldsDraft([
      {
        key: 'name',
        label: 'نام',
        fieldType: 'text',
        unit: '',
        options: [],
        optionsRaw: '',
        required: true,
        isPrimaryDisplay: true,
      },
    ]);
    setEntityError('');
    setEntityModalOpen(true);
  };

  const handleOpenEditEntity = (ent: CustomEntity) => {
    setEditingEntity(ent);
    setEntityTitle(ent.title);
    setEntityDescription(ent.description || '');
    setEntityFieldsDraft(
      (ent.fields || []).map((f) => ({
        ...f,
        optionsRaw: Array.isArray(f.options) ? f.options.join('، ') : '',
      }))
    );
    setEntityError('');
    setEntityModalOpen(true);
  };

  const addEntityFieldRow = () => {
    setEntityFieldsDraft((prev) => [
      ...prev,
      {
        key: `attr_${Date.now()}_${prev.length + 1}`,
        label: '',
        fieldType: 'text',
        unit: '',
        options: [],
        optionsRaw: '',
        required: false,
        isPrimaryDisplay: prev.length === 0,
      },
    ]);
  };

  const updateEntityFieldRow = (idx: number, patch: Partial<EntityFieldSchema & { optionsRaw?: string }>) => {
    setEntityFieldsDraft((prev) =>
      prev.map((row, i) => {
        if (i !== idx) {
          if (patch.isPrimaryDisplay) return { ...row, isPrimaryDisplay: false };
          return row;
        }
        const merged = { ...row, ...patch };
        if (patch.fieldType === 'currency' && !merged.unit) {
          merged.unit = 'تومان';
        }
        return merged;
      })
    );
  };

  const removeEntityFieldRow = (idx: number) => {
    setEntityFieldsDraft((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length > 0 && !next.some((r) => r.isPrimaryDisplay)) {
        next[0].isPrimaryDisplay = true;
      }
      return next;
    });
  };

  const handleSaveEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entityTitle.trim()) {
      setEntityError('عنوان موجودیت الزامی است.');
      return;
    }
    const cleanFields: EntityFieldSchema[] = entityFieldsDraft
      .filter((f) => f.label.trim())
      .map((f, idx) => ({
        key: f.key?.trim() || `attr_${idx + 1}`,
        label: f.label.trim(),
        fieldType: f.fieldType,
        unit: f.unit?.trim() || '',
        options: (f.optionsRaw || '')
          .split(/[،,\n]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        required: Boolean(f.required),
        isPrimaryDisplay: Boolean(f.isPrimaryDisplay),
      }));

    if (cleanFields.length === 0) {
      setEntityError('حداقل یک فیلد با نام مشخص برای موجودیت تعریف کنید.');
      return;
    }
    if (!cleanFields.some((f) => f.isPrimaryDisplay)) {
      cleanFields[0].isPrimaryDisplay = true;
    }

    setEntitySaving(true);
    setEntityError('');
    try {
      if (editingEntity) {
        await api.updateEntity(editingEntity.id, {
          title: entityTitle.trim(),
          description: entityDescription.trim(),
          fields: cleanFields,
        });
        showToast('success', `موجودیت «${entityTitle.trim()}» بروزرسانی شد.`);
      } else {
        const created = await api.createEntity({
          title: entityTitle.trim(),
          description: entityDescription.trim(),
          fields: cleanFields,
        });
        if (modalOpen && isEntityFieldType(fieldType)) {
          setSelectedEntityId(created.id);
        }
        setExpandedEntityIds((prev) => ({ ...prev, [created.id]: true }));
        showToast('success', `موجودیت «${entityTitle.trim()}» با ${cleanFields.length} ویژگی ایجاد شد.`);
      }
      setEntityModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setEntityError(err.message || 'خطا در ذخیره موجودیت');
    } finally {
      setEntitySaving(false);
    }
  };

  const handleDeleteEntity = async (ent: CustomEntity) => {
    if (!confirm(`آیا از حذف موجودیت «${ent.title}» و تمام ${ent.recordCount || 0} رکورد آن اطمینان دارید؟`)) return;
    try {
      await api.deleteEntity(ent.id);
      showToast('success', `موجودیت «${ent.title}» حذف شد.`);
      onRefresh();
    } catch (err: any) {
      showToast('error', err.message || 'خطا در حذف موجودیت');
    }
  };

  const handleOpenAddRecord = (ent: CustomEntity) => {
    setRecordTargetEntity(ent);
    setEditingRecord(null);
    const initial: Record<string, any> = {};
    for (const f of ent.fields || []) {
      initial[f.key] =
        f.fieldType === 'checkbox'
          ? false
          : f.fieldType === 'multiselect'
          ? []
          : f.fieldType === 'file'
          ? null
          : '';
    }
    setRecordFormData(initial);
    setRecordError('');
    setRecordModalOpen(true);
  };

  const handleOpenEditRecord = (ent: CustomEntity, rec: CustomEntityRecord) => {
    setRecordTargetEntity(ent);
    setEditingRecord(rec);
    const initial: Record<string, any> = {};
    for (const f of ent.fields || []) {
      const v = rec.data?.[f.key];
      initial[f.key] =
        v !== undefined
          ? v
          : f.fieldType === 'checkbox'
          ? false
          : f.fieldType === 'multiselect'
          ? []
          : f.fieldType === 'file'
          ? null
          : '';
    }
    setRecordFormData(initial);
    setRecordError('');
    setRecordModalOpen(true);
  };

  const handleRecordFileUpload = async (attrKey: string, file: File) => {
    setUploadingAttrKey(attrKey);
    setRecordError('');
    try {
      const uploaded: FieldFileValue = await api.uploadFieldFileStream(file);
      setRecordFormData((prev) => ({ ...prev, [attrKey]: uploaded }));
    } catch (err: any) {
      setRecordError(err.message || 'خطا در آپلود فایل');
    } finally {
      setUploadingAttrKey(null);
    }
  };

  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordTargetEntity) return;
    setRecordSaving(true);
    setRecordError('');
    try {
      if (editingRecord) {
        await api.updateEntityRecord(recordTargetEntity.id, editingRecord.id, recordFormData);
        showToast('success', 'رکورد موجودیت ویرایش شد.');
      } else {
        await api.createEntityRecord(recordTargetEntity.id, recordFormData);
        showToast('success', `رکورد جدید به موجودیت «${recordTargetEntity.title}» اضافه شد.`);
      }
      setRecordModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setRecordError(err.message || 'خطا در ذخیره رکورد');
    } finally {
      setRecordSaving(false);
    }
  };

  const handleDeleteRecord = async (ent: CustomEntity, rec: CustomEntityRecord) => {
    if (!confirm(`آیا از حذف «${rec.displayLabel}» از موجودیت «${ent.title}» اطمینان دارید؟`)) return;
    try {
      await api.deleteEntityRecord(ent.id, rec.id);
      showToast('success', `رکورد «${rec.displayLabel}» حذف شد.`);
      onRefresh();
    } catch (err: any) {
      showToast('error', err.message || 'خطا در حذف رکورد');
    }
  };

  // ==================== PROJECT TYPE CRUD HANDLERS ====================

  const handleOpenAddType = () => {
    setEditingType(null);
    setTypeTitle('');
    setTypeDescription('');
    setTypeDefaultWorkflowId('');
    setTypeIsActive(true);
    setSelectedFieldIds([]);
    setTypeError('');
    setTypeModalOpen(true);
  };

  const handleOpenEditType = (pt: ProjectType) => {
    setEditingType(pt);
    setTypeTitle(pt.title);
    setTypeDescription(pt.description || '');
    setTypeDefaultWorkflowId(pt.defaultWorkflowId || '');
    setTypeIsActive(pt.isActive !== 0 && pt.isActive !== false);
    setSelectedFieldIds(Array.isArray(pt.fieldIds) ? [...pt.fieldIds] : []);
    setTypeError('');
    setTypeModalOpen(true);
  };

  const toggleTypeFieldSelection = (field: DynamicField) => {
    const isCurrentlySelected = selectedFieldIds.includes(field.id);
    const branchIds = collectDescendantIds(field.id);
    if (isCurrentlySelected) {
      const removeSet = new Set(branchIds);
      setSelectedFieldIds((prev) => prev.filter((id) => !removeSet.has(id)));
    } else {
      setSelectedFieldIds((prev) => Array.from(new Set([...prev, ...branchIds])));
    }
  };

  const handleSaveProjectType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeTitle.trim()) {
      setTypeError('عنوان نوع پروژه الزامی است.');
      return;
    }

    setTypeSaving(true);
    setTypeError('');
    try {
      const payload = {
        title: typeTitle.trim(),
        description: typeDescription.trim(),
        defaultWorkflowId: typeDefaultWorkflowId || null,
        isActive: typeIsActive,
        fieldIds: selectedFieldIds,
      };
      if (editingType) {
        await api.updateProjectType(editingType.id, payload);
        showToast('success', `نوع پروژه «${typeTitle.trim()}» و فیلدهای متصل ذخیره شد.`);
      } else {
        await api.createProjectType(payload);
        showToast('success', `نوع پروژه «${typeTitle.trim()}» ایجاد شد.`);
      }
      setTypeModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setTypeError(err.message || 'خطا در ذخیره نوع پروژه');
    } finally {
      setTypeSaving(false);
    }
  };

  const handleDeleteProjectType = async (pt: ProjectType) => {
    if (!confirm(`آیا از حذف نوع پروژه «${pt.title}» اطمینان دارید؟`)) return;
    try {
      await api.deleteProjectType(pt.id);
      showToast('success', `نوع پروژه «${pt.title}» حذف شد.`);
      onRefresh();
    } catch (err: any) {
      showToast('error', err.message || 'خطا در حذف نوع پروژه');
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
        {canEditField && draggedFieldId && (
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
          draggable={canEditField}
          onDragStart={(e) => {
            if (!canEditField) return;
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
            if (!canEditField || !draggedFieldId || isInvalidTarget) return;
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
              {canEditField && (
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
                  {(field.entityId || field.entityTitle) && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-50 border border-cyan-200 text-cyan-800 font-bold">
                      <Database className="w-3 h-3" />
                      موجودیت: {field.entityTitle || entities.find((e) => e.id === field.entityId)?.title || 'نامشخص'}
                    </span>
                  )}
                  {!isEntityFieldType(field.fieldType) && field.fieldType !== 'file' && (
                    <span className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-700">
                      پیش‌فرض:{' '}
                      <strong className="text-emerald-700">
                        {field.fieldType === 'currency' && field.defaultValue
                          ? formatBudgetDisplay(field.defaultValue)
                          : field.fieldType === 'checkbox'
                          ? field.defaultValue === 'true'
                            ? 'تیک‌خورده'
                            : 'خالی'
                          : field.defaultValue || '—'}
                      </strong>
                    </span>
                  )}
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
            {(canCreateField || canEditField || canDeleteField) && (
              <div className="flex items-center gap-1.5 shrink-0">
                {canCreateField && (
                  <button
                    type="button"
                    onClick={() => handleOpenAdd(field.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-[11px] font-bold transition cursor-pointer"
                    title="افزودن ویژگی زیرمجموعه برای این فیلد (مثلاً هزینه یا ساعت کار)"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>افزودن ویژگی</span>
                  </button>
                )}

                {canEditField && depth > 0 && (
                  <button
                    type="button"
                    onClick={() => moveFieldNode(field.id, null)}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer"
                    title="انتقال به سطح اصلی (فیلد مستقل)"
                  >
                    <ArrowUpFromLine className="w-3.5 h-3.5" />
                  </button>
                )}

                {canEditField && (
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(field)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
                    title="ویرایش فیلد"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                )}

                {canDeleteField && (
                  <button
                    type="button"
                    onClick={() => handleDeleteField(field.id, field.name)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                    title="حذف فیلد"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
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
          : fld.fieldType === 'file'
          ? 'آپلود فایل اختصاصی فیلد...'
          : fld.fieldType === 'checkbox'
          ? fld.defaultValue === 'true'
            ? '☑ بله (تیک‌خورده)'
            : '☐ خیر'
          : fld.fieldType === 'multiselect'
          ? 'انتخاب چند مورد از لیست...'
          : fld.fieldType === 'entity'
          ? `فرم اطلاعات موجودیت «${fld.entityTitle || entities.find((e) => e.id === fld.entityId)?.title || ''}»`
          : fld.fieldType === 'entity_select'
          ? `انتخاب یک رکورد از «${fld.entityTitle || entities.find((e) => e.id === fld.entityId)?.title || ''}»`
          : fld.fieldType === 'entity_multiselect'
          ? `انتخاب چند رکورد از «${fld.entityTitle || entities.find((e) => e.id === fld.entityId)?.title || ''}»`
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

  // Recursive Checkbox Tree Renderer for Project Type Linking
  const renderFieldChecklistNode = (fld: DynamicField, depth: number = 0) => {
    const checked = selectedFieldIds.includes(fld.id);
    const typeMeta = FIELD_TYPE_META[fld.fieldType] || FIELD_TYPE_META.number;
    return (
      <div key={fld.id} className="space-y-1.5">
        <label
          style={{ marginRight: `${depth * 20}px` }}
          className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border cursor-pointer transition ${
            checked
              ? 'bg-indigo-50/80 border-indigo-400 text-indigo-950'
              : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggleTypeFieldSelection(fld)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 shrink-0"
            />
            <span className="text-xs font-bold truncate">{fld.name}</span>
            {fld.unit && (
              <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                {fld.unit}
              </span>
            )}
          </div>
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border shrink-0 ${typeMeta.badgeClass}`}>
            {typeMeta.icon}
            {typeMeta.label}
          </span>
        </label>

        {fld.children && fld.children.length > 0 && (
          <div className="space-y-1.5 pr-3 border-r-2 border-indigo-200">
            {fld.children.map((ch) => renderFieldChecklistNode(ch, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner + Sub-tabs */}
      <div className="p-5 sm:p-6 rounded-3xl bg-indigo-50/70 border border-indigo-100 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="p-1.5 rounded-xl bg-indigo-100 text-indigo-700">
                {activeSubTab === 'fields' ? (
                  <Sliders className="w-5 h-5" />
                ) : activeSubTab === 'entities' ? (
                  <Database className="w-5 h-5" />
                ) : (
                  <FolderKanban className="w-5 h-5" />
                )}
              </span>
              <h2 className="text-lg font-bold text-slate-900">
                {activeSubTab === 'fields'
                  ? 'مدیریت و ساختار درختی فیلدهای پویای پروژه'
                  : activeSubTab === 'entities'
                  ? 'تعریف موجودیت‌های سفارشی و داده‌های پایه'
                  : 'تعریف انواع پروژه و اتصال فیلدهای اختصاصی'}
              </h2>
            </div>
            <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
              {activeSubTab === 'fields'
                ? 'فیلدهایی با انواع متن، عددی، فایل، چک‌باکس، لیست تک/چندانتخابی و فیلدهای متصل به موجودیت بسازید و ساختار درختی آن‌ها را بچینید.'
                : activeSubTab === 'entities'
                ? 'موجودیت‌هایی مثل «کارگردان»، «تهیه‌کننده» یا «تجهیزات» را با ویژگی‌های دلخواه (نام، کد ملی، حقوق دریافتی و...) تعریف و رکوردهای آن‌ها را مدیریت کنید.'
                : 'انواع مختلف پروژه (مثلاً مستند، برنامه استودیویی، طرح عمرانی...) را تعریف کنید و مشخص نمایید هنگام ثبت هر نوع پروژه دقیقاً کدام فیلدها نمایش داده شوند.'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {activeSubTab === 'fields' ? (
              <>
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

                {canCreateField && (
                  <button
                    type="button"
                    onClick={() => handleOpenAdd(null)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>تعریف فیلد جدید</span>
                  </button>
                )}
              </>
            ) : activeSubTab === 'entities' ? (
              canCreateField && (
                <button
                  type="button"
                  onClick={handleOpenAddEntity}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-cyan-600 hover:bg-cyan-700 text-xs font-bold text-white shadow-md shadow-cyan-500/20 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>تعریف موجودیت جدید</span>
                </button>
              )
            ) : (
              canCreateField && (
                <button
                  type="button"
                  onClick={handleOpenAddType}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>تعریف نوع پروژه جدید</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* Sub-Tabs Navigation */}
        <div className="flex items-center gap-2 pt-2 border-t border-indigo-200/60 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveSubTab('fields')}
            className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold transition cursor-pointer ${
              activeSubTab === 'fields'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>فیلدهای پویا ({fields.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('entities')}
            className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold transition cursor-pointer ${
              activeSubTab === 'entities'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>موجودیت‌ها و داده‌ها ({entities.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('types')}
            className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold transition cursor-pointer ${
              activeSubTab === 'types'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <FolderKanban className="w-4 h-4" />
            <span>انواع پروژه و اتصال فیلدها ({projectTypes.length})</span>
          </button>
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

      {/* ===================== SUB-TAB 1: DYNAMIC FIELDS TREE ===================== */}
      {activeSubTab === 'fields' && (
        <>
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

          <div className="p-4 sm:p-6 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  بوم چیدمان سلسله‌مراتب و ویژگی‌های فیلدها
                </h3>
              </div>
              {canEditField && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-xl bg-slate-100 text-slate-600">
                  <Move className="w-3.5 h-3.5 text-indigo-600" />
                  هر فیلد را روی فیلد دیگری رها کنید تا ویژگیِ آن شود
                </span>
              )}
            </div>

            {canEditField && (
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
        </>
      )}

      {/* ===================== SUB-TAB: CUSTOM ENTITIES & RECORDS ===================== */}
      {activeSubTab === 'entities' && (
        <div className="space-y-4">
          {entities.length === 0 ? (
            <div className="p-10 text-center rounded-3xl bg-white border border-slate-200 space-y-3 shadow-xs">
              <Database className="w-12 h-12 text-cyan-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">هنوز موجودیت سفارشی تعریف نشده است</h3>
              <p className="text-xs text-slate-500 max-w-lg mx-auto leading-relaxed">
                به‌عنوان مثال می‌توانید موجودیت <strong>«کارگردان»</strong> را با فیلدهای «نام»، «کد ملی» و «حقوق دریافتی» تعریف کنید، رکوردهای آن را ثبت نمایید و سپس در فیلدهای پروژه از آن استفاده کنید.
              </p>
              {canCreateField && (
                <button
                  type="button"
                  onClick={handleOpenAddEntity}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-cyan-600 hover:bg-cyan-700 text-xs font-bold text-white shadow-sm transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>ساخت اولین موجودیت</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {entities.map((ent) => {
                const records = ent.records || [];
                const isOpen = expandedEntityIds[ent.id] !== false;
                return (
                  <div
                    key={ent.id}
                    className="rounded-3xl bg-white border border-slate-200 shadow-xs overflow-hidden"
                  >
                    <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/60 border-b border-slate-100">
                      <div className="space-y-2 min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="p-2 rounded-xl bg-cyan-100 text-cyan-700">
                            <Database className="w-4 h-4" />
                          </span>
                          <h3 className="text-base font-extrabold text-slate-900">{ent.title}</h3>
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-cyan-50 text-cyan-800 border border-cyan-200 tabular-nums">
                            {ent.fields.length} ویژگی
                          </span>
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 tabular-nums">
                            {records.length} رکورد ثبت‌شده
                          </span>
                        </div>
                        {ent.description && (
                          <p className="text-xs text-slate-500">{ent.description}</p>
                        )}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {ent.fields.map((ef) => (
                            <span
                              key={ef.key}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                                ef.isPrimaryDisplay
                                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                                  : 'bg-white border-slate-200 text-slate-700'
                              }`}
                            >
                              {ef.isPrimaryDisplay && <Star className="w-3 h-3 text-amber-500 fill-amber-400" />}
                              <span>{ef.label}</span>
                              <span className="text-[10px] text-slate-400">
                                ({ENTITY_SUBFIELD_TYPE_LABELS[ef.fieldType] || ef.fieldType})
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        {(canCreateField || canEditField) && (
                          <button
                            type="button"
                            onClick={() => handleOpenAddRecord(ent)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>افزودن رکورد جدید</span>
                          </button>
                        )}
                        {canEditField && (
                          <button
                            type="button"
                            onClick={() => handleOpenEditEntity(ent)}
                            className="p-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition cursor-pointer"
                            title="ویرایش ساختار موجودیت"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                        {canDeleteField && (
                          <button
                            type="button"
                            onClick={() => handleDeleteEntity(ent)}
                            className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition cursor-pointer"
                            title="حذف موجودیت"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedEntityIds((prev) => ({ ...prev, [ent.id]: !isOpen }))
                          }
                          className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                          title={isOpen ? 'بستن لیست رکوردها' : 'نمایش رکوردها'}
                        >
                          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="p-4 sm:p-5">
                        {records.length === 0 ? (
                          <div className="p-5 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-500">
                            هنوز رکوردی برای «{ent.title}» ثبت نشده است. با دکمه «افزودن رکورد جدید» می‌توانید داده‌های این موجودیت را اضافه کنید.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {records.map((rec) => (
                              <div
                                key={rec.id}
                                className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/90 flex flex-col justify-between gap-2.5"
                              >
                                <div className="space-y-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <h4 className="text-xs font-extrabold text-slate-900 truncate">
                                      {rec.displayLabel}
                                    </h4>
                                    {(canEditField || canDeleteField) && (
                                      <div className="flex items-center gap-1 shrink-0">
                                        {canEditField && (
                                          <button
                                            type="button"
                                            onClick={() => handleOpenEditRecord(ent, rec)}
                                            className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                                            title="ویرایش رکورد"
                                          >
                                            <Edit3 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                        {canDeleteField && (
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteRecord(ent, rec)}
                                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                            title="حذف رکورد"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  <div className="space-y-1">
                                    {ent.fields.map((ef) => {
                                      const val = rec.data?.[ef.key];
                                      if (
                                        val === undefined ||
                                        val === null ||
                                        val === '' ||
                                        (Array.isArray(val) && val.length === 0)
                                      ) {
                                        return null;
                                      }
                                      return (
                                        <div
                                          key={ef.key}
                                          className="flex items-center justify-between gap-2 text-[11px] bg-white px-2.5 py-1 rounded-lg border border-slate-200/70"
                                        >
                                          <span className="text-slate-500 shrink-0">{ef.label}:</span>
                                          {ef.fieldType === 'file' && (val as FieldFileValue)?.fileId ? (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                api.downloadFieldFile(val.fileId, val.fileName)
                                              }
                                              className="inline-flex items-center gap-1 text-sky-700 font-bold hover:underline truncate cursor-pointer"
                                            >
                                              <Download className="w-3 h-3 shrink-0" />
                                              <span className="truncate">{val.fileName}</span>
                                            </button>
                                          ) : ef.fieldType === 'checkbox' ? (
                                            <span className="font-bold text-teal-700">
                                              {val ? 'بله' : 'خیر'}
                                            </span>
                                          ) : ef.fieldType === 'currency' ? (
                                            <span className="font-bold text-amber-800 tabular-nums">
                                              {formatBudgetDisplay(String(val))}
                                            </span>
                                          ) : Array.isArray(val) ? (
                                            <span className="font-bold text-indigo-700 truncate">
                                              {val.join('، ')}
                                            </span>
                                          ) : (
                                            <span className="font-bold text-slate-800 truncate tabular-nums">
                                              {String(val)}
                                              {ef.unit ? ` ${ef.unit}` : ''}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================== SUB-TAB 2: PROJECT TYPES & LINKED FIELDS ===================== */}
      {activeSubTab === 'types' && (
        <div className="space-y-4">
          {projectTypes.length === 0 ? (
            <div className="p-10 text-center rounded-3xl bg-white border border-slate-200 space-y-3 shadow-xs">
              <FolderKanban className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">هنوز نوع پروژه‌ای تعریف نشده است</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                با تعریف نوع پروژه (مثلاً «مستند»، «برنامه استودیویی»، «پویش رسانه‌ای»...) می‌توانید مشخص کنید هنگام ثبت هر نوع پروژه کدام فیلدهای پویا نمایش داده شوند و گردش کار پیش‌فرض آن چه باشد.
              </p>
              {canCreateField && (
                <button
                  type="button"
                  onClick={handleOpenAddType}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-sm transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>ایجاد اولین نوع پروژه</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projectTypes.map((pt) => {
                const linkedFields = fields.filter((f) => (pt.fieldIds || []).includes(f.id));
                const active = pt.isActive !== 0 && pt.isActive !== false;

                return (
                  <div
                    key={pt.id}
                    className={`p-5 rounded-3xl bg-white border shadow-xs flex flex-col justify-between gap-4 transition ${
                      active ? 'border-slate-200 hover:border-indigo-300' : 'border-slate-200 opacity-70 bg-slate-50'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-extrabold text-slate-900">{pt.title}</h3>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                active
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-slate-100 text-slate-500 border-slate-200'
                              }`}
                            >
                              {active ? 'فعال' : 'غیرفعال'}
                            </span>
                          </div>
                          {pt.description && (
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{pt.description}</p>
                          )}
                        </div>

                        {(canEditField || canDeleteField) && (
                          <div className="flex items-center gap-1 shrink-0">
                            {canEditField && (
                              <button
                                type="button"
                                onClick={() => handleOpenEditType(pt)}
                                className="p-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition cursor-pointer"
                                title="ویرایش نوع پروژه و فیلدهای متصل"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                            )}
                            {canDeleteField && (
                              <button
                                type="button"
                                onClick={() => handleDeleteProjectType(pt)}
                                className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition cursor-pointer"
                                title="حذف نوع پروژه"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold tabular-nums">
                          <Link2 className="w-3.5 h-3.5" />
                          {linkedFields.length} فیلد متصل
                        </span>
                        {pt.defaultWorkflowTitle && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-50 text-blue-800 border border-blue-200 font-semibold">
                            <GitBranch className="w-3.5 h-3.5" />
                            گردش پیش‌فرض: {pt.defaultWorkflowTitle}
                          </span>
                        )}
                        <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-600 font-semibold tabular-nums">
                          {pt.projectCount || 0} پروژه ثبت‌شده
                        </span>
                      </div>

                      {/* Linked fields summary tags */}
                      <div className="pt-2 border-t border-slate-100">
                        <div className="text-[11px] font-bold text-slate-600 mb-2">
                          فیلدهای متصل به این نوع پروژه:
                        </div>
                        {linkedFields.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {linkedFields.map((lf) => (
                              <span
                                key={lf.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-semibold text-slate-800"
                              >
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>{lf.name}</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                            هیچ فیلدی به این نوع پروژه متصل نشده است.
                          </div>
                        )}
                      </div>
                    </div>

                    {canEditField && (
                      <button
                        type="button"
                        onClick={() => handleOpenEditType(pt)}
                        className="w-full py-2 rounded-xl border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100/70 text-indigo-700 text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>مدیریت و اتصال فیلدها</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================== MODAL: CREATE / EDIT DYNAMIC FIELD ===================== */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-800 my-6">
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

            <form onSubmit={handleSaveField} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    نام فیلد یا ویژگی *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثال: کارگردان پروژه، فیلمنامه، تعداد تصویربردار..."
                    className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    جایگاه در ساختار (زیرمجموعه کدام فیلد باشد؟)
                  </label>
                  <select
                    value={parentId || ''}
                    onChange={(e) => setParentId(e.target.value || null)}
                    className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2.5 text-xs sm:text-sm text-indigo-900 font-bold focus:outline-none focus:border-indigo-500 transition"
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
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  نوع فیلد
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {ALL_DYNAMIC_FIELD_TYPES.map((t) => {
                    const meta = FIELD_TYPE_META[t];
                    const active = fieldType === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => handleFieldTypeChange(t)}
                        className={`p-2 rounded-xl border text-xs font-bold flex flex-col items-center justify-center text-center gap-1 cursor-pointer transition min-h-[58px] ${
                          active
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {meta.icon}
                        <span className="text-[10.5px] leading-tight">{meta.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {(fieldType === 'select' || fieldType === 'multiselect') && (
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    گزینه‌های لیست {fieldType === 'multiselect' ? '(امکان انتخاب چند گزینه)' : '(تک‌انتخابی)'} — با ویرگول «،» یا خط جدید جدا کنید *
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

              {isEntityFieldType(fieldType) && (
                <div className="p-3.5 rounded-2xl bg-cyan-50/70 border border-cyan-200 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-bold text-cyan-950 flex items-center gap-1.5">
                      <Database className="w-4 h-4 text-cyan-700" />
                      <span>انتخاب موجودیت متصل *</span>
                    </label>
                    {canCreateField && (
                      <button
                        type="button"
                        onClick={handleOpenAddEntity}
                        className="text-[11px] font-bold text-cyan-700 hover:text-cyan-900 bg-white px-2.5 py-1 rounded-lg border border-cyan-300 cursor-pointer"
                      >
                        + ساخت موجودیت جدید
                      </button>
                    )}
                  </div>

                  {entities.length === 0 ? (
                    <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      هنوز موجودیتی تعریف نشده است. روی «+ ساخت موجودیت جدید» کلیک کنید تا موجودیت (مثلاً کارگردان) را بسازید.
                    </div>
                  ) : (
                    <select
                      value={selectedEntityId}
                      onChange={(e) => setSelectedEntityId(e.target.value)}
                      className="w-full rounded-xl bg-white border border-cyan-300 px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-cyan-600"
                      required
                    >
                      <option value="">انتخاب موجودیت...</option>
                      {entities.map((ent) => (
                        <option key={ent.id} value={ent.id}>
                          {ent.title} ({ent.fields.length} ویژگی · {ent.recordCount ?? ent.records?.length ?? 0} رکورد)
                        </option>
                      ))}
                    </select>
                  )}

                  <p className="text-[11px] text-cyan-800 leading-relaxed">
                    {fieldType === 'entity'
                      ? 'در فرم پروژه، فیلدهای این موجودیت به‌صورت ساختاریافته نمایش داده می‌شوند و کاربر می‌تواند مشخصات را مستقیماً وارد یا از رکوردهای موجود پر کند.'
                      : fieldType === 'entity_select'
                      ? 'در فرم پروژه، کاربر یک رکورد را از میان داده‌های ثبت‌شده برای این موجودیت انتخاب می‌کند.'
                      : 'در فرم پروژه، کاربر می‌تواند چند رکورد را هم‌زمان از میان داده‌های این موجودیت انتخاب کند.'}
                  </p>
                </div>
              )}

              {fieldType === 'checkbox' && (
                <label className="flex items-center gap-2.5 p-3 rounded-xl bg-teal-50/70 border border-teal-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={defaultValue === 'true'}
                    onChange={(e) => setDefaultValue(e.target.checked ? 'true' : 'false')}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-xs font-bold text-teal-900">مقدار پیش‌فرض چک‌باکس تیک‌خورده باشد</span>
                </label>
              )}

              {(fieldType === 'number' || fieldType === 'currency' || fieldType === 'text') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                      واحد سنجش (اختیاری)
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
                      placeholder={fieldType === 'number' ? '1' : fieldType === 'currency' ? '0' : ''}
                      className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 transition text-center shadow-2xs"
                    />
                  </div>
                </div>
              )}

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
                    <option value="اسناد و پیوست‌ها">اسناد و پیوست‌ها</option>
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

      {/* ===================== MODAL: CREATE / EDIT CUSTOM ENTITY SCHEMA ===================== */}
      {entityModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden text-slate-800 my-6">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-cyan-50/70">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Database className="w-5 h-5 text-cyan-700" />
                {editingEntity ? `ویرایش موجودیت «${editingEntity.title}»` : 'تعریف موجودیت سفارشی جدید'}
              </h3>
              <button
                type="button"
                onClick={() => setEntityModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {entityError && (
              <div className="m-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {entityError}
              </div>
            )}

            <form onSubmit={handleSaveEntity} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    عنوان موجودیت *
                  </label>
                  <input
                    type="text"
                    value={entityTitle}
                    onChange={(e) => setEntityTitle(e.target.value)}
                    placeholder="مثال: کارگردان، تدوینگر، پیمانکار..."
                    className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-cyan-600"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    توضیحات (اختیاری)
                  </label>
                  <input
                    type="text"
                    value={entityDescription}
                    onChange={(e) => setEntityDescription(e.target.value)}
                    placeholder="توضیح کوتاه درباره این موجودیت..."
                    className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-cyan-600"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-900">
                      فیلدها و ویژگی‌های تشکیل‌دهنده موجودیت
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      مثال برای کارگردان: نام، کد ملی، حقوق دریافتی
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addEntityFieldRow}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 text-cyan-800 text-xs font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>افزودن ویژگی</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {entityFieldsDraft.map((row, idx) => (
                    <div
                      key={row.key || idx}
                      className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                        <div className="sm:col-span-4">
                          <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                            عنوان فیلد *
                          </label>
                          <input
                            type="text"
                            value={row.label}
                            onChange={(e) => updateEntityFieldRow(idx, { label: e.target.value })}
                            placeholder="مثلاً: نام، کد ملی، حقوق دریافتی"
                            className="w-full rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-cyan-600"
                            required
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                            نوع فیلد
                          </label>
                          <select
                            value={row.fieldType}
                            onChange={(e) =>
                              updateEntityFieldRow(idx, { fieldType: e.target.value as EntityFieldType })
                            }
                            className="w-full rounded-lg bg-white border border-slate-300 px-2 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-cyan-600"
                          >
                            {(Object.keys(ENTITY_SUBFIELD_TYPE_LABELS) as EntityFieldType[]).map((et) => (
                              <option key={et} value={et}>
                                {ENTITY_SUBFIELD_TYPE_LABELS[et]}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                            واحد (اختیاری)
                          </label>
                          <input
                            type="text"
                            value={row.unit || ''}
                            onChange={(e) => updateEntityFieldRow(idx, { unit: e.target.value })}
                            placeholder="تومان..."
                            className="w-full rounded-lg bg-white border border-slate-300 px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-cyan-600"
                          />
                        </div>

                        <div className="sm:col-span-3 flex items-center justify-between gap-2 pt-3 sm:pt-4">
                          <label className="flex items-center gap-1 text-[11px] font-bold text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(row.required)}
                              onChange={(e) => updateEntityFieldRow(idx, { required: e.target.checked })}
                              className="w-3.5 h-3.5 rounded text-cyan-600"
                            />
                            <span>اجباری</span>
                          </label>

                          <button
                            type="button"
                            onClick={() => updateEntityFieldRow(idx, { isPrimaryDisplay: true })}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border cursor-pointer ${
                              row.isPrimaryDisplay
                                ? 'bg-amber-100 border-amber-300 text-amber-900'
                                : 'bg-white border-slate-200 text-slate-500 hover:bg-amber-50'
                            }`}
                            title="نمایش به عنوان عنوان اصلی رکورد در لیست‌های انتخاب"
                          >
                            <Star className={`w-3 h-3 ${row.isPrimaryDisplay ? 'fill-amber-500 text-amber-600' : ''}`} />
                            <span>اصلی</span>
                          </button>

                          {entityFieldsDraft.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeEntityFieldRow(idx)}
                              className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer"
                              title="حذف فیلد"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {(row.fieldType === 'select' || row.fieldType === 'multiselect') && (
                        <div>
                          <input
                            type="text"
                            value={row.optionsRaw || ''}
                            onChange={(e) => updateEntityFieldRow(idx, { optionsRaw: e.target.value })}
                            placeholder="گزینه‌ها را با ویرگول «،» جدا کنید..."
                            className="w-full rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-cyan-600"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEntityModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white hover:bg-slate-100 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={entitySaving}
                  className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-xs font-bold text-white shadow-md shadow-cyan-500/20 transition cursor-pointer disabled:opacity-50"
                >
                  {entitySaving
                    ? 'در حال ذخیره...'
                    : editingEntity
                    ? 'ذخیره تغییرات موجودیت'
                    : 'ثبت موجودیت جدید'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL: CREATE / EDIT ENTITY RECORD ===================== */}
      {recordModalOpen && recordTargetEntity && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden text-slate-800 my-6">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-cyan-50/70">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Database className="w-5 h-5 text-cyan-700" />
                {editingRecord
                  ? `ویرایش رکورد «${editingRecord.displayLabel}»`
                  : `افزودن رکورد جدید به «${recordTargetEntity.title}»`}
              </h3>
              <button
                type="button"
                onClick={() => setRecordModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {recordError && (
              <div className="m-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {recordError}
              </div>
            )}

            <form onSubmit={handleSaveRecord} className="p-5 space-y-3.5 max-h-[80vh] overflow-y-auto">
              {(recordTargetEntity.fields || []).map((ef) => {
                const val = recordFormData[ef.key];
                return (
                  <div key={ef.key}>
                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                      {ef.label}
                      {ef.required && <span className="text-rose-500 mr-1">*</span>}
                      {ef.unit && <span className="text-[10px] text-slate-500 mr-1.5">({ef.unit})</span>}
                    </label>

                    {ef.fieldType === 'checkbox' ? (
                      <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(val)}
                          onChange={(e) =>
                            setRecordFormData((prev) => ({ ...prev, [ef.key]: e.target.checked }))
                          }
                          className="w-4 h-4 rounded text-cyan-600"
                        />
                        <span className="text-xs font-semibold text-slate-700">بله / فعال</span>
                      </label>
                    ) : ef.fieldType === 'currency' ? (
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={formatCurrencyInput(String(val ?? ''))}
                          onChange={(e) =>
                            setRecordFormData((prev) => ({
                              ...prev,
                              [ef.key]: formatCurrencyInput(e.target.value),
                            }))
                          }
                          placeholder="0"
                          className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-cyan-600"
                          required={ef.required}
                        />
                        {String(val ?? '').replace(/\D/g, '') && (
                          <div className="text-[10px] text-amber-700 font-medium">
                            {formatBudgetDisplay(String(val))}
                          </div>
                        )}
                      </div>
                    ) : ef.fieldType === 'number' ? (
                      <input
                        type="number"
                        value={String(val ?? '')}
                        onChange={(e) =>
                          setRecordFormData((prev) => ({ ...prev, [ef.key]: e.target.value }))
                        }
                        className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-cyan-600"
                        required={ef.required}
                      />
                    ) : ef.fieldType === 'select' ? (
                      <select
                        value={String(val ?? '')}
                        onChange={(e) =>
                          setRecordFormData((prev) => ({ ...prev, [ef.key]: e.target.value }))
                        }
                        className="w-full rounded-xl bg-white border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-cyan-600"
                        required={ef.required}
                      >
                        <option value="">انتخاب کنید...</option>
                        {(ef.options || []).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : ef.fieldType === 'multiselect' ? (
                      <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                        {(ef.options || []).map((opt) => {
                          const arr: string[] = Array.isArray(val) ? val : [];
                          const checked = arr.includes(opt);
                          return (
                            <label
                              key={opt}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer ${
                                checked
                                  ? 'bg-cyan-600 text-white border-cyan-600 font-bold'
                                  : 'bg-white text-slate-700 border-slate-200'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const next = checked
                                    ? arr.filter((x) => x !== opt)
                                    : [...arr, opt];
                                  setRecordFormData((prev) => ({ ...prev, [ef.key]: next }));
                                }}
                                className="hidden"
                              />
                              <span>{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : ef.fieldType === 'file' ? (
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                        {(val as FieldFileValue)?.fileId ? (
                          <div className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200">
                            <button
                              type="button"
                              onClick={() => api.downloadFieldFile(val.fileId, val.fileName)}
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 hover:underline truncate cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{val.fileName}</span>
                              <span className="text-[10px] text-slate-400 shrink-0">
                                ({formatFileSize(val.fileSize)})
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setRecordFormData((prev) => ({ ...prev, [ef.key]: null }))
                              }
                              className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <label className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-dashed border-cyan-300 bg-white hover:bg-cyan-50/50 text-xs font-bold text-cyan-800 cursor-pointer">
                            <Upload className="w-3.5 h-3.5" />
                            <span>
                              {uploadingAttrKey === ef.key ? 'در حال آپلود...' : 'انتخاب و آپلود فایل'}
                            </span>
                            <input
                              type="file"
                              className="hidden"
                              disabled={uploadingAttrKey === ef.key}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleRecordFileUpload(ef.key, file);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        )}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={String(val ?? '')}
                        onChange={(e) =>
                          setRecordFormData((prev) => ({ ...prev, [ef.key]: e.target.value }))
                        }
                        className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-cyan-600"
                        required={ef.required}
                      />
                    )}
                  </div>
                );
              })}

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRecordModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white hover:bg-slate-100 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={recordSaving || Boolean(uploadingAttrKey)}
                  className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-xs font-bold text-white shadow-md shadow-cyan-500/20 transition cursor-pointer disabled:opacity-50"
                >
                  {recordSaving ? 'در حال ذخیره...' : editingRecord ? 'ذخیره تغییرات' : 'ثبت رکورد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL: CREATE / EDIT PROJECT TYPE & LINK FIELDS ===================== */}
      {typeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-800 my-6">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/80">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FolderKanban className="w-5 h-5 text-indigo-600" />
                {editingType ? `ویرایش نوع پروژه «${editingType.title}»` : 'تعریف نوع پروژه و اتصال فیلدها'}
              </h3>
              <button
                onClick={() => setTypeModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {typeError && (
              <div className="m-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {typeError}
              </div>
            )}

            <form onSubmit={handleSaveProjectType} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    عنوان نوع پروژه *
                  </label>
                  <input
                    type="text"
                    value={typeTitle}
                    onChange={(e) => setTypeTitle(e.target.value)}
                    placeholder="مثال: مستند، برنامه استودیویی، تولید نمایشی..."
                    className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    گردش کار پیش‌فرض (اختیاری)
                  </label>
                  <select
                    value={typeDefaultWorkflowId}
                    onChange={(e) => setTypeDefaultWorkflowId(e.target.value)}
                    className="w-full rounded-xl bg-white border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">انتخاب خودکار پیش‌فرض سامانه</option>
                    {workflows.map((wf) => (
                      <option key={wf.id} value={wf.id}>
                        {wf.title} ({wf.steps.length} مرحله)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    توضیحات (اختیاری)
                  </label>
                  <input
                    type="text"
                    value={typeDescription}
                    onChange={(e) => setTypeDescription(e.target.value)}
                    placeholder="توضیح مختصر درباره این نوع پروژه..."
                    className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <label className="flex items-center gap-2 h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer sm:mt-5">
                  <input
                    type="checkbox"
                    checked={typeIsActive}
                    onChange={(e) => setTypeIsActive(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-bold text-slate-700">فعال در فرم ثبت پروژه</span>
                </label>
              </div>

              {/* Field Tree Picker */}
              <div className="pt-3 border-t border-slate-200 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-extrabold text-slate-900">
                      انتخاب فیلدهای پویای متصل به این نوع پروژه:
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 tabular-nums">
                      {selectedFieldIds.length} فیلد انتخاب شده
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedFieldIds(fields.map((f) => f.id))}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-[11px] font-bold cursor-pointer transition"
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span>انتخاب همه</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedFieldIds([])}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 text-[11px] font-bold cursor-pointer transition"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>پاک کردن</span>
                    </button>
                  </div>
                </div>

                {fieldTree.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                    هنوز فیلد پویایی تعریف نشده است. ابتدا در تب «فیلدهای پویا» فیلدها را تعریف کنید.
                  </div>
                ) : (
                  <div className="p-3 rounded-2xl bg-slate-50/70 border border-slate-200 max-h-64 overflow-y-auto space-y-2">
                    {fieldTree.map((fld) => renderFieldChecklistNode(fld, 0))}
                  </div>
                )}
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setTypeModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white hover:bg-slate-100 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={typeSaving}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer disabled:opacity-50"
                >
                  {typeSaving
                    ? 'در حال ذخیره...'
                    : editingType
                    ? 'ذخیره تغییرات نوع پروژه'
                    : 'ثبت نوع پروژه و فیلدهای متصل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
