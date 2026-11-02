import React, { useState } from 'react';
import { DynamicField, User } from '../types';
import { api } from '../services/api';
import { 
  Sliders, 
  Plus, 
  Trash2, 
  Sparkles, 
  CheckCircle2, 
  Layers, 
  Tag, 
  Hash, 
  X,
  HelpCircle
} from 'lucide-react';

interface DynamicFieldsManagerProps {
  fields: DynamicField[];
  currentUser: User;
  onRefresh: () => void;
}

export const DynamicFieldsManager: React.FC<DynamicFieldsManagerProps> = ({
  fields,
  currentUser,
  onRefresh,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('نفر');
  const [defaultValue, setDefaultValue] = useState('1');
  const [category, setCategory] = useState('عوامل تولید');
  const [fieldType, setFieldType] = useState<'number' | 'text'>('number');
  const [required, setRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = currentUser.role === 'ADMIN';

  const handleAddField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('نام فیلد الزامی است.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Key is generated automatically from name or timestamp
      const key = `fld_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      await api.createDynamicField({
        name: name.trim(),
        key,
        unit: unit.trim() || 'نفر',
        defaultValue: defaultValue.trim() || '1',
        category,
        fieldType,
        required,
      });

      setName('');
      setShowAddModal(false);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'خطا در ثبت فیلد');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteField = async (id: string, fieldName: string) => {
    if (!confirm(`آیا از حذف فیلد «${fieldName}» اطمینان دارید؟`)) return;
    try {
      await api.deleteDynamicField(id);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'خطا در حذف فیلد');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner explaining dynamic field architecture */}
      <div className="p-5 sm:p-6 rounded-3xl bg-indigo-50/70 border border-indigo-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-1 rounded-lg bg-indigo-100 text-indigo-700">
              <Sliders className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              مدیریت و تعریف فیلدهای پویای نیاز هر پروژه
            </h2>
          </div>
          <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
            شما می‌توانید بدون نیاز به تغییر کد برنامه، هر نوع نیاز یا فیلد جدیدی را برای پروژه‌ها تعریف نمایید (مانند تعداد هلی‌شات، طراح لباس، ناظر انتظامی و ...). فیلدهای ایجاد شده بلافاصله در فرم ثبت پروژه ظاهر خواهند شد.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>تعریف فیلد نیاز جدید</span>
          </button>
        )}
      </div>

      {/* Grid of Dynamic Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {fields.map((field, idx) => (
          <div
            key={field.id}
            className="bg-white border border-slate-200/90 hover:border-slate-300 rounded-2xl p-4 flex flex-col justify-between shadow-2xs hover:shadow-xs transition"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-xl bg-slate-100 text-indigo-700 font-bold text-xs flex items-center justify-center border border-slate-200">
                    {idx + 1}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">
                    {field.name}
                  </h3>
                </div>

                {isAdmin && (
                  <button
                    onClick={() => handleDeleteField(field.id, field.name)}
                    className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                    title="حذف فیلد"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-2">
                <span className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-700">
                  واحد: <strong className="text-indigo-600">{field.unit || 'نفر'}</strong>
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-700">
                  پیش‌فرض: <strong className="text-emerald-700">{field.defaultValue || '1'}</strong>
                </span>
                <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200/60 text-indigo-800">
                  {field.category || 'عوامل تولید'}
                </span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
              <span>شناسه: {field.key}</span>
              <span className="text-emerald-700 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                آماده برای ثبت در پروژه
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Modal: Add New Dynamic Field */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-800">
            
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/80">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-600" />
                تعریف فیلد نیاز جدید برای پروژه‌ها
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="m-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleAddField} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  نام فیلد (عنوان نیاز پروژه) *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: تعداد پهپاد و هلی‌شات یا تعداد طراح گریم"
                  className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    واحد سنجش
                  </label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="نفر، دستگاه، شیفت، روز..."
                    className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
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
                    className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition text-center shadow-2xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  دسته‌بندی فیلد
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
                >
                  <option value="عوامل تولید">عوامل تولید</option>
                  <option value="عوامل فنی و تصویر">عوامل فنی و تصویر</option>
                  <option value="تیم کارگردانی">تیم کارگردانی</option>
                  <option value="پشتیبانی و لجستیک">پشتیبانی و لجستیک</option>
                  <option value="طراحی صحنه و لباس">طراحی صحنه و لباس</option>
                  <option value="پس‌تولید و تدوین">پس‌تولید و تدوین</option>
                  <option value="تجهیزات تخصصی">تجهیزات تخصصی</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white hover:bg-slate-100 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'در حال ایجاد...' : 'افزودن به لیست فیلدها'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};
