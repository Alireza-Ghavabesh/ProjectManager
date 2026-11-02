import React, { useState, useRef, useEffect } from 'react';
import { DynamicField, Project, ProjectAttachment } from '../types';
import { api, fileToBase64, formatFileSize } from '../services/api';
import { ProjectAttachments } from './ProjectAttachments';
import { 
  X, 
  Calendar, 
  MapPin, 
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
  File
} from 'lucide-react';

interface CreateProjectModalProps {
  dynamicFields: DynamicField[];
  onClose: () => void;
  onSuccess: () => void;
  editProject?: Project | null;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  dynamicFields,
  onClose,
  onSuccess,
  editProject,
}) => {
  const [title, setTitle] = useState(editProject?.title || '');
  const [code, setCode] = useState(
    editProject?.code || `PRJ-1403-${Math.floor(10 + Math.random() * 90)}`
  );
  const [productionType, setProductionType] = useState(editProject?.productionType || 'طرح عمومی شورا');
  const [location, setLocation] = useState(editProject?.location || '');
  const [deadline, setDeadline] = useState(editProject?.deadline || '۱۴۰۳/۰۹/۳۰');
  const [budgetEstimated, setBudgetEstimated] = useState(editProject?.budgetEstimated || '');
  const [description, setDescription] = useState(editProject?.description || '');

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

  useEffect(() => {
    fetchAttachments();
  }, [editProject?.id]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      const validFiles = filesArray.filter((f) => {
        if (f.size > 30 * 1024 * 1024) {
          alert(`فایل «${f.name}» بیش از ۳۰ مگابایت است و نادیده گرفته شد.`);
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

    try {
      const payload = {
        title: title.trim(),
        code: code.trim(),
        productionType: productionType.trim() || 'طرح عمومی شورا',
        location: location.trim(),
        deadline: deadline.trim(),
        budgetEstimated: budgetEstimated.trim(),
        description: description.trim(),
        requirements,
      };

      let targetProjectId = editProject?.id;
      if (editProject) {
        await api.updateProject(editProject.id, payload);
      } else {
        const res = await api.createProject(payload);
        targetProjectId = (res as any)?.projectId;
      }

      // Upload any chosen files for the project
      if (targetProjectId && selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          const base64Data = await fileToBase64(file);
          await api.uploadProjectAttachment(targetProjectId, {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type || 'application/octet-stream',
            data: base64Data,
          });
        }
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'خطا در ثبت پروژه');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-3xl rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150 text-slate-800">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200/60 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                {editProject ? 'ویرایش مشخصات پروژه' : 'ثبت پروژه جدید در شورا'}
              </h3>
              <p className="text-xs text-slate-500">
                طرح پس از ثبت مستقیماً در کارتابل ارزیابی تمامی اعضای شورا قرار گرفته و اخذ آرا آغاز می‌شود.
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

        {error && (
          <div className="m-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-6">
          
          {/* General Project Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Title */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                نام و عنوان پروژه *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: مستند تاریخی شکوه زاگرس، برنامه ویژه جوانان..."
                className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
                required
              />
            </div>

            {/* Code */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                کد رهگیری پروژه
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition font-mono shadow-2xs"
                dir="ltr"
              />
            </div>

            {/* Category / Subject */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                موضوع / زمینه طرح
              </label>
              <input
                type="text"
                value={productionType}
                onChange={(e) => setProductionType(e.target.value)}
                placeholder="مثال: تولید نمایشی، استودیویی، مستند، اداری..."
                className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                محل / استودیو / لوکیشن اجرا
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="مثال: استودیو شماره یک، استان اصفهان..."
                className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
              />
            </div>

            {/* Deadline */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                مهلت بررسی و اعلام نظر نهایی
              </label>
              <input
                type="text"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                placeholder="مثال: ۱۴۰۳/۰۹/۳۰"
                className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs text-left"
                dir="ltr"
              />
            </div>

            {/* Budget */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-slate-500" />
                برآورد بودجه پیشنهادی
              </label>
              <input
                type="text"
                value={budgetEstimated}
                onChange={(e) => setBudgetEstimated(e.target.value)}
                placeholder="مثال: ۷۵۰٬۰۰۰٬۰۰۰ تومان"
                className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
              />
            </div>

            {/* Description */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                خلاصه طرح و اهداف پروژه
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="توضیحات کلی درباره اهداف، گروه مخاطب، ویژگی‌های فنی یا محتوایی..."
                className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-none shadow-2xs leading-relaxed"
              />
            </div>

          </div>

          {/* Dynamic Requirements Fields Section */}
          <div className="pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-indigo-600" />
                  <span>نیازمندی‌ها و عوامل اجرایی طرح</span>
                </h4>
                <p className="text-xs text-slate-500">
                  فیلدهای تعریف‌شده به صورت پویا در بخش تنظیمات
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {dynamicFields.map((field) => (
                <div
                  key={field.key}
                  className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 flex flex-col justify-between hover:border-slate-300 transition"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800 truncate">
                      {field.name}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {field.unit || 'نفر'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDecrement(field.key)}
                      className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer shadow-2xs"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      min="0"
                      value={requirements[field.key] || '0'}
                      onChange={(e) => handleRequirementChange(field.key, e.target.value)}
                      className="flex-1 text-center font-bold text-sm bg-white border border-slate-200 rounded-xl py-1.5 text-slate-900 focus:outline-none focus:border-indigo-500 shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleIncrement(field.key)}
                      className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Project Attachments Section */}
          <div className="pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Paperclip className="w-4 h-4 text-indigo-600" />
                  <span>اسناد و فایل‌های پیوست پروژه</span>
                </h4>
                <p className="text-xs text-slate-500">
                  بارگذاری فیلم‌نامه، سیناپس، برآورد مالی یا فایل‌های اجرایی (حداکثر ۳۰ مگابایت)
                </p>
              </div>
            </div>

            {/* If editing existing project: Show ProjectAttachments component for full management */}
            {editProject && (
              <div className="mb-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
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
                className="p-4 rounded-2xl border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50/70 hover:bg-indigo-50/30 transition cursor-pointer text-center"
              >
                <div className="flex flex-col items-center justify-center gap-1 text-slate-600">
                  <Upload className="w-5 h-5 text-indigo-600" />
                  <span className="text-xs font-bold text-slate-800">
                    {editProject ? 'افزودن فایل‌های پیوست جدید به این پروژه' : 'انتخاب یا رها کردن فایل‌های پروژه'}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    فرمت‌های PDF، Word، Excel، عکس یا ZIP
                  </span>
                </div>
              </div>

              {/* Selected files pending upload */}
              {selectedFiles.length > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="text-[11px] font-bold text-slate-700">
                    فایل‌های آماده بارگذاری ({selectedFiles.length}):
                  </div>
                  {selectedFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-200 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <File className="w-4 h-4 text-indigo-600 shrink-0" />
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
            </div>
          </div>

          {/* Cartable Distribution Info Banner */}
          <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 text-xs text-indigo-900 flex items-start gap-2.5 leading-relaxed">
            <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold">توزیع خودکار در کارتابل شورا:</strong>
              پس از ثبت، این طرح فوراً در کارتابل ارزیابی تمامی اعضای شورا قرار خواهد گرفت و اعضا می‌توانند نسبت به ثبت رای ۳ حالته (موافق، مخالف، نیازمند اصلاح) اقدام فرمایند.
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 disabled:opacity-50 transition cursor-pointer flex items-center gap-2"
            >
              {loading ? 'در حال ثبت...' : editProject ? 'ذخیره تغییرات' : 'ثبت و ارسال به کارتابل اعضا'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
