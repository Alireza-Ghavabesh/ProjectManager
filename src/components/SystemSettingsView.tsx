import React, { useState, useEffect } from 'react';
import { User, SystemSetting } from '../types';
import { api } from '../services/api';
import { 
  Settings, 
  ShieldCheck, 
  Clock, 
  Lock, 
  CheckCircle2, 
  AlertCircle, 
  Save, 
  RefreshCw,
  Calendar,
  Sparkles
} from 'lucide-react';

interface SystemSettingsViewProps {
  currentUser: User;
}

export const SystemSettingsView: React.FC<SystemSettingsViewProps> = ({ currentUser }) => {
  const [settings, setSettings] = useState<Record<string, string>>({
    enforce_deadline: 'true',
    default_deadline_days: '14',
    allow_creator_extension: 'true',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = currentUser.role === 'ADMIN';

  const loadSettings = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getSettings();
      if (data && data.settings) {
        setSettings((prev) => ({
          ...prev,
          ...data.settings,
        }));
      }
    } catch (e: any) {
      setError(e.message || 'خطا در بارگذاری تنظیمات سیستم');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleToggle = (key: string) => {
    if (!isAdmin) return;
    setSettings((prev) => ({
      ...prev,
      [key]: prev[key] === 'true' ? 'false' : 'true',
    }));
    setSavedSuccess(false);
  };

  const handleTextChange = (key: string, value: string) => {
    if (!isAdmin) return;
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
    setSavedSuccess(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setSaving(true);
    setError('');
    setSavedSuccess(false);
    try {
      const res = await api.updateSettings(settings);
      setSettings((prev) => ({ ...prev, ...res.settings }));
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (err: any) {
      setError(err.message || 'خطا در ذخیره تنظیمات');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-center bg-white rounded-3xl border border-slate-200/90 shadow-xs max-w-xl mx-auto my-12">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-200">
          <Lock className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-2">دسترسی محدود شده است</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          تنظیمات کلان سامانه و ضوابط مهلت ارزیابی فقط در دسترس کاربر ارشد سیستم (مدیرکل / ادمین) قرار دارد.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* Top Banner */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200/70 text-indigo-700 flex items-center justify-center shrink-0 shadow-2xs">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900">
                تنظیمات سامانه و مهلت ارزیابی پروژه‌ها
              </h2>
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                مخصوص کاربر ارشد (Admin)
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              تعیین سیاست‌های زمانی رای‌گیری، قفل خودکار کارتابل با پایان مهلت، و ضوابط تمدید توسط ثبت‌کننده طرح.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadSettings}
          disabled={loading}
          className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition cursor-pointer"
          title="بازخوانی تنظیمات"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {savedSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-center gap-2.5 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-bold">تنظیمات با موفقیت ذخیره و در سطح کل سامانه اعمال گردید.</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        
        {/* Section 1: Evaluation Deadline Rules */}
        <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
            <Clock className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">
              ضوابط مهلت ارزیابی و قفل رای‌گیری کارتابل
            </h3>
          </div>

          {/* Toggle 1: Enforce Deadline */}
          <div className="flex items-start justify-between gap-4 p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 hover:border-slate-300 transition">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-bold text-slate-900">
                  قفل خودکار ثبت رای پس از اتمام مهلت ارزیابی
                </span>
                {settings.enforce_deadline === 'true' ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    فعال (پیش‌فرض)
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                    غیرفعال
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                هنگامی که این گزینه فعال باشد، به محض پایان یافتن تاریخ مهلت بررسی پروژه، دکمه‌های ثبت رای در کارتابل قفل می‌شوند و کسی نمی‌تواند رای دهد.
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleToggle('enforce_deadline')}
              className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 mt-1 ${
                settings.enforce_deadline === 'true' ? 'bg-indigo-600' : 'bg-slate-300'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform transform shadow-sm ${
                  settings.enforce_deadline === 'true' ? '-translate-x-6' : '-translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Toggle 2: Allow Creator Extension */}
          <div className="flex items-start justify-between gap-4 p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 hover:border-slate-300 transition">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-bold text-slate-900">
                  بازگشایی مجدد امکان رای‌گیری با تمدید مهلت توسط ثبت‌کننده
                </span>
                {settings.allow_creator_extension === 'true' ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    فعال (پیش‌فرض)
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                    غیرفعال
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                اگر ثبت‌کننده طرح یا مدیر پروژه را ویرایش کرده و تاریخ مهلت ارزیابی را به تاریخی بعد از امروز تمدید کند، قفل رای‌گیری به شکل خودکار باز شده و اعضا دوباره می‌توانند رای دهند.
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleToggle('allow_creator_extension')}
              className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 mt-1 ${
                settings.allow_creator_extension === 'true' ? 'bg-indigo-600' : 'bg-slate-300'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform transform shadow-sm ${
                  settings.allow_creator_extension === 'true' ? '-translate-x-6' : '-translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Setting 3: Default Deadline Duration in Days */}
          <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1 max-w-lg">
                <label className="text-xs sm:text-sm font-bold text-slate-900 block">
                  مدت زمان پیش‌فرض مهلت ارزیابی (تعداد روز)
                </label>
                <p className="text-xs text-slate-500 leading-relaxed">
                  هنگام ثبت پروژه جدید، مهلت ارزیابی به صورت خودکار به اندازه این تعداد روز پس از تاریخ امروز در تقویم شمسی پیشنهاد داده می‌شود.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={settings.default_deadline_days || '14'}
                  onChange={(e) => handleTextChange('default_deadline_days', e.target.value)}
                  className="w-24 rounded-xl bg-white border border-slate-300 px-3 py-2 text-center text-sm font-bold text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
                />
                <span className="text-xs font-bold text-slate-600">روز</span>
              </div>
            </div>
          </div>

        </div>

        {/* Informative Guidance Card */}
        <div className="p-4 sm:p-5 rounded-3xl bg-indigo-50/60 border border-indigo-200/70 text-indigo-950 text-xs flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          <div className="space-y-1.5 leading-relaxed">
            <div className="font-bold text-indigo-900 text-sm">
              نحوه نظارت و مدیریت مهلت‌ها در شورا:
            </div>
            <p className="text-slate-700 text-xs">
              پروژه‌هایی که مهلت ارزیابی آن‌ها منقضی شده با برچسب قرمز <span className="font-bold text-rose-700">«مهلت ارزیابی پایان یافته»</span> مشخص می‌شوند. ثبت‌کننده طرح با کلیک روی آیکون ویرایش پروژه (مداد) می‌تواند مهلت را تمدید کند تا بلافاصله قفل کارتابل باز شود.
            </p>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white font-bold text-xs sm:text-sm shadow-md shadow-indigo-500/20 transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'در حال ذخیره تنظیمات...' : 'ذخیره و اعمال تنظیمات سیستم'}</span>
          </button>
        </div>

      </form>

    </div>
  );
};
