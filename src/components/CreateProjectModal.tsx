import React, { useState, useRef, useEffect } from 'react';
import {
  DynamicField,
  ProjectType,
  CustomEntity,
  CustomEntityRecord,
  FieldFileValue,
  Project,
  ProjectAttachment,
  Workflow,
  UploadProgressInfo,
  User,
} from '../types';
import { api, formatFileSize } from '../services/api';
import { ProjectAttachments } from './ProjectAttachments';
import { PersianDatePicker } from './PersianDatePicker';
import {
  formatCurrencyInput,
  formatBudgetDisplay,
  getTodayJalali,
  getDefaultEvaluationDeadlineJalali,
  getDefaultDeliveryDateJalali,
} from '../utils/formatters';
import { hasPerm } from '../utils/permissions';
import {
  X,
  Coins,
  FileText,
  Minus,
  Plus,
  Layers,
  Users,
  CheckCircle2,
  Paperclip,
  Upload,
  Trash2,
  File,
  GitBranch,
  RefreshCw,
  FolderKanban,
  Database,
  Download,
  Check,
} from 'lucide-react';

interface CreateProjectModalProps {
  dynamicFields: DynamicField[];
  projectTypes?: ProjectType[];
  entities?: CustomEntity[];
  onEntitiesUpdated?: () => void;
  currentUser?: User | null;
  onClose: () => void;
  onSuccess: () => void;
  editProject?: Project | null;
  workflows?: Workflow[];
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  dynamicFields,
  projectTypes = [],
  entities = [],
  onEntitiesUpdated,
  currentUser,
  onClose,
  onSuccess,
  editProject,
  workflows = [],
}) => {
  const [availableEntities, setAvailableEntities] = useState<CustomEntity[]>(entities);
  useEffect(() => {
    setAvailableEntities(entities);
  }, [entities]);
  useEffect(() => {
    if (entities.length === 0) {
      api.getEntities().then((ents) => {
        if (ents.length > 0) setAvailableEntities(ents);
      }).catch(() => {});
    }
  }, []);
  const [title, setTitle] = useState(editProject?.title || '');
  const [code, setCode] = useState(
    editProject?.code || `PRJ-${getTodayJalali().year}-${Math.floor(10 + Math.random() * 90)}`
  );
  const [availableProjectTypes, setAvailableProjectTypes] = useState<ProjectType[]>(projectTypes);
  const activeProjectTypes = availableProjectTypes.filter((pt) => pt.isActive !== 0 && pt.isActive !== false);

  const [selectedProjectTypeId, setSelectedProjectTypeId] = useState<string>(() => {
    if (editProject?.projectTypeId) return editProject.projectTypeId;
    if (editProject?.productionType) {
      const matched = activeProjectTypes.find((pt) => pt.title === editProject.productionType);
      return matched ? matched.id : '__CUSTOM__';
    }
    return activeProjectTypes[0]?.id || '__CUSTOM__';
  });

  const [productionType, setProductionType] = useState(() => {
    if (editProject?.productionType) return editProject.productionType;
    return activeProjectTypes[0]?.title || 'طرح عمومی شورا';
  });
  const [deadline, setDeadline] = useState(() =>
    editProject ? editProject.deadline || '' : getDefaultEvaluationDeadlineJalali()
  );
  const [deliveryDate, setDeliveryDate] = useState(() =>
    editProject ? editProject.deliveryDate || '' : getDefaultDeliveryDateJalali()
  );
  const [budgetEstimated, setBudgetEstimated] = useState(
    formatCurrencyInput(editProject?.budgetEstimated || '')
  );
  const [description, setDescription] = useState(editProject?.description || '');
  const [manualStatus, setManualStatus] = useState<'IN_REVIEW' | 'APPROVED' | 'NEEDS_REVISION' | 'REJECTED'>(
    editProject?.status || 'IN_REVIEW'
  );
  const canManualApprove = hasPerm(currentUser, 'projects.manual_approve');
  
  const findPreferredWorkflowId = (wfs: Workflow[], ptId?: string | null): string => {
    if (ptId && ptId !== '__CUSTOM__') {
      const pt = activeProjectTypes.find((p) => p.id === ptId);
      if (pt?.defaultWorkflowId && wfs.some((w) => w.id === pt.defaultWorkflowId)) {
        return pt.defaultWorkflowId;
      }
    }
    const createdMatches = wfs.filter((w) => w.diagram?.startTrigger?.event === 'PROJECT_CREATED');
    if (createdMatches.length > 0) {
      const scored = createdMatches.find((w) => {
        const trig = w.diagram?.startTrigger;
        const ptMatch = !trig?.projectTypeId || trig.projectTypeId === ptId;
        const posMatch =
          !trig?.creatorPositionId ||
          trig.creatorPositionId === currentUser?.positionId;
        return ptMatch && posMatch;
      });
      if (scored) return scored.id;
    }
    const def = wfs.find((w) => w.isDefault);
    return def?.id || wfs[0]?.id || '';
  };

  // Workflow selector state
  const [availableWorkflows, setAvailableWorkflows] = useState<Workflow[]>(workflows);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(() => {
    if (editProject?.workflowId) return editProject.workflowId;
    return findPreferredWorkflowId(workflows, selectedProjectTypeId);
  });

  useEffect(() => {
    if (projectTypes.length === 0) {
      api.getProjectTypes().then((pts) => {
        setAvailableProjectTypes(pts);
        const actives = pts.filter((pt) => pt.isActive !== 0 && pt.isActive !== false);
        if (!editProject && actives.length > 0 && selectedProjectTypeId === '__CUSTOM__') {
          setSelectedProjectTypeId(actives[0].id);
          setProductionType(actives[0].title);
          if (actives[0].defaultWorkflowId) {
            setSelectedWorkflowId(actives[0].defaultWorkflowId);
          }
        }
      }).catch(() => {});
    } else {
      setAvailableProjectTypes(projectTypes);
    }
  }, [projectTypes]);

  useEffect(() => {
    if (workflows.length === 0) {
      api.getWorkflows().then((wfs) => {
        setAvailableWorkflows(wfs);
        if (!selectedWorkflowId) {
          setSelectedWorkflowId(
            editProject?.workflowId || findPreferredWorkflowId(wfs, selectedProjectTypeId)
          );
        }
      }).catch(console.error);
    } else {
      setAvailableWorkflows(workflows);
      if (!selectedWorkflowId) {
        setSelectedWorkflowId(
          editProject?.workflowId || findPreferredWorkflowId(workflows, selectedProjectTypeId)
        );
      }
    }
  }, [workflows, editProject?.workflowId]);

  const selectedProjectType = activeProjectTypes.find((pt) => pt.id === selectedProjectTypeId) || null;
  const displayedDynamicFields = selectedProjectType
    ? dynamicFields.filter((f) => (selectedProjectType.fieldIds || []).includes(f.id))
    : dynamicFields;

  const handleSelectProjectType = (nextTypeId: string) => {
    setSelectedProjectTypeId(nextTypeId);
    if (nextTypeId === '__CUSTOM__') {
      return;
    }
    const found = activeProjectTypes.find((pt) => pt.id === nextTypeId);
    if (found) {
      setProductionType(found.title);
      if (!editProject) {
        if (found.defaultWorkflowId && availableWorkflows.some((w) => w.id === found.defaultWorkflowId)) {
          setSelectedWorkflowId(found.defaultWorkflowId);
        } else {
          const preferred = findPreferredWorkflowId(availableWorkflows, nextTypeId);
          if (preferred) setSelectedWorkflowId(preferred);
        }
      }
    }
  };

  // Initialize requirements from dynamic fields or existing project
  const [requirements, setRequirements] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {};
    for (const f of dynamicFields) {
      let defVal: any;
      if (f.fieldType === 'checkbox') {
        defVal = f.defaultValue === 'true';
      } else if (f.fieldType === 'multiselect' || f.fieldType === 'entity_multiselect') {
        defVal = [];
      } else if (f.fieldType === 'file' || f.fieldType === 'entity_select') {
        defVal = null;
      } else if (f.fieldType === 'entity') {
        defVal = {};
      } else {
        defVal =
          f.defaultValue !== undefined && f.defaultValue !== null && f.defaultValue !== ''
            ? String(f.defaultValue)
            : f.fieldType === 'currency'
            ? '0'
            : f.fieldType === 'text' || f.fieldType === 'select'
            ? ''
            : '1';
      }
      initial[f.key] =
        editProject?.requirements && editProject.requirements[f.key] !== undefined
          ? editProject.requirements[f.key]
          : defVal;
    }
    if (editProject?.requirements) {
      return { ...initial, ...editProject.requirements };
    }
    return initial;
  });

  // Field-level file upload & quick entity record creation state
  const [uploadingFieldKey, setUploadingFieldKey] = useState<string | null>(null);
  const [quickRecordState, setQuickRecordState] = useState<{
    fieldKey: string;
    fieldMode: 'entity_select' | 'entity_multiselect';
    entity: CustomEntity;
    data: Record<string, any>;
    saving: boolean;
    error: string;
  } | null>(null);
  const [quickRecordUploadingAttr, setQuickRecordUploadingAttr] = useState<string | null>(null);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<ProjectAttachment[]>(
    editProject?.attachments || []
  );
  const newFileInputRef = useRef<HTMLInputElement>(null);

  const fetchAttachments = async () => {
    if (editProject?.id) {
      try {
        const atts = await api.getProjectAttachments(editProject.id);
        setExistingAttachments(atts);
      } catch (e) {}
    }
  };

  const [maxFileSizeMb, setMaxFileSizeMb] = useState<number>(1024);
  const [uploadStatusText, setUploadStatusText] = useState<string | null>(null);
  const [activeUploadProgress, setActiveUploadProgress] = useState<UploadProgressInfo | null>(null);
  const [uploadingFileIndex, setUploadingFileIndex] = useState<number>(0);
  const [uploadingFileName, setUploadingFileName] = useState<string>('');

  useEffect(() => {
    fetchAttachments();
    api.getSettings().then((res) => {
      if (res?.settings?.max_file_size_mb) {
        const val = parseInt(res.settings.max_file_size_mb, 10);
        if (!isNaN(val) && val > 0) setMaxFileSizeMb(val);
      }
    }).catch(() => {});
  }, [editProject?.id]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const formatMaxLimitDisplay = () => {
    if (maxFileSizeMb >= 1024) {
      return `${(maxFileSizeMb / 1024).toFixed(maxFileSizeMb % 1024 === 0 ? 0 : 1)} گیگابایت`;
    }
    return `${maxFileSizeMb} مگابایت`;
  };

  const handleRequirementChange = (key: string, value: any) => {
    setRequirements((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleFieldFileUpload = async (fieldKey: string, file: File, subAttrKey?: string) => {
    const tokenKey = subAttrKey ? `${fieldKey}::${subAttrKey}` : fieldKey;
    setUploadingFieldKey(tokenKey);
    setError('');
    try {
      const uploaded: FieldFileValue = await api.uploadFieldFileStream(file);
      if (subAttrKey) {
        setRequirements((prev) => ({
          ...prev,
          [fieldKey]: {
            ...(typeof prev[fieldKey] === 'object' && prev[fieldKey] ? prev[fieldKey] : {}),
            [subAttrKey]: uploaded,
          },
        }));
      } else {
        handleRequirementChange(fieldKey, uploaded);
      }
    } catch (err: any) {
      setError(err.message || 'خطا در آپلود فایل فیلد');
    } finally {
      setUploadingFieldKey(null);
    }
  };

  const openQuickEntityRecordModal = (
    fieldKey: string,
    fieldMode: 'entity_select' | 'entity_multiselect',
    entity: CustomEntity
  ) => {
    const initial: Record<string, any> = {};
    for (const ef of entity.fields || []) {
      initial[ef.key] =
        ef.fieldType === 'checkbox'
          ? false
          : ef.fieldType === 'multiselect'
          ? []
          : ef.fieldType === 'file'
          ? null
          : '';
    }
    setQuickRecordState({
      fieldKey,
      fieldMode,
      entity,
      data: initial,
      saving: false,
      error: '',
    });
  };

  const handleSaveQuickEntityRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickRecordState) return;
    setQuickRecordState((prev) => (prev ? { ...prev, saving: true, error: '' } : prev));
    try {
      const created = await api.createEntityRecord(quickRecordState.entity.id, quickRecordState.data);
      const updatedEntities = await api.getEntities().catch(() => null);
      if (updatedEntities) setAvailableEntities(updatedEntities);
      if (onEntitiesUpdated) onEntitiesUpdated();

      const snapshot = {
        recordId: created.id,
        displayLabel: created.displayLabel,
        data: created.data,
        entityId: quickRecordState.entity.id,
        entityTitle: quickRecordState.entity.title,
      };
      if (quickRecordState.fieldMode === 'entity_select') {
        handleRequirementChange(quickRecordState.fieldKey, snapshot);
      } else {
        const curArr = Array.isArray(requirements[quickRecordState.fieldKey])
          ? requirements[quickRecordState.fieldKey]
          : [];
        handleRequirementChange(quickRecordState.fieldKey, [...curArr, snapshot]);
      }
      setQuickRecordState(null);
    } catch (err: any) {
      setQuickRecordState((prev) =>
        prev ? { ...prev, saving: false, error: err.message || 'خطا در ثبت رکورد' } : prev
      );
    }
  };

  const handleIncrement = (key: string) => {
    const current = parseInt(requirements[key] || '0', 10);
    handleRequirementChange(key, String(current + 1));
  };

  const handleDecrement = (key: string) => {
    const current = parseInt(requirements[key] || '0', 10);
    if (current > 0) {
      handleRequirementChange(key, String(current - 1));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      const maxBytes = maxFileSizeMb * 1024 * 1024;
      const validFiles = filesArray.filter((f) => {
        if (f.size > maxBytes) {
          const fileMb = (f.size / (1024 * 1024)).toFixed(1);
          alert(`فایل «${f.name}» با حجم ${fileMb}MB بیش از سقف مجاز سیستم (${formatMaxLimitDisplay()}) است و نادیده گرفته شد.`);
          return false;
        }
        return true;
      });
      setSelectedFiles((prev) => [...prev, ...validFiles]);
    }
    if (newFileInputRef.current) newFileInputRef.current.value = '';
  };

  const handleRemoveSelectedFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('نام پروژه الزامی است.');
      return;
    }

    // Validate required dynamic fields
    for (const f of displayedDynamicFields) {
      if (!f.required) continue;
      const val = requirements[f.key];
      if (f.fieldType === 'file') {
        if (!val || !val.fileId) {
          setError(`آپلود فایل برای فیلد الزامی «${f.name}» ضروری است.`);
          return;
        }
      } else if (f.fieldType === 'checkbox') {
        if (val !== true) {
          setError(`تایید/انتخاب چک‌باکس «${f.name}» الزامی است.`);
          return;
        }
      } else if (f.fieldType === 'multiselect' || f.fieldType === 'entity_multiselect') {
        if (!Array.isArray(val) || val.length === 0) {
          setError(`انتخاب حداقل یک مورد برای فیلد «${f.name}» الزامی است.`);
          return;
        }
      } else if (f.fieldType === 'entity_select') {
        if (!val || !val.recordId) {
          setError(`انتخاب یک رکورد برای فیلد «${f.name}» الزامی است.`);
          return;
        }
      } else if (f.fieldType === 'entity') {
        const ent = availableEntities.find((en) => en.id === f.entityId);
        const obj = val && typeof val === 'object' ? val : {};
        if (ent) {
          for (const ef of ent.fields || []) {
            if (ef.required) {
              const sv = obj[ef.key];
              const missing =
                sv === undefined ||
                sv === null ||
                sv === '' ||
                (Array.isArray(sv) && sv.length === 0) ||
                (ef.fieldType === 'file' && !sv?.fileId);
              if (missing) {
                setError(`تکمیل «${ef.label}» در بخش «${f.name}» الزامی است.`);
                return;
              }
            }
          }
        }
      } else {
        if (val === undefined || val === null || String(val).trim() === '') {
          setError(`تکمیل فیلد الزامی «${f.name}» ضروری است.`);
          return;
        }
      }
    }

    setLoading(true);
    setError('');
    setUploadStatusText(null);
    setActiveUploadProgress(null);

    try {
      const visibleKeys = new Set(displayedDynamicFields.map((f) => f.key));
      const allKnownKeys = new Set(dynamicFields.map((f) => f.key));
      const filteredRequirements: Record<string, any> = {};
      for (const [k, v] of Object.entries(requirements)) {
        if (visibleKeys.has(k) || (editProject && !allKnownKeys.has(k))) {
          filteredRequirements[k] = v;
        }
      }

      const payload: Partial<Project> = {
        title: title.trim(),
        code: code.trim(),
        projectTypeId: selectedProjectType ? selectedProjectType.id : null,
        productionType: selectedProjectType
          ? selectedProjectType.title
          : (productionType.trim() || 'طرح عمومی شورا'),
        location: editProject?.location || '',
        deadline: deadline.trim(),
        deliveryDate: deliveryDate.trim(),
        budgetEstimated: budgetEstimated.trim(),
        description: description.trim(),
        requirements: filteredRequirements,
        workflowId: selectedWorkflowId || undefined,
      };

      if (editProject && canManualApprove) {
        payload.status = manualStatus;
      }

      let targetProjectId = editProject?.id;
      if (editProject) {
        await api.updateProject(editProject.id, payload);
      } else {
        const res = await api.createProject(payload);
        targetProjectId = (res as any)?.projectId;
      }

      // Upload any chosen files for the project with direct streaming and real-time progress
      if (targetProjectId && selectedFiles.length > 0) {
        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];
          setUploadingFileIndex(i + 1);
          setUploadingFileName(file.name);
          setActiveUploadProgress({ percent: 0, loaded: 0, total: file.size, speed: 0 });
          setUploadStatusText(`در حال ارسال فایل (${i + 1}/${selectedFiles.length}): ${file.name}`);
          
          await api.uploadProjectAttachmentStream(targetProjectId, file, (progress) => {
            setActiveUploadProgress(progress);
          });
        }
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'خطا در ثبت پروژه');
    } finally {
      setLoading(false);
      setUploadStatusText(null);
      setActiveUploadProgress(null);
      setUploadingFileIndex(0);
      setUploadingFileName('');
    }
  };

  const selectedWf = availableWorkflows.find((w) => w.id === selectedWorkflowId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-900/50 backdrop-blur-xs">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl bg-white border border-slate-200/90 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-800">
        
        {/* Modal Header (Fixed at top) */}
        <div className="shrink-0 flex items-center justify-between px-5 sm:px-6 py-3.5 border-b border-slate-100 bg-slate-50/90">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200/60 flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                {editProject ? 'ویرایش مشخصات پروژه' : 'ثبت پروژه جدید در شورا'}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                طرح پس از ثبت مستقیماً در کارتابل ارزیابی تمامی اعضای شورا قرار می‌گیرد.
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

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          
          {/* Scrollable Form Body */}
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 sm:py-5 space-y-5">
            
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {error}
              </div>
            )}

            {/* General Project Info - Responsive 3-column Grid on Desktop */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              
              {/* Title */}
              <div className="md:col-span-2 lg:col-span-2">
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  نام و عنوان پروژه *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="عنوان کامل طرح یا پروژه..."
                  className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
                  required
                />
              </div>

              {/* Code */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  کد رهگیری پروژه
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="PRJ-1403-01"
                  className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition font-mono shadow-2xs text-left"
                  dir="ltr"
                />
              </div>

              {/* Project Type Selector / Subject */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <FolderKanban className="w-3.5 h-3.5 text-indigo-600" />
                  <span>نوع پروژه *</span>
                </label>
                {activeProjectTypes.length > 0 ? (
                  <div className="space-y-2">
                    <select
                      value={selectedProjectTypeId}
                      onChange={(e) => handleSelectProjectType(e.target.value)}
                      className="w-full rounded-xl bg-white border border-slate-300 px-3 py-2 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs cursor-pointer"
                    >
                      {activeProjectTypes.map((pt) => (
                        <option key={pt.id} value={pt.id}>
                          {pt.title} ({(pt.fieldIds || []).length} فیلد متصل)
                        </option>
                      ))}
                      <option value="__CUSTOM__">سایر / عنوان دلخواه (همه فیلدها)</option>
                    </select>
                    {selectedProjectTypeId === '__CUSTOM__' && (
                      <input
                        type="text"
                        value={productionType}
                        onChange={(e) => setProductionType(e.target.value)}
                        placeholder="عنوان نوع یا زمینه طرح..."
                        className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 transition shadow-2xs"
                      />
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={productionType}
                    onChange={(e) => setProductionType(e.target.value)}
                    placeholder="نوع تولید (مستند، استودیویی، داستانی...)"
                    className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
                  />
                )}
              </div>

              {/* Deadline - Persian Jalali Date Picker */}
              <div>
                <PersianDatePicker
                  value={deadline}
                  onChange={setDeadline}
                  label="مهلت ارزیابی و رای‌گیری"
                  placeholder="انتخاب تاریخ شمسی..."
                />
              </div>

              {/* Estimated Delivery Date - Persian Jalali Date Picker */}
              <div>
                <PersianDatePicker
                  value={deliveryDate}
                  onChange={setDeliveryDate}
                  label="تاریخ حدودی تحویل پروژه"
                  placeholder="انتخاب تاریخ شمسی تحویل..."
                />
              </div>

              {/* Budget */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5 text-slate-500" />
                    <span>برآورد بودجه پیشنهادی</span>
                  </span>
                  {budgetEstimated && (
                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                      {formatBudgetDisplay(budgetEstimated)}
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={budgetEstimated}
                    onChange={(e) => setBudgetEstimated(formatCurrencyInput(e.target.value))}
                    placeholder="۱۵۰٬۰۰۰٬۰۰۰"
                    className="w-full rounded-xl bg-white border border-slate-300 pr-3.5 pl-14 py-2 text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs text-right"
                    dir="rtl"
                  />
                  <span className="absolute left-3 top-2 text-[11px] font-bold text-slate-400 pointer-events-none select-none bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200/80">
                    تومان
                  </span>
                </div>
              </div>

              {/* Description */}
              <div className="md:col-span-2 lg:col-span-3">
                <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-500" />
                    <span>خلاصه شرح و اهداف پروژه</span>
                  </span>
                  <span className="text-[10px] text-slate-400">
                    خطوط بعدی و فاصله‌ها در نمایش حفظ می‌شوند
                  </span>
                </label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="خلاصه شرح، محورهای محتوایی و مشخصات کلی طرح را وارد فرمایید..."
                  className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs leading-relaxed whitespace-pre-wrap"
                />
              </div>

              {/* Workflow Selection Section */}
              {availableWorkflows.length > 0 && (
                <div className="md:col-span-2 lg:col-span-3 p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-100 shadow-2xs space-y-2.5">
                  <label className="block text-xs font-bold text-slate-800 flex items-center justify-between flex-wrap gap-2">
                    <span className="flex items-center gap-1.5 text-indigo-900">
                      <GitBranch className="w-4 h-4 text-indigo-600" />
                      <span>گردش کار سازمانی و ساختار مربوطه برای این پروژه *</span>
                    </span>
                    {selectedWf && (
                      <span className="text-[11px] font-bold text-indigo-700 bg-white border border-indigo-200 px-2.5 py-0.5 rounded-lg shadow-2xs tabular-nums">
                        تعداد مراحل گردش: {selectedWf.steps.length} مرحله
                      </span>
                    )}
                  </label>

                  <select
                    value={selectedWorkflowId}
                    onChange={(e) => setSelectedWorkflowId(e.target.value)}
                    className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs cursor-pointer"
                  >
                    {availableWorkflows.map((wf) => {
                      const trigEvent = wf.diagram?.startTrigger?.event;
                      const trigText =
                        trigEvent === 'PROJECT_CREATED'
                          ? ' · شروع با ثبت پروژه'
                          : trigEvent === 'PROJECT_APPROVED'
                          ? ' · زنجیره‌ای پس از تایید'
                          : '';
                      return (
                        <option key={wf.id} value={wf.id}>
                          {wf.title} {wf.isDefault ? '★ (پیش‌فرض سیستم)' : ''} — ({wf.steps.length} مرحله{trigText})
                        </option>
                      );
                    })}
                  </select>

                  {selectedWf && (
                    <div className="pt-2 border-t border-indigo-100 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Users className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span className="text-slate-500">مسیر گردش بین مراحل:</span>
                        <span className="font-semibold text-slate-800" dir="rtl">
                          {selectedWf.steps
                            .map((s) => {
                              const posLabel =
                                s.config?.assigneeMode === 'CREATOR'
                                  ? 'ثبت‌کننده اولیه پروژه'
                                  : s.positions && s.positions.length > 0
                                  ? s.positions.map((p) => p.title).join(' + ')
                                  : s.positionTitle;
                              return posLabel ? `${s.title} (${posLabel})` : s.title;
                            })
                            .join(' ← ')}
                        </span>
                      </div>
                    </div>
                  )}

                  {editProject && (
                    <div className="pt-2 border-t border-indigo-100">
                      {canManualApprove ? (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="text-[11px] font-bold text-slate-700">
                            وضعیت دستی پروژه (با مجوز ویژه تایید دستی):
                          </label>
                          <select
                            value={manualStatus}
                            onChange={(e) => setManualStatus(e.target.value as any)}
                            className="rounded-xl bg-white border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500 cursor-pointer"
                          >
                            <option value="IN_REVIEW">در حال بررسی در گردش کار</option>
                            <option value="NEEDS_REVISION">نیازمند اصلاح</option>
                            <option value="REJECTED">رد شده</option>
                            <option value="APPROVED">تایید نهایی دستی (خارج از گردش کار)</option>
                          </select>
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-500">
                          تایید نهایی این پروژه فقط از طریق تکمیل مراحل گردش کار انجام می‌شود.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Dynamic Requirements Fields Section (Filtered by Selected Project Type) */}
            {dynamicFields.length > 0 && (() => {
              const validFieldIds = new Set(displayedDynamicFields.map((f) => f.id));
              const buildFieldTree = (pId: string | null): DynamicField[] =>
                displayedDynamicFields
                  .filter((f) => {
                    const effParent = f.parentId && validFieldIds.has(f.parentId) ? f.parentId : null;
                    return effParent === pId;
                  })
                  .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
                  .map((f) => ({ ...f, children: buildFieldTree(f.id) }));

              const rootFields = buildFieldTree(null);

              const renderFieldInput = (field: DynamicField) => {
                const rawVal = requirements[field.key];

                if (field.fieldType === 'currency') {
                  return (
                    <div className="space-y-1">
                      <div className="relative flex items-center bg-white border border-slate-200/90 rounded-xl px-2.5 py-1.5 shadow-2xs focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/10">
                        <input
                          type="text"
                          value={formatCurrencyInput(String(rawVal ?? ''))}
                          onChange={(e) => handleRequirementChange(field.key, formatCurrencyInput(e.target.value))}
                          placeholder="0"
                          className="w-full text-center font-bold text-xs sm:text-sm bg-transparent text-slate-900 focus:outline-none"
                        />
                        {field.unit && (
                          <span className="text-[10px] text-slate-400 shrink-0 mr-1">{field.unit}</span>
                        )}
                      </div>
                      {String(rawVal ?? '').replace(/\D/g, '') !== '' && String(rawVal) !== '0' && (
                        <div className="text-[10px] text-amber-700 font-medium truncate text-center">
                          {formatBudgetDisplay(String(rawVal))}
                        </div>
                      )}
                    </div>
                  );
                }

                if (field.fieldType === 'checkbox') {
                  const checked = rawVal === true || rawVal === 'true';
                  return (
                    <label
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border cursor-pointer transition ${
                        checked
                          ? 'bg-teal-50 border-teal-300 text-teal-900'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-xs font-bold">{checked ? 'بله (فعال)' : 'خیر'}</span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => handleRequirementChange(field.key, e.target.checked)}
                        className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                      />
                    </label>
                  );
                }

                if (field.fieldType === 'file') {
                  const fileVal = rawVal as FieldFileValue | null;
                  const isUploadingThis = uploadingFieldKey === field.key;
                  return (
                    <div className="space-y-1.5">
                      {fileVal?.fileId ? (
                        <div className="flex items-center justify-between gap-1.5 px-2.5 py-2 rounded-xl bg-sky-50 border border-sky-200">
                          <button
                            type="button"
                            onClick={() => api.downloadFieldFile(fileVal.fileId, fileVal.fileName)}
                            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-sky-800 hover:underline truncate cursor-pointer min-w-0"
                            title={fileVal.fileName}
                          >
                            <Download className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{fileVal.fileName}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRequirementChange(field.key, null)}
                            className="p-1 rounded-lg text-rose-500 hover:bg-rose-100 shrink-0 cursor-pointer"
                            title="حذف فایل"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-sky-300 bg-white hover:bg-sky-50/70 text-xs font-bold text-sky-700 cursor-pointer transition">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{isUploadingThis ? 'در حال آپلود...' : 'انتخاب و آپلود فایل'}</span>
                          <input
                            type="file"
                            className="hidden"
                            disabled={isUploadingThis}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFieldFileUpload(field.key, file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      )}
                    </div>
                  );
                }

                if (field.fieldType === 'select') {
                  let opts: string[] = [];
                  try {
                    const parsed = JSON.parse(field.optionsJson || '[]');
                    if (Array.isArray(parsed)) opts = parsed;
                  } catch {}
                  return (
                    <select
                      value={String(rawVal ?? '')}
                      onChange={(e) => handleRequirementChange(field.key, e.target.value)}
                      className="w-full rounded-xl bg-white border border-slate-200/90 px-2.5 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 shadow-2xs"
                    >
                      <option value="">انتخاب کنید...</option>
                      {opts.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  );
                }

                if (field.fieldType === 'multiselect') {
                  let opts: string[] = [];
                  try {
                    const parsed = JSON.parse(field.optionsJson || '[]');
                    if (Array.isArray(parsed)) opts = parsed;
                  } catch {}
                  const selectedArr: string[] = Array.isArray(rawVal) ? rawVal : [];
                  return (
                    <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-white border border-slate-200/90 max-h-32 overflow-y-auto">
                      {opts.length === 0 ? (
                        <span className="text-[11px] text-slate-400">گزینه‌ای تعریف نشده</span>
                      ) : (
                        opts.map((opt) => {
                          const checked = selectedArr.includes(opt);
                          return (
                            <label
                              key={opt}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition ${
                                checked
                                  ? 'bg-purple-600 text-white border-purple-600'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-purple-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const next = checked
                                    ? selectedArr.filter((x) => x !== opt)
                                    : [...selectedArr, opt];
                                  handleRequirementChange(field.key, next);
                                }}
                                className="hidden"
                              />
                              {checked && <Check className="w-3 h-3" />}
                              <span>{opt}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  );
                }

                if (field.fieldType === 'entity') {
                  const entity = availableEntities.find((en) => en.id === field.entityId);
                  if (!entity) {
                    return (
                      <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-2">
                        موجودیت متصل یافت نشد.
                      </div>
                    );
                  }
                  const objVal: Record<string, any> =
                    rawVal && typeof rawVal === 'object' ? rawVal : {};
                  const setSubVal = (attrKey: string, val: any) => {
                    handleRequirementChange(field.key, {
                      ...objVal,
                      _entityId: entity.id,
                      _entityTitle: entity.title,
                      [attrKey]: val,
                    });
                  };
                  const recs = entity.records || [];

                  return (
                    <div className="space-y-2.5">
                      {recs.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <select
                            value=""
                            onChange={(e) => {
                              const rec = recs.find((r) => r.id === e.target.value);
                              if (rec) {
                                handleRequirementChange(field.key, {
                                  ...rec.data,
                                  _entityId: entity.id,
                                  _entityTitle: entity.title,
                                  _sourceRecordId: rec.id,
                                });
                              }
                            }}
                            className="rounded-lg bg-cyan-50 border border-cyan-200 px-2.5 py-1 text-[11px] font-bold text-cyan-900 focus:outline-none"
                          >
                            <option value="">پر کردن سریع از رکوردهای «{entity.title}»...</option>
                            {recs.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.displayLabel}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {(entity.fields || []).map((ef) => {
                          const sv = objVal[ef.key];
                          const uploadToken = `${field.key}::${ef.key}`;
                          return (
                            <div
                              key={ef.key}
                              className="p-2 rounded-xl bg-white border border-cyan-200/80 space-y-1"
                            >
                              <div className="flex items-center justify-between gap-1 text-[11px] font-bold text-slate-700">
                                <span>
                                  {ef.label}
                                  {ef.required && <span className="text-rose-500 mr-0.5">*</span>}
                                </span>
                                {ef.unit && (
                                  <span className="text-[10px] text-slate-400 font-normal">{ef.unit}</span>
                                )}
                              </div>

                              {ef.fieldType === 'checkbox' ? (
                                <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer py-1">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(sv)}
                                    onChange={(e) => setSubVal(ef.key, e.target.checked)}
                                    className="w-3.5 h-3.5 rounded text-cyan-600"
                                  />
                                  <span>{sv ? 'بله' : 'خیر'}</span>
                                </label>
                              ) : ef.fieldType === 'currency' ? (
                                <input
                                  type="text"
                                  value={formatCurrencyInput(String(sv ?? ''))}
                                  onChange={(e) =>
                                    setSubVal(ef.key, formatCurrencyInput(e.target.value))
                                  }
                                  placeholder="0"
                                  className="w-full rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-cyan-500"
                                />
                              ) : ef.fieldType === 'number' ? (
                                <input
                                  type="number"
                                  value={String(sv ?? '')}
                                  onChange={(e) => setSubVal(ef.key, e.target.value)}
                                  className="w-full rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-cyan-500"
                                />
                              ) : ef.fieldType === 'select' ? (
                                <select
                                  value={String(sv ?? '')}
                                  onChange={(e) => setSubVal(ef.key, e.target.value)}
                                  className="w-full rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-cyan-500"
                                >
                                  <option value="">انتخاب...</option>
                                  {(ef.options || []).map((o) => (
                                    <option key={o} value={o}>
                                      {o}
                                    </option>
                                  ))}
                                </select>
                              ) : ef.fieldType === 'multiselect' ? (
                                <div className="flex flex-wrap gap-1">
                                  {(ef.options || []).map((o) => {
                                    const arr: string[] = Array.isArray(sv) ? sv : [];
                                    const chk = arr.includes(o);
                                    return (
                                      <label
                                        key={o}
                                        className={`px-1.5 py-0.5 rounded border text-[10px] cursor-pointer ${
                                          chk
                                            ? 'bg-cyan-600 text-white border-cyan-600'
                                            : 'bg-slate-50 text-slate-700 border-slate-200'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={chk}
                                          onChange={() =>
                                            setSubVal(
                                              ef.key,
                                              chk ? arr.filter((x) => x !== o) : [...arr, o]
                                            )
                                          }
                                          className="hidden"
                                        />
                                        {o}
                                      </label>
                                    );
                                  })}
                                </div>
                              ) : ef.fieldType === 'file' ? (
                                (sv as FieldFileValue)?.fileId ? (
                                  <div className="flex items-center justify-between gap-1 text-[10px] bg-sky-50 px-2 py-1 rounded border border-sky-200">
                                    <span className="truncate font-bold text-sky-800">{sv.fileName}</span>
                                    <button
                                      type="button"
                                      onClick={() => setSubVal(ef.key, null)}
                                      className="text-rose-500 cursor-pointer"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <label className="flex items-center justify-center gap-1 py-1 px-2 rounded border border-dashed border-sky-300 text-[10px] font-bold text-sky-700 cursor-pointer hover:bg-sky-50">
                                    <Upload className="w-3 h-3" />
                                    <span>
                                      {uploadingFieldKey === uploadToken ? 'در حال آپلود...' : 'آپلود فایل'}
                                    </span>
                                    <input
                                      type="file"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleFieldFileUpload(field.key, file, ef.key);
                                        e.target.value = '';
                                      }}
                                    />
                                  </label>
                                )
                              ) : (
                                <input
                                  type="text"
                                  value={String(sv ?? '')}
                                  onChange={(e) => setSubVal(ef.key, e.target.value)}
                                  placeholder={ef.label}
                                  className="w-full rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-cyan-500"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                if (field.fieldType === 'entity_select') {
                  const entity = availableEntities.find((en) => en.id === field.entityId);
                  if (!entity) {
                    return (
                      <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-2">
                        موجودیت متصل یافت نشد.
                      </div>
                    );
                  }
                  const records = entity.records || [];
                  const selectedId =
                    rawVal && typeof rawVal === 'object' ? rawVal.recordId : String(rawVal || '');
                  const selectedRec =
                    records.find((r) => r.id === selectedId) ||
                    (rawVal && typeof rawVal === 'object' && rawVal.recordId ? rawVal : null);

                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <select
                          value={selectedId || ''}
                          onChange={(e) => {
                            const rec = records.find((r) => r.id === e.target.value);
                            if (!rec) {
                              handleRequirementChange(field.key, null);
                            } else {
                              handleRequirementChange(field.key, {
                                recordId: rec.id,
                                displayLabel: rec.displayLabel,
                                data: rec.data,
                                entityId: entity.id,
                                entityTitle: entity.title,
                              });
                            }
                          }}
                          className="w-full rounded-xl bg-white border border-blue-200 px-2.5 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 shadow-2xs"
                        >
                          <option value="">انتخاب {entity.title}...</option>
                          {records.map((rec) => (
                            <option key={rec.id} value={rec.id}>
                              {rec.displayLabel}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => openQuickEntityRecordModal(field.key, 'entity_select', entity)}
                          className="p-2 rounded-xl bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 text-cyan-800 shrink-0 cursor-pointer"
                          title={`افزودن رکورد جدید به «${entity.title}»`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {selectedRec && (
                        <div className="p-2 rounded-xl bg-blue-50/60 border border-blue-200/80 flex flex-wrap gap-1.5">
                          {(entity.fields || []).map((ef) => {
                            const val = selectedRec.data?.[ef.key];
                            if (val === undefined || val === null || val === '') return null;
                            const disp =
                              ef.fieldType === 'currency'
                                ? formatBudgetDisplay(String(val))
                                : ef.fieldType === 'checkbox'
                                ? val
                                  ? 'بله'
                                  : 'خیر'
                                : ef.fieldType === 'file' && val?.fileName
                                ? val.fileName
                                : Array.isArray(val)
                                ? val.join('، ')
                                : `${val}${ef.unit ? ` ${ef.unit}` : ''}`;
                            return (
                              <span
                                key={ef.key}
                                className="text-[10px] px-2 py-0.5 rounded bg-white border border-blue-200/70 text-slate-700"
                              >
                                <span className="text-slate-500">{ef.label}: </span>
                                <strong className="text-blue-900">{disp}</strong>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                if (field.fieldType === 'entity_multiselect') {
                  const entity = availableEntities.find((en) => en.id === field.entityId);
                  if (!entity) {
                    return (
                      <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-2">
                        موجودیت متصل یافت نشد.
                      </div>
                    );
                  }
                  const records = entity.records || [];
                  const selectedList: Array<any> = Array.isArray(rawVal) ? rawVal : [];
                  const selectedIds = new Set(
                    selectedList.map((item) => (typeof item === 'string' ? item : item?.recordId)).filter(Boolean)
                  );

                  const toggleRecord = (rec: CustomEntityRecord) => {
                    if (selectedIds.has(rec.id)) {
                      handleRequirementChange(
                        field.key,
                        selectedList.filter((item) =>
                          (typeof item === 'string' ? item : item?.recordId) !== rec.id
                        )
                      );
                    } else {
                      handleRequirementChange(field.key, [
                        ...selectedList,
                        {
                          recordId: rec.id,
                          displayLabel: rec.displayLabel,
                          data: rec.data,
                          entityId: entity.id,
                          entityTitle: entity.title,
                        },
                      ]);
                    }
                  };

                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-fuchsia-800 font-bold">
                          {selectedIds.size} مورد انتخاب‌شده
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            openQuickEntityRecordModal(field.key, 'entity_multiselect', entity)
                          }
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 text-cyan-800 text-[10px] font-bold cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>افزودن {entity.title} جدید</span>
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-white border border-fuchsia-200/80 max-h-36 overflow-y-auto">
                        {records.length === 0 ? (
                          <span className="text-[11px] text-slate-400">
                            رکوردی ثبت نشده است؛ از دکمه «+ افزودن» استفاده کنید.
                          </span>
                        ) : (
                          records.map((rec) => {
                            const checked = selectedIds.has(rec.id);
                            return (
                              <button
                                key={rec.id}
                                type="button"
                                onClick={() => toggleRecord(rec)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition ${
                                  checked
                                    ? 'bg-fuchsia-600 text-white border-fuchsia-600'
                                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-fuchsia-50'
                                }`}
                              >
                                {checked && <Check className="w-3 h-3" />}
                                <span>{rec.displayLabel}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                }

                if (field.fieldType === 'text') {
                  return (
                    <input
                      type="text"
                      value={String(rawVal ?? '')}
                      onChange={(e) => handleRequirementChange(field.key, e.target.value)}
                      placeholder={`مقدار ${field.name}...`}
                      className="w-full rounded-xl bg-white border border-slate-200/90 px-3 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-indigo-500 shadow-2xs"
                    />
                  );
                }
                // Default numeric stepper
                return (
                  <div className="flex items-center justify-between bg-white border border-slate-200/90 rounded-xl p-1 shadow-2xs hover:border-indigo-300 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/10 transition">
                    <button
                      type="button"
                      onClick={() => handleDecrement(field.key)}
                      className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 active:scale-90 transition flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                      disabled={parseInt(String(rawVal || '0'), 10) <= 0}
                      title="کاهش تعداد"
                    >
                      <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>

                    <div className="flex-1 flex items-center justify-center px-1">
                      <input
                        type="number"
                        min="0"
                        value={String(rawVal ?? '0')}
                        onChange={(e) => handleRequirementChange(field.key, e.target.value)}
                        className="w-full text-center font-bold text-sm bg-transparent text-slate-900 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleIncrement(field.key)}
                      className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 active:scale-90 transition flex items-center justify-center cursor-pointer"
                      title="افزایش تعداد"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>
                  </div>
                );
              };

              const renderDynamicFieldCard = (field: DynamicField, depth: number = 0): React.ReactNode => {
                const hasChildren = field.children && field.children.length > 0;
                const isWideField =
                  field.fieldType === 'entity' ||
                  field.fieldType === 'entity_multiselect' ||
                  field.fieldType === 'multiselect';
                return (
                  <div
                    key={field.key}
                    className={`p-3 rounded-2xl border flex flex-col justify-between transition shadow-2xs ${
                      depth === 0
                        ? hasChildren || field.fieldType === 'entity'
                          ? 'bg-indigo-50/40 border-indigo-200/90 col-span-full'
                          : isWideField
                          ? 'bg-slate-50/80 border-slate-200 hover:border-slate-300 sm:col-span-2'
                          : 'bg-slate-50/80 border-slate-200 hover:border-slate-300'
                        : field.fieldType === 'entity'
                        ? 'bg-white border-indigo-200/70 col-span-full'
                        : 'bg-white border-indigo-200/70'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-bold text-slate-800 truncate flex items-center gap-1.5" title={field.name}>
                          {(field.fieldType === 'entity' ||
                            field.fieldType === 'entity_select' ||
                            field.fieldType === 'entity_multiselect') && (
                            <Database className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                          )}
                          <span className="truncate">{field.name}</span>
                          {Boolean(field.required) && <span className="text-rose-500 mr-0.5">*</span>}
                        </span>
                        {field.entityTitle ? (
                          <span className="text-[10px] font-bold text-cyan-800 bg-cyan-50 px-1.5 py-0.5 rounded-md border border-cyan-200 shrink-0">
                            {field.entityTitle}
                          </span>
                        ) : field.unit ? (
                          <span className="text-[10px] font-medium text-slate-500 bg-white px-1.5 py-0.5 rounded-md border border-slate-200/60 shrink-0">
                            {field.unit}
                          </span>
                        ) : null}
                      </div>
                      {renderFieldInput(field)}
                    </div>

                    {hasChildren && (
                      <div className="mt-3 pt-3 border-t border-indigo-200/60 space-y-2">
                        <div className="text-[11px] font-bold text-indigo-800">
                          ویژگی‌ها و جزئیات «{field.name}»:
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pr-3 border-r-2 border-indigo-300">
                          {field.children!.map((child) => renderDynamicFieldCard(child, depth + 1))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              };

              return (
                <div className="pt-3 border-t border-slate-200">
                  <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-indigo-600" />
                      <span>
                        {selectedProjectType
                          ? `فیلدهای اختصاصی نوع پروژه «${selectedProjectType.title}»`
                          : 'نیازمندی‌ها، عوامل و ویژگی‌های طرح'}
                      </span>
                    </h4>
                    <span className="text-[11px] text-slate-500 tabular-nums">
                      {displayedDynamicFields.length} فیلد فعال
                    </span>
                  </div>

                  {rootFields.length === 0 ? (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-dashed border-slate-300 text-xs text-slate-500 text-center">
                      برای نوع پروژه «{selectedProjectType?.title}» هنوز فیلد پویایی متصل نشده است. از بخش «فیلدهای پویا و انواع پروژه» می‌توانید فیلدهای مورد نیاز را به این نوع متصل کنید.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      {rootFields.map((field) => renderDynamicFieldCard(field, 0))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Project Attachments Section */}
            <div className="pt-3 border-t border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-indigo-600" />
                  <span>اسناد و فایل‌های پیوست پروژه</span>
                </h4>
                <span className="text-[10px] text-slate-500 font-semibold bg-slate-100 px-2 py-0.5 rounded-md">
                  انواع اسناد و فایل‌ها تا {formatMaxLimitDisplay()}
                </span>
              </div>

              {/* If editing existing project: Show ProjectAttachments component for full management */}
              {editProject && (
                <div className="mb-3 p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <ProjectAttachments
                    projectId={editProject.id}
                    projectTitle={editProject.title}
                    attachments={existingAttachments}
                    canManage={true}
                    onAttachmentChange={fetchAttachments}
                  />
                </div>
              )}

              {/* Add more files or initial files picker */}
              <div>
                <input
                  ref={newFileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />

                <div
                  onClick={() => newFileInputRef.current?.click()}
                  className="px-4 py-2.5 rounded-2xl border border-dashed border-slate-300 hover:border-indigo-500 bg-slate-50/70 hover:bg-indigo-50/30 transition cursor-pointer flex items-center justify-between gap-3 text-slate-600"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="p-1.5 rounded-xl bg-indigo-100/70 text-indigo-600 shrink-0">
                      <Upload className="w-4 h-4" />
                    </span>
                    <div>
                      <div className="text-xs font-bold text-slate-800">
                        {editProject ? 'افزودن فایل‌های پیوست جدید به این پروژه' : 'انتخاب فایل‌های پیوست طرح (کلیک یا انتخاب فایل)'}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        فیلم‌نامه، طرح توجیهی، بودجه‌بندی یا مستندات فنی
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 px-3 py-1 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition">
                    انتخاب فایل
                  </span>
                </div>

                {/* Selected files pending upload */}
                {selectedFiles.length > 0 && (
                  <div className="mt-2.5 space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-700">
                      فایل‌های انتخاب‌شده ({selectedFiles.length}):
                    </div>
                    {selectedFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-xl bg-indigo-50/60 border border-indigo-200 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <File className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span className="font-bold text-slate-800 truncate" dir="ltr">{file.name}</span>
                          <span className="text-[10px] text-slate-500 font-mono">({formatFileSize(file.size)})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSelectedFile(idx)}
                          className="p-1 rounded-lg text-rose-500 hover:bg-rose-100 transition cursor-pointer"
                          title="حذف از لیست"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Real Animated Upload Progress Bar */}
                {activeUploadProgress && (
                  <div className="mt-3 p-4 rounded-2xl bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white shadow-xl border border-indigo-500/40 space-y-3 animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="relative flex h-3 w-3 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </span>
                        <span className="text-indigo-200 shrink-0">
                          در حال ارسال فایل ({uploadingFileIndex} از {selectedFiles.length}):
                        </span>
                        <span className="text-white font-mono truncate" dir="ltr">
                          {uploadingFileName}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 font-mono text-emerald-400 text-sm font-bold shrink-0">
                        <span>{activeUploadProgress.percent}٪</span>
                      </div>
                    </div>

                    {/* Animated Gradient Bar with Shimmer */}
                    <div className="relative w-full h-3.5 bg-slate-800/90 rounded-full overflow-hidden p-0.5 border border-white/10 shadow-inner">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-400 transition-all duration-200 ease-out relative overflow-hidden shadow-md shadow-indigo-500/50"
                        style={{ width: `${Math.max(2, activeUploadProgress.percent)}%` }}
                      >
                        <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.3)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.3)_50%,rgba(255,255,255,0.3)_75%,transparent_75%,transparent)] bg-[length:16px_16px] animate-[pulse_1.5s_infinite]" />
                      </div>
                    </div>

                    {/* Transfer Metrics: Bytes & Speed */}
                    <div className="flex items-center justify-between text-[11px] text-slate-300">
                      <div className="flex items-center gap-1 text-slate-400">
                        <span>حجم منتقل‌شده:</span>
                        <span className="text-white font-bold font-mono">{formatFileSize(activeUploadProgress.loaded)}</span>
                        <span>از</span>
                        <span className="text-slate-300 font-mono">{formatFileSize(activeUploadProgress.total)}</span>
                      </div>
                      <div className="flex items-center gap-1 text-emerald-300">
                        <span className="text-slate-400">سرعت انتقال:</span>
                        <span className="font-bold font-mono">
                          {(activeUploadProgress.speed || 0) > 0
                            ? `${((activeUploadProgress.speed || 0) / (1024 * 1024)).toFixed(1)} MB/s`
                            : 'در حال محاسبه...'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Cartable Distribution Info Banner */}
            <div className="p-3 rounded-2xl bg-indigo-50/70 border border-indigo-200/70 text-xs text-indigo-900 flex items-center gap-2.5 leading-relaxed">
              <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="text-[11px] leading-relaxed">
                <strong>توزیع هوشمند:</strong> این طرح بلافاصله پس از ثبت در کارتابل ارزیابی تمامی اعضای شورا برای ثبت آرای سه‌حالته قرار می‌گیرد.
              </span>
            </div>

          </div>

          {/* Form Actions Footer (Always visible without scrolling) */}
          <div className="shrink-0 px-5 sm:px-6 py-3 border-t border-slate-200/90 bg-slate-50/95 flex items-center justify-between gap-3">
            <div className="text-[11px] text-slate-500 hidden sm:flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>آماده ثبت و ارسال مستقیم به شورا</span>
            </div>
            <div className="flex items-center gap-2.5 mr-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 disabled:opacity-50 transition cursor-pointer flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{uploadStatusText || (editProject ? 'در حال ذخیره...' : 'در حال ثبت...')}</span>
                  </>
                ) : (
                  <span>{editProject ? 'ذخیره تغییرات' : 'ثبت و ارسال به کارتابل اعضا'}</span>
                )}
              </button>
            </div>
          </div>

        </form>
      </div>

      {/* Inline Quick Create Entity Record Modal */}
      {quickRecordState && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden text-slate-800">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-cyan-50/70">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-700" />
                افزودن رکورد جدید به «{quickRecordState.entity.title}»
              </h4>
              <button
                type="button"
                onClick={() => setQuickRecordState(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {quickRecordState.error && (
              <div className="m-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {quickRecordState.error}
              </div>
            )}

            <form onSubmit={handleSaveQuickEntityRecord} className="p-4 space-y-3 max-h-[75vh] overflow-y-auto">
              {(quickRecordState.entity.fields || []).map((ef) => {
                const val = quickRecordState.data[ef.key];
                const setQuickVal = (nextVal: any) =>
                  setQuickRecordState((prev) =>
                    prev ? { ...prev, data: { ...prev.data, [ef.key]: nextVal } } : prev
                  );
                return (
                  <div key={ef.key}>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      {ef.label}
                      {ef.required && <span className="text-rose-500 mr-1">*</span>}
                      {ef.unit && <span className="text-[10px] text-slate-500 mr-1">({ef.unit})</span>}
                    </label>
                    {ef.fieldType === 'checkbox' ? (
                      <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={Boolean(val)}
                          onChange={(e) => setQuickVal(e.target.checked)}
                          className="w-4 h-4 rounded text-cyan-600"
                        />
                        <span>بله</span>
                      </label>
                    ) : ef.fieldType === 'currency' ? (
                      <input
                        type="text"
                        value={formatCurrencyInput(String(val ?? ''))}
                        onChange={(e) => setQuickVal(formatCurrencyInput(e.target.value))}
                        placeholder="0"
                        className="w-full rounded-xl bg-white border border-slate-300 px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-cyan-600"
                        required={ef.required}
                      />
                    ) : ef.fieldType === 'number' ? (
                      <input
                        type="number"
                        value={String(val ?? '')}
                        onChange={(e) => setQuickVal(e.target.value)}
                        className="w-full rounded-xl bg-white border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-cyan-600"
                        required={ef.required}
                      />
                    ) : ef.fieldType === 'select' ? (
                      <select
                        value={String(val ?? '')}
                        onChange={(e) => setQuickVal(e.target.value)}
                        className="w-full rounded-xl bg-white border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-cyan-600"
                        required={ef.required}
                      >
                        <option value="">انتخاب کنید...</option>
                        {(ef.options || []).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : ef.fieldType === 'multiselect' ? (
                      <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-slate-50 border border-slate-200">
                        {(ef.options || []).map((o) => {
                          const arr: string[] = Array.isArray(val) ? val : [];
                          const chk = arr.includes(o);
                          return (
                            <label
                              key={o}
                              className={`px-2 py-1 rounded-lg border text-xs cursor-pointer ${
                                chk ? 'bg-cyan-600 text-white border-cyan-600 font-bold' : 'bg-white border-slate-200'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={chk}
                                onChange={() => setQuickVal(chk ? arr.filter((x) => x !== o) : [...arr, o])}
                                className="hidden"
                              />
                              {o}
                            </label>
                          );
                        })}
                      </div>
                    ) : ef.fieldType === 'file' ? (
                      (val as FieldFileValue)?.fileId ? (
                        <div className="flex items-center justify-between gap-2 bg-sky-50 px-3 py-1.5 rounded-xl border border-sky-200 text-xs">
                          <span className="truncate font-bold text-sky-800">{val.fileName}</span>
                          <button type="button" onClick={() => setQuickVal(null)} className="text-rose-500 cursor-pointer">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-dashed border-cyan-300 text-xs font-bold text-cyan-800 cursor-pointer hover:bg-cyan-50">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{quickRecordUploadingAttr === ef.key ? 'در حال آپلود...' : 'انتخاب فایل'}</span>
                          <input
                            type="file"
                            className="hidden"
                            onChange={async (ev) => {
                              const f = ev.target.files?.[0];
                              if (f) {
                                setQuickRecordUploadingAttr(ef.key);
                                try {
                                  const uploaded = await api.uploadFieldFileStream(f);
                                  setQuickVal(uploaded);
                                } catch (err: any) {
                                  setQuickRecordState((prev) =>
                                    prev ? { ...prev, error: err.message || 'خطا در آپلود' } : prev
                                  );
                                } finally {
                                  setQuickRecordUploadingAttr(null);
                                }
                              }
                              ev.target.value = '';
                            }}
                          />
                        </label>
                      )
                    ) : (
                      <input
                        type="text"
                        value={String(val ?? '')}
                        onChange={(e) => setQuickVal(e.target.value)}
                        className="w-full rounded-xl bg-white border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-cyan-600"
                        required={ef.required}
                      />
                    )}
                  </div>
                );
              })}

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQuickRecordState(null)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={quickRecordState.saving || Boolean(quickRecordUploadingAttr)}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-xs font-bold text-white cursor-pointer disabled:opacity-50"
                >
                  {quickRecordState.saving ? 'در حال ثبت...' : 'ثبت و انتخاب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
