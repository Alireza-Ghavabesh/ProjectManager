import React, { useState } from 'react';
import { DynamicField, Project } from '../types';
import { api } from '../services/api';
import { 
  Plus, 
  X, 
  Building2, 
  Calendar, 
  MapPin, 
  Coins, 
  FileText, 
  Sparkles,
  Minus,
  Film
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
  const [productionType, setProductionType] = useState(
    editProject?.productionType || 'برنامه استودیویی تلویزیونی'
  );
  const [location, setLocation] = useState(editProject?.location || '');
  const [deadline, setDeadline] = useState(editProject?.deadline || '۱۴۰۳/۰۹/۳۰');
  const [budgetEstimated, setBudgetEstimated] = useState(
    editProject?.budgetEstimated || ''
  );
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
        productionType,
        location: location.trim(),
        deadline: deadline.trim(),
        budgetEstimated: budgetEstimated.trim(),
        description: description.trim(),
        requirements,
      };

      if (editProject) {
        await api.updateProject(editProject.id, payload);
      } else {
        await api.createProject(payload);
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
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                {editProject ? 'ویرایش اطلاعات پروژه' : 'ثبت پروژه جدید در کارتابل شورا'}
              </h3>
              <p className="text-xs text-slate-500">
                پروژه پس از ثبت فوراً در کارتابل اعضای شورا برای اعلام نظر و رای‌گیری قرار می‌گیرد.
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
                نام پروژه *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: مستند فاخر در مسیر سیمرغ"
                className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
                required
              />
            </div>

            {/* Code */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                کد پروژه (رهگیری)
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition font-mono shadow-2xs"
                dir="ltr"
              />
            </div>

            {/* Production Type */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                نوع و ساختار تولید
              </label>
              <select
                value={productionType}
                onChange={(e) => setProductionType(e.target.value)}
                className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition cursor-pointer shadow-2xs"
              >
                <option value="برنامه استودیویی تلویزیونی">برنامه استودیویی تلویزیونی</option>
                <option value="مستند فاخر میدانی">مستند فاخر میدانی</option>
                <option value="سریال داستانی">سریال داستانی</option>
                <option value="برنامه زنده شبانگاهی">برنامه زنده شبانگاهی</option>
                <option value="پویانمایی و موشن‌گرافیک">پویانمایی و موشن‌گرافیک</option>
                <option value="تله‌فیلم یا فیلم کوتاه">تله‌فیلم یا فیلم کوتاه</option>
              </select>
            </div>

            {/* Location */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                محل تصویربرداری / استودیو
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="مثال: استودیو ۱ جام جم یا فلات مرکزی"
                className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
              />
            </div>

            {/* Deadline */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                مهلت اعلام نظر شورا
              </label>
              <input
                type="text"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                placeholder="۱۴۰۳/۰۹/۳۰"
                className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
              />
            </div>

            {/* Estimated Budget */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                برآورد بودجه / هزینه تخمینی
              </label>
              <input
                type="text"
                value={budgetEstimated}
                onChange={(e) => setBudgetEstimated(e.target.value)}
                placeholder="مثال: ۸۵۰٬۰۰۰٬۰۰۰ تومان"
                className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
              />
            </div>

            {/* Description */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                شرح و اهداف پروژه
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="خلاصه طرح، مخاطب هدف، و توجیه تولید..."
                className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition leading-relaxed shadow-2xs"
              />
            </div>

          </div>

          {/* DYNAMIC REQUIREMENTS SECTION */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  فیلدهای پویای نیاز عوامل و تجهیزات پروژه
                </h4>
                <p className="text-[11px] text-slate-500">
                  این فیلدها از بخش «تعریف فیلدهای پویا» خوانده شده‌اند و برای هر پروژه قابل مقداردهی هستند.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {dynamicFields.map((field) => (
                <div
                  key={field.key}
                  className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs hover:border-slate-300 transition flex items-center justify-between"
                >
                  <div className="text-right">
                    <span className="text-xs font-semibold text-slate-800 block truncate max-w-[140px]">
                      {field.name}
                    </span>
                    <span className="text-[10px] text-indigo-600 font-medium">
                      واحد: {field.unit || 'نفر'}
                    </span>
                  </div>

                  {field.fieldType === 'number' ? (
                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1">
                      <button
                        type="button"
                        onClick={() => handleDecrement(field.key)}
                        className="w-6 h-6 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center text-xs transition cursor-pointer shadow-2xs"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="text"
                        value={requirements[field.key] ?? field.defaultValue ?? '0'}
                        onChange={(e) => handleRequirementChange(field.key, e.target.value)}
                        className="w-10 text-center font-bold text-indigo-600 text-xs bg-transparent focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleIncrement(field.key)}
                        className="w-6 h-6 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center text-xs transition cursor-pointer shadow-2xs"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={requirements[field.key] ?? field.defaultValue ?? ''}
                      onChange={(e) => handleRequirementChange(field.key, e.target.value)}
                      className="w-24 rounded-lg bg-white border border-slate-200 px-2 py-1 text-xs text-slate-900 text-center focus:outline-none focus:border-indigo-500 shadow-2xs"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 transition cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer disabled:opacity-50"
            >
              {loading ? 'در حال ثبت...' : editProject ? 'ذخیره تغییرات' : 'ثبت پروژه در کارتابل شورا'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
