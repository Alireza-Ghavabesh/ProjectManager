import React, { useState, useRef, useEffect } from 'react';
import { DynamicField, Project, ProjectAttachment, Workflow, UploadProgressInfo } from '../types';
import { api, fileToBase64, formatFileSize } from '../services/api';
import { ProjectAttachments } from './ProjectAttachments';
import { PersianDatePicker } from './PersianDatePicker';
import { formatCurrencyInput, formatBudgetDisplay } from '../utils/formatters';
import { 
  X, 
  Calendar, 
  Coins, 
  FileText, 
  Minus, 
  Plus, 
  Layers, 
  Users,
  CheckCircle2,
  Sparkles,
  Paperclip,
  Upload,
  Trash2,
  File,
  GitBranch,
  RefreshCw
} from 'lucide-react';

interface CreateProjectModalProps {
  dynamicFields: DynamicField[];
  onClose: () => void;
  onSuccess: () => void;
  editProject?: Project | null;
  workflows?: Workflow[];
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  dynamicFields,
  onClose,
  onSuccess,
  editProject,
  workflows = [],
}) => {
  const [title, setTitle] = useState(editProject?.title || '');
  const [code, setCode] = useState(
    editProject?.code || `PRJ-1403-${Math.floor(10 + Math.random() * 90)}`
  );
  const [productionType, setProductionType] = useState(editProject?.productionType || 'طرح عمومی شورا');
  const [deadline, setDeadline] = useState(editProject?.deadline || '۱۴۰۳/۰۹/۳۰');
  const [deliveryDate, setDeliveryDate] = useState(editProject?.deliveryDate || '');
  const [budgetEstimated, setBudgetEstimated] = useState(
    formatCurrencyInput(editProject?.budgetEstimated || '')
  );
  const [description, setDescription] = useState(editProject?.description || '');
  
  // Workflow selector state
  const [availableWorkflows, setAvailableWorkflows] = useState<Workflow[]>(workflows);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(() => {
    if (editProject?.workflowId) return editProject.workflowId;
    const def = workflows.find((w) => w.isDefault);
    return def?.id || (workflows[0]?.id) || '';
  });

  useEffect(() => {
    if (workflows.length === 0) {
      api.getWorkflows().then((wfs) => {
        setAvailableWorkflows(wfs);
        if (!selectedWorkflowId) {
          const def = wfs.find((w) => w.isDefault);
          setSelectedWorkflowId(editProject?.workflowId || def?.id || wfs[0]?.id || '');
        }
      }).catch(console.error);
    } else {
      setAvailableWorkflows(workflows);
      if (!selectedWorkflowId) {
        const def = workflows.find((w) => w.isDefault);
        setSelectedWorkflowId(editProject?.workflowId || def?.id || workflows[0]?.id || '');
      }
    }
  }, [workflows, editProject?.workflowId]);

  // Initialize requirements from dynamic fields or existing project
  const [requirements, setRequirements] = useState<Record<string, any>>(() => {
    if (editProject?.requirements) {
      return { ...editProject.requirements };
    }
    const initial: Record<string, any> = {};
    for (const f of dynamicFields) {
      initial[f.key] = f.defaultValue || '1';
    }
    return initial;
  });

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

  const handleRequirementChange = (key: string, value: string) => {
    setRequirements((prev) => ({
      ...prev,
      [key]: value,
    }));
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

    setLoading(true);
    setError('');
    setUploadStatusText(null);
    setActiveUploadProgress(null);

    try {
      const payload = {
        title: title.trim(),
        code: code.trim(),
        productionType: productionType.trim() || 'طرح عمومی شورا',
        location: editProject?.location || '',
        deadline: deadline.trim(),
        deliveryDate: deliveryDate.trim(),
        budgetEstimated: budgetEstimated.trim(),
        description: description.trim(),
        requirements,
        workflowId: selectedWorkflowId || undefined,
      };

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

              {/* Category / Subject */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  موضوع / زمینه طرح
                </label>
                <input
                  type="text"
                  value={productionType}
                  onChange={(e) => setProductionType(e.target.value)}
                  placeholder="نوع تولید (مستند، استودیویی، داستانی...)"
                  className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
                />
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
                <div className="md:col-span-2 lg:col-span-3 p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-100 shadow-2xs">
                  <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center justify-between flex-wrap gap-2">
                    <span className="flex items-center gap-1.5 text-indigo-900">
                      <GitBranch className="w-4 h-4 text-indigo-600" />
                      <span>گردش کار سازمانی و ساختار مربوطه برای این پروژه *</span>
                    </span>
                    {selectedWf && (
                      <span className="text-[11px] font-bold text-indigo-700 bg-white border border-indigo-200 px-2.5 py-0.5 rounded-lg shadow-2xs">
                        تعداد سمت‌های گردش: {selectedWf.steps.length} نفر (مشارکت کارتابل: {selectedWf.steps.length} رای)
                      </span>
                    )}
                  </label>

                  <select
                    value={selectedWorkflowId}
                    onChange={(e) => setSelectedWorkflowId(e.target.value)}
                    className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs cursor-pointer"
                  >
                    {availableWorkflows.map((wf) => (
                      <option key={wf.id} value={wf.id}>
                        {wf.title} {wf.isDefault ? '⭐ (پیش‌فرض سیستم)' : ''} — ({wf.steps.length} سمت و مرحله سازمانی)
                      </option>
                    ))}
                  </select>

                  {selectedWf && (
                    <div className="mt-2.5 pt-2 border-t border-indigo-100 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span className="text-slate-500">مسیر گردش بین سمت‌ها:</span>
                        <span className="font-semibold text-slate-800" dir="rtl">
                          {selectedWf.steps.map((s) => s.title).join(' ← ')}
                        </span>
                      </div>
                      <span className="text-slate-500">
                        آمار کارتابل این طرح به صورت <strong className="text-indigo-700">«X تا از {selectedWf.steps.length} نفر»</strong> محاسبه می‌شود.
                      </span>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Dynamic Requirements Fields Section */}
            {dynamicFields.length > 0 && (
              <div className="pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-indigo-600" />
                    <span>نیازمندی‌ها و عوامل اجرایی طرح</span>
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    تعریف‌شده در تنظیمات فیلدهای پویا
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {dynamicFields.map((field) => (
                    <div
                      key={field.key}
                      className="p-3 rounded-2xl bg-slate-50/80 border border-slate-200 flex flex-col justify-between hover:border-slate-300 transition shadow-2xs"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-800 truncate" title={field.name}>
                          {field.name}
                        </span>
                        <span className="text-[10px] font-medium text-slate-400 bg-white px-1.5 py-0.5 rounded-md border border-slate-200/60">
                          {field.unit || 'نفر'}
                        </span>
                      </div>

                      {/* Modern Arranged Stepper */}
                      <div className="flex items-center justify-between bg-white border border-slate-200/90 rounded-xl p-1 shadow-2xs hover:border-indigo-300 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/10 transition">
                        <button
                          type="button"
                          onClick={() => handleDecrement(field.key)}
                          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 active:scale-90 transition flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                          disabled={parseInt(requirements[field.key] || '0', 10) <= 0}
                          title="کاهش تعداد"
                        >
                          <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>
                        
                        <div className="flex-1 flex items-center justify-center px-1">
                          <input
                            type="number"
                            min="0"
                            value={requirements[field.key] || '0'}
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
                    </div>
                  ))}
                </div>
              </div>
            )}

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
    </div>
  );
};
