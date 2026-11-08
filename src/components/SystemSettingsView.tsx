import React, { useState, useEffect, useRef } from 'react';
import { User, SystemSetting, SmsRule, SmsLog, SmsEventType, SmsTargetType, Position } from '../types';
import { api, fileToBase64 } from '../services/api';
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
  Sparkles,
  UploadCloud,
  HardDrive,
  MessageSquare,
  Send,
  Bell,
  Plus,
  Trash2,
  Edit3,
  Smartphone,
  Check,
  X,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  Layers,
  Users,
  Eye,
  Radio
} from 'lucide-react';

interface SystemSettingsViewProps {
  currentUser: User;
}

export const SystemSettingsView: React.FC<SystemSettingsViewProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'DEADLINE' | 'SMS' | 'BRANDING'>('DEADLINE');
  
  // Settings state
  const [settings, setSettings] = useState<Record<string, string>>({
    enforce_deadline: 'true',
    default_deadline_days: '14',
    allow_creator_extension: 'true',
    max_file_size_mb: '1024',
    sms_enabled: 'false',
    sms_provider: 'kavenegar',
    sms_api_key: '',
    sms_sender_number: '',
    sms_api_url: '',
    login_title: 'شورای تولید و ارزیابی',
    login_subtitle: 'سامانه یکپارچه داوری، تایید و گردش‌کار تولیدات رسانه‌ای و محتوایی',
    login_logo_url: '',
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState('');

  // SMS Rules & Logs state
  const [smsRules, setSmsRules] = useState<SmsRule[]>([]);
  const [smsLogs, setSmsLogs] = useState<SmsLog[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<SmsRule | null>(null);

  // Test SMS State
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('پیامک آزمایشی از سامانه شورای تولید و ارزیابی.');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; simulated?: boolean } | null>(null);

  // Logo upload state
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Rule Form State
  const [ruleEvent, setRuleEvent] = useState<SmsEventType>('PROJECT_CREATED');
  const [ruleTarget, setRuleTarget] = useState<SmsTargetType>('ALL_COUNCIL');
  const [ruleCustomNumbers, setRuleCustomNumbers] = useState('');
  const [ruleSelectedPositions, setRuleSelectedPositions] = useState<string[]>([]);
  const [ruleTemplate, setRuleTemplate] = useState('');
  const [ruleDescription, setRuleDescription] = useState('');
  const [ruleEnabled, setRuleEnabled] = useState(true);

  const isAdmin = currentUser.role === 'ADMIN';

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [settingsRes, rulesRes, logsRes, posRes] = await Promise.all([
        api.getSettings(),
        api.getSmsRules().catch(() => []),
        api.getSmsLogs().catch(() => []),
        api.getPositions().catch(() => []),
      ]);

      if (settingsRes?.settings) {
        setSettings((prev) => ({
          ...prev,
          ...settingsRes.settings,
        }));
        if (settingsRes.settings.login_logo_url) {
          setLogoPreview(settingsRes.settings.login_logo_url);
        }
      }
      setSmsRules(rulesRes || []);
      setSmsLogs(logsRes || []);
      setPositions(posRes || []);
    } catch (e: any) {
      setError(e.message || 'خطا در بارگذاری اطلاعات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
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

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isAdmin) return;
    setSaving(true);
    setError('');
    setSavedSuccess(false);
    try {
      const res = await api.updateSettings(settings);
      setSettings((prev) => ({ ...prev, ...res.settings }));
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);

      // Dispatch live branding event to update Sidebar and LoginModal in real-time
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('council_branding_updated', {
          detail: {
            login_title: settings.login_title,
            login_subtitle: settings.login_subtitle,
            login_logo_url: settings.login_logo_url,
          }
        }));
      }
    } catch (err: any) {
      setError(err.message || 'خطا در ذخیره تنظیمات');
    } finally {
      setSaving(false);
    }
  };

  // Logo upload handler
  const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('لطفاً یک فایل تصویری معتبر انتخاب کنید.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('حجم لوگو نباید بیش از ۵ مگابایت باشد.');
      return;
    }

    setLogoUploading(true);
    try {
      const base64Data = await fileToBase64(file);
      setLogoPreview(base64Data);
      const res = await api.uploadLoginLogo(base64Data, file.name);
      setSettings((prev) => ({
        ...prev,
        login_logo_url: res.logoUrl,
      }));
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);

      // Immediately notify all components of the new logo
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('council_branding_updated', {
          detail: {
            login_title: settings.login_title,
            login_subtitle: settings.login_subtitle,
            login_logo_url: res.logoUrl,
          }
        }));
      }
    } catch (err: any) {
      alert(err.message || 'خطا در بارگذاری لوگو');
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = async () => {
    if (!confirm('آیا مایل به حذف آیکون سفارشی و بازگشت به آیکون پیش‌فرض هستید؟')) return;
    setLogoPreview(null);
    const updated = { ...settings, login_logo_url: '' };
    setSettings(updated);
    try {
      await api.updateSettings(updated);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('council_branding_updated', {
          detail: {
            login_title: settings.login_title,
            login_subtitle: settings.login_subtitle,
            login_logo_url: null,
          }
        }));
      }
    } catch (e: any) {
      setError(e.message || 'خطا در حذف لوگو');
    }
  };

  // Test SMS handler
  const handleSendTestSms = async () => {
    if (!testPhone.trim()) {
      alert('لطفاً شماره موبایل گیرنده پیامک تستی را وارد کنید.');
      return;
    }
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await api.sendTestSms(testPhone.trim(), testMessage.trim());
      setTestResult({
        success: true,
        message: res.message,
        simulated: res.simulated,
      });
      // Refresh logs
      const updatedLogs = await api.getSmsLogs();
      setSmsLogs(updatedLogs);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'خطا در ارسال پیامک آزمایشی',
      });
    } finally {
      setTestSending(false);
    }
  };

  // Rule actions
  const openNewRuleModal = () => {
    setEditingRule(null);
    setRuleEvent('PROJECT_CREATED');
    setRuleTarget('ALL_COUNCIL');
    setRuleCustomNumbers('');
    setRuleSelectedPositions([]);
    setRuleTemplate('طرح جدید «{project_title}» (کد: {project_code}) در شورا ثبت شد و در کارتابل شما قرار گرفت.');
    setRuleDescription('ارسال پیامک اطلاع‌رسانی ثبت پروژه جدید به اعضای شورا');
    setRuleEnabled(true);
    setShowRuleModal(true);
  };

  const openEditRuleModal = (rule: SmsRule) => {
    setEditingRule(rule);
    setRuleEvent(rule.event);
    setRuleTarget(rule.target);
    setRuleCustomNumbers(rule.targetCustomNumbers?.join(', ') || '');
    setRuleSelectedPositions(rule.targetPositionIds || []);
    setRuleTemplate(rule.template);
    setRuleDescription(rule.description || '');
    setRuleEnabled(Boolean(rule.enabled));
    setShowRuleModal(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleTemplate.trim()) {
      alert('متن قالب پیامک الزامی است.');
      return;
    }

    const customNums = ruleCustomNumbers
      .split(/[,،\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 10);

    const ruleData: Partial<SmsRule> = {
      event: ruleEvent,
      target: ruleTarget,
      targetCustomNumbers: customNums,
      targetPositionIds: ruleSelectedPositions,
      template: ruleTemplate.trim(),
      description: ruleDescription.trim(),
      enabled: ruleEnabled,
    };

    try {
      if (editingRule) {
        await api.updateSmsRule(editingRule.id, ruleData);
      } else {
        await api.createSmsRule(ruleData);
      }
      setShowRuleModal(false);
      const updated = await api.getSmsRules();
      setSmsRules(updated);
    } catch (err: any) {
      alert(err.message || 'خطا در ذخیره شرط پیامک');
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('آیا از حذف این شرط پیامک اطمینان دارید؟')) return;
    try {
      await api.deleteSmsRule(ruleId);
      setSmsRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch (err: any) {
      alert(err.message || 'خطا در حذف شرط');
    }
  };

  const handleToggleRule = async (ruleId: string) => {
    try {
      const res = await api.toggleSmsRule(ruleId);
      setSmsRules((prev) =>
        prev.map((r) => (r.id === ruleId ? { ...r, enabled: res.enabled } : r))
      );
    } catch (err: any) {
      alert(err.message || 'خطا در تغییر وضعیت');
    }
  };

  const insertVariableTag = (tag: string) => {
    setRuleTemplate((prev) => `${prev} {${tag}}`);
  };

  const getEventBadge = (event: SmsEventType) => {
    switch (event) {
      case 'PROJECT_CREATED':
        return <span className="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold">تعریف پروژه جدید</span>;
      case 'PROJECT_APPROVED':
        return <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">تایید نهایی پروژه</span>;
      case 'PROJECT_REJECTED':
        return <span className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold">رد نهایی پروژه</span>;
      case 'PROJECT_NEEDS_REVISION':
        return <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">نیازمند اصلاح یا بازنگری</span>;
      case 'NEW_VOTE_CAST':
        return <span className="px-2 py-0.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-bold">ثبت رای توسط عضو شورا</span>;
      case 'PASSWORD_RESET':
        return <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-bold">صدور رمز عبور جدید</span>;
      default:
        return <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[11px]">{event}</span>;
    }
  };

  const getTargetBadge = (target: SmsTargetType) => {
    switch (target) {
      case 'ALL_COUNCIL':
        return 'تمامی اعضای شورا';
      case 'ALL_ADMINS':
        return 'مدیران ارشد سامانه';
      case 'PROJECT_CREATOR':
        return 'طراح و ثبت‌کننده پروژه';
      case 'SPECIFIC_POSITIONS':
        return 'سمت‌های خاص انتخابی';
      case 'CUSTOM_NUMBERS':
        return 'شماره‌های مستقیم دلخواه';
      default:
        return target;
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
          تنظیمات کلان سامانه و ضوابط پیامک و ظاهر فقط در دسترس کاربر ارشد سیستم (مدیرکل / ادمین) قرار دارد.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      
      {/* Top Banner */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200/70 text-indigo-700 flex items-center justify-center shrink-0 shadow-2xs">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900">
                مرکز تنظیمات پیشرفته سامانه
              </h2>
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                مدیر ارشد سیستم
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              پیکربندی مهلت‌های ارزیابی، سامانه پیامک و شرط‌های ارسال خودکار، و شخصی‌سازی عنوان و لوگوی صفحه ورود.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition cursor-pointer"
          title="بازخوانی داده‌ها"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-slate-200/90 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('DEADLINE')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'DEADLINE'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>مهلت و ضوابط ارزیابی و حجم فایل</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('SMS')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'SMS'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span>تنظیمات و شرط‌های پیامک (SMS API)</span>
          {smsRules.length > 0 && (
            <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${activeTab === 'SMS' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {smsRules.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('BRANDING')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'BRANDING'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>عنوان و آیکون صفحه ورود (Branding)</span>
        </button>
      </div>

      {/* Alerts */}
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

      {/* ================= TAB 1: DEADLINE & FILE SIZE ================= */}
      {activeTab === 'DEADLINE' && (
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

          {/* Section 2: File Upload Limits */}
          <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <UploadCloud className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  سقف مجاز حجم فایل‌های پیوست و اسناد طرح‌ها
                </h3>
              </div>
              <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl">
                سقف فعلی: {(() => {
                  const mb = parseInt(settings.max_file_size_mb || '1024', 10);
                  if (mb >= 1024) {
                    const gb = (mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1);
                    return `${gb} گیگابایت (${mb.toLocaleString('fa-IR')} MB)`;
                  }
                  return `${mb.toLocaleString('fa-IR')} مگابایت`;
                })()}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-4">
              <div className="space-y-1">
                <span className="text-xs sm:text-sm font-bold text-slate-900 block">
                  حداکثر اندازه مجاز برای هر فایل (از ۳۰ مگابایت تا ۱۰ گیگابایت)
                </span>
                <p className="text-xs text-slate-500 leading-relaxed">
                  می‌توانید برای پروژه‌ها و مستندات سنگین (ویدیو، فوتیج راش، خروجی‌های مستر تدوین، آرشیو زیپ و PDFهای حجیم) سقف دلخواه را تا ۱۰ گیگابایت (۱۰٬۲۴۰ مگابایت) افزایش دهید.
                </p>
              </div>

              {/* Quick Presets */}
              <div>
                <div className="text-[11px] font-bold text-slate-600 mb-2">
                  انتخاب سریع مقادیر پیشنهادی:
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { label: '۵۰ مگابایت', val: '50' },
                    { label: '۱۰۰ مگابایت', val: '100' },
                    { label: '۵۰۰ مگابایت', val: '500' },
                    { label: '۱ گیگابایت', val: '1024' },
                    { label: '۲ گیگابایت', val: '2048' },
                    { label: '۵ گیگابایت', val: '5120' },
                    { label: '۱۰ گیگابایت (حداکثر)', val: '10240' },
                  ].map((preset) => {
                    const isSelected = settings.max_file_size_mb === preset.val;
                    return (
                      <button
                        key={preset.val}
                        type="button"
                        onClick={() => handleTextChange('max_file_size_mb', preset.val)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Input */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200/60">
                <div className="text-xs text-slate-600">
                  یا وارد کردن عدد دلخواه به مگابایت (MB):
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="10"
                    max="10240"
                    value={settings.max_file_size_mb || '1024'}
                    onChange={(e) => handleTextChange('max_file_size_mb', e.target.value)}
                    className="w-28 rounded-xl bg-white border border-slate-300 px-3 py-2 text-center text-sm font-bold text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
                  />
                  <span className="text-xs font-bold text-slate-600">مگابایت</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white font-bold text-xs sm:text-sm shadow-md shadow-indigo-500/20 transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'در حال ذخیره...' : 'ذخیره ضوابط و تنظیمات'}</span>
            </button>
          </div>
        </form>
      )}

      {/* ================= TAB 2: SMS API & CONDITIONAL RULES ================= */}
      {activeTab === 'SMS' && (
        <div className="space-y-6">
          
          {/* SMS Provider & Gateway Settings */}
          <form onSubmit={handleSave} className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <Smartphone className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  پیکربندی وب‌سرویس پیامک (SMS Gateway)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">ارسال پیامک فعال است؟</span>
                <button
                  type="button"
                  onClick={() => handleToggle('sms_enabled')}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                    settings.sms_enabled === 'true' ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform transform shadow-sm ${
                      settings.sms_enabled === 'true' ? '-translate-x-6' : '-translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Provider Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  ارائه‌دهنده سرویس پیامک (Provider)
                </label>
                <select
                  value={settings.sms_provider || 'kavenegar'}
                  onChange={(e) => handleTextChange('sms_provider', e.target.value)}
                  className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
                >
                  <option value="smsir">سامانه پیامک SMS.ir (نسخه جدید API v2 / Bulk)</option>
                  <option value="kavenegar">کاوه نگار (Kavenegar)</option>
                  <option value="farazsms">فراز اس‌ام‌اس / IPPanel</option>
                  <option value="ghasedak">قاصدک (Ghasedak)</option>
                  <option value="custom">سرویس دلخواه سفارشی (Custom API Webhook)</option>
                </select>
              </div>

              {/* Sender Line Number */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center justify-between">
                  <span>شماره خط اختصاصی ارسال‌کننده (Sender Line)</span>
                  {settings.sms_provider === 'smsir' && (
                    <span className="text-[10px] text-indigo-600 font-bold">Line Number در پنل SMS.ir</span>
                  )}
                </label>
                <input
                  type="text"
                  value={settings.sms_sender_number || ''}
                  onChange={(e) => handleTextChange('sms_sender_number', e.target.value)}
                  placeholder={settings.sms_provider === 'smsir' ? 'مثال: 30007777 یا خط اختصاصی' : 'مثال: 10008585 یا 983000...'}
                  className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-xs sm:text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
                  dir="ltr"
                />
              </div>

              {/* API Key */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center justify-between">
                  <span>
                    کلید اتصال / توکن دسترسی وب‌سرویس (API Key / Token)
                    {settings.sms_provider === 'smsir' && (
                      <span className="mr-1.5 text-indigo-700 font-bold">(هدر X-API-KEY در SMS.ir)</span>
                    )}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    در صورت خالی بودن کلید، سیستم به صورت شبیه‌سازی (Simulation) پیامک‌ها را ثبت می‌کند.
                  </span>
                </label>
                <input
                  type="password"
                  value={settings.sms_api_key || ''}
                  onChange={(e) => handleTextChange('sms_api_key', e.target.value)}
                  placeholder={
                    settings.sms_provider === 'smsir'
                      ? 'کلید API وب‌سرویس SMS.ir (دریافت از منوی برنامه‌نویسان / Developer پنل)'
                      : 'کلید API وب‌سرویس پیامک را اینجا وارد کنید...'
                  }
                  className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-xs sm:text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
                  dir="ltr"
                />
                {settings.sms_provider === 'smsir' && (
                  <p className="text-[11px] text-indigo-700 mt-1.5 bg-indigo-50 border border-indigo-100 p-2 rounded-xl flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      <strong>پشتیبانی از مستندات رسمی SMS.ir:</strong> درخواست‌ها به متد <code>https://api.sms.ir/v1/send/bulk</code> با هدر <code>X-API-KEY</code> و پارامترهای استاندارد <code>lineNumber</code>، <code>messageText</code> و <code>mobiles</code> ارسال می‌گردند.
                    </span>
                  </p>
                )}
              </div>

              {settings.sms_provider === 'custom' && (
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    آدرس وب‌سرویس سفارشی (Custom API Endpoint URL)
                  </label>
                  <input
                    type="url"
                    value={settings.sms_api_url || ''}
                    onChange={(e) => handleTextChange('sms_api_url', e.target.value)}
                    placeholder="https://sms.example.com/api/send"
                    className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-xs sm:text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
                    dir="ltr"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-500/20 transition cursor-pointer flex items-center gap-2"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'در حال ذخیره...' : 'ذخیره تنظیمات درگاه پیامک'}</span>
              </button>
            </div>
          </form>

          {/* Test SMS Box */}
          <div className="p-6 rounded-3xl bg-slate-50 border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
              <Send className="w-4 h-4 text-indigo-600" />
              <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                ابزار تست زنده ارسال پیامک
              </h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  شماره موبایل تست:
                </label>
                <input
                  type="text"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="0912..."
                  className="w-full rounded-xl bg-white border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:border-indigo-500 shadow-2xs"
                  dir="ltr"
                />
              </div>

              <div className="md:col-span-2 flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    متن پیام تست:
                  </label>
                  <input
                    type="text"
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    className="w-full rounded-xl bg-white border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 shadow-2xs"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSendTestSms}
                  disabled={testSending}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shrink-0 shadow-xs disabled:opacity-50"
                >
                  <Send className={`w-3.5 h-3.5 ${testSending ? 'animate-spin' : ''}`} />
                  <span>{testSending ? 'در حال ارسال...' : 'ارسال تست'}</span>
                </button>
              </div>
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  testResult.success
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>
                  {testResult.message}{' '}
                  {testResult.simulated && (
                    <strong className="text-amber-800 font-bold">(حالت شبیه‌سازی - به علت عدم ورود API Key واقعی)</strong>
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Conditional Rules Engine (شرط‌های ارسال پیامک) */}
          <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 flex-wrap gap-2">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    موتور شرط‌های هوشمند ارسال پیامک
                  </h3>
                </div>
                <p className="text-xs text-slate-500">
                  تعریف کنید روی چه رویدادهایی (تعریف، تایید، رد یا اصلاح پروژه) به چه اشخاص یا سمت‌هایی پیامک ارسال شود.
                </p>
              </div>

              <button
                type="button"
                onClick={openNewRuleModal}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>تعریف شرط پیامک جدید</span>
              </button>
            </div>

            {/* Rules List */}
            {smsRules.length > 0 ? (
              <div className="space-y-3">
                {smsRules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`p-4 rounded-2xl border transition duration-150 flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                      rule.enabled
                        ? 'bg-slate-50/70 border-slate-200 hover:border-indigo-200'
                        : 'bg-slate-100/60 border-slate-200 opacity-60'
                    }`}
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getEventBadge(rule.event)}
                        <span className="text-xs text-slate-400">← گیرندگان:</span>
                        <span className="text-xs font-bold text-indigo-700 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                          {getTargetBadge(rule.target)}
                        </span>
                        {rule.description && (
                          <span className="text-xs text-slate-600 font-medium truncate">
                            ({rule.description})
                          </span>
                        )}
                      </div>

                      <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 text-xs text-slate-800 leading-relaxed font-mono">
                        {rule.template}
                      </div>

                      {rule.target === 'CUSTOM_NUMBERS' && rule.targetCustomNumbers && rule.targetCustomNumbers.length > 0 && (
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <span>شماره‌ها:</span>
                          <span className="font-mono">{rule.targetCustomNumbers.join(' ، ')}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                      {/* Toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggleRule(rule.id)}
                        className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                          rule.enabled
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200'
                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                        }`}
                      >
                        {rule.enabled ? 'فعال' : 'غیرفعال'}
                      </button>

                      {/* Edit */}
                      <button
                        type="button"
                        onClick={() => openEditRuleModal(rule)}
                        className="p-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 transition cursor-pointer"
                        title="ویرایش شرط"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1.5 rounded-xl bg-white hover:bg-rose-50 border border-slate-200 text-rose-500 transition cursor-pointer"
                        title="حذف شرط"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center rounded-2xl bg-slate-50 border border-dashed border-slate-300 text-slate-500 text-xs">
                هنوز هیچ شرطی برای ارسال خودکار پیامک تعریف نشده است. با کلیک بر روی دکمه «تعریف شرط پیامک جدید» اولین شرط را بسازید.
              </div>
            )}
          </div>

          {/* SMS Logs Table */}
          <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                  تاریخچه پیامک‌های ارسال‌شده اخیر
                </h4>
              </div>
              <span className="text-[11px] text-slate-500">
                {smsLogs.length} پیامک ثبت شده
              </span>
            </div>

            {smsLogs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 bg-slate-50/70">
                      <th className="p-2.5 font-bold">گیرنده</th>
                      <th className="p-2.5 font-bold">رویداد</th>
                      <th className="p-2.5 font-bold">متن پیامک</th>
                      <th className="p-2.5 font-bold">وضعیت</th>
                      <th className="p-2.5 font-bold">زمان</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {smsLogs.slice(0, 30).map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/60">
                        <td className="p-2.5 font-mono text-slate-800" dir="ltr">
                          {log.recipientPhone}
                        </td>
                        <td className="p-2.5">
                          {getEventBadge(log.event as SmsEventType)}
                        </td>
                        <td className="p-2.5 text-slate-700 max-w-xs truncate" title={log.message}>
                          {log.message}
                        </td>
                        <td className="p-2.5">
                          {log.status === 'SENT' && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              ارسال موفق
                            </span>
                          )}
                          {log.status === 'SIMULATED' && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">
                              شبیه‌سازی
                            </span>
                          )}
                          {log.status === 'FAILED' && (
                            <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[10px] font-bold" title={log.error || ''}>
                              ناموفق
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-slate-400 font-mono text-[11px]" dir="ltr">
                          {new Date(log.createdAt).toLocaleDateString('fa-IR')} {new Date(log.createdAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-400">
                هنوز هیچ رویداد پیامکی ثبت نشده است.
              </div>
            )}
          </div>

        </div>
      )}

      {/* ================= TAB 3: BRANDING & LOGIN PAGE ================= */}
      {activeTab === 'BRANDING' && (
        <form onSubmit={handleSave} className="space-y-6">
          <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-6">
            <div className="pb-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-indigo-600" />
                <span>شخصی‌سازی عنوان و آیکون صفحه ورود به سامانه</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                می‌توانید عنوان «شورای تولید و ارزیابی» و تصویر آیکون بالای کادر ورود را به آرم سازمان، اداره یا پروژه خود تغییر دهید.
              </p>
            </div>

            {/* Title Editing */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-800">
                عنوان اصلی صفحه ورود (Login Title) *
              </label>
              <input
                type="text"
                value={settings.login_title || 'شورای تولید و ارزیابی'}
                onChange={(e) => handleTextChange('login_title', e.target.value)}
                placeholder="مثال: شورای تولید و ارزیابی سازمان صدا و سیما"
                className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
                required
              />
            </div>

            {/* Subtitle Editing */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-800">
                زیرعنوان و شعار صفحه ورود (Login Subtitle)
              </label>
              <input
                type="text"
                value={settings.login_subtitle || ''}
                onChange={(e) => handleTextChange('login_subtitle', e.target.value)}
                placeholder="سامانه یکپارچه داوری، تایید و گردش‌کار تولیدات رسانه‌ای و محتوایی"
                className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
              />
            </div>

            {/* Logo Image Upload & Preview */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <label className="block text-xs font-bold text-slate-800">
                آیکون / لوگوی تصویری صفحه ورود
              </label>

              <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                {/* Logo Preview */}
                <div className="w-24 h-24 rounded-2xl bg-white border-2 border-dashed border-indigo-300 flex items-center justify-center p-2 shadow-xs overflow-hidden shrink-0">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="لوگوی ورود"
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-indigo-400">
                      <ImageIcon className="w-8 h-8" />
                      <span className="text-[10px] mt-1 font-bold">لوگوی پیش‌فرض</span>
                    </div>
                  )}
                </div>

                {/* Upload Actions */}
                <div className="space-y-2 flex-1 text-center sm:text-right">
                  <div className="text-xs font-bold text-slate-900">
                    {logoPreview ? 'تصویر لوگوی اختصاصی بارگذاری شده است' : 'هنوز تصویر اختصاصی بارگذاری نشده است'}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    تصویر انتخاب‌شده با ابعاد متناسب در صفحه ورود و بالای فرم قرار خواهد گرفت. فرمت‌های مجاز: PNG، JPG، WebP، SVG (حداکثر ۵ مگابایت).
                  </p>

                  <div className="flex flex-wrap items-center gap-2 pt-1 justify-center sm:justify-start">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoSelect}
                    />

                    <button
                      type="button"
                      disabled={logoUploading}
                      onClick={() => logoInputRef.current?.click()}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                    >
                      <UploadCloud className="w-4 h-4" />
                      <span>{logoUploading ? 'در حال بارگذاری...' : 'انتخاب و بارگذاری لوگوی جدید'}</span>
                    </button>

                    {logoPreview && (
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="px-3 py-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-bold text-xs transition cursor-pointer flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف لوگو و بازگشت به پیش‌فرض</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Live Visual Preview Card */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-950 text-white shadow-xl space-y-3">
              <div className="text-[11px] font-bold text-indigo-300 flex items-center gap-1.5">
                <Eye className="w-4 h-4" />
                <span>پیش‌نمایش زنده نحوه نمایش در هدر صفحه لاگین:</span>
              </div>
              <div className="flex flex-col items-center justify-center py-4 space-y-2 text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md p-2 flex items-center justify-center border border-white/20 shadow-lg">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <Layers className="w-8 h-8 text-indigo-400" />
                  )}
                </div>
                <h2 className="text-lg font-black tracking-tight text-white">
                  {settings.login_title || 'شورای تولید و ارزیابی'}
                </h2>
                <p className="text-xs text-indigo-200/80 max-w-md">
                  {settings.login_subtitle || 'سامانه یکپارچه داوری، تایید و گردش‌کار تولیدات رسانه‌ای و محتوایی'}
                </p>
              </div>
            </div>

          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white font-bold text-xs sm:text-sm shadow-md shadow-indigo-500/20 transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'در حال ذخیره...' : 'ذخیره تغییرات عنوان و لوگو'}</span>
            </button>
          </div>
        </form>
      )}

      {/* ================= MODAL: CREATE / EDIT SMS RULE ================= */}
      {showRuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  {editingRule ? 'ویرایش شرط پیامک' : 'تعریف شرط هوشمند پیامک جدید'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRuleModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRule} className="p-6 space-y-4">
              
              {/* Event Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  ۱. رویداد فعال‌ساز ارسال پیامک (Trigger Event) *
                </label>
                <select
                  value={ruleEvent}
                  onChange={(e) => setRuleEvent(e.target.value as SmsEventType)}
                  className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500 shadow-2xs"
                >
                  <option value="PROJECT_CREATED">ثبت و تعریف پروژه جدید در شورا (PROJECT_CREATED)</option>
                  <option value="PROJECT_APPROVED">تایید نهایی پروژه توسط شورا (PROJECT_APPROVED)</option>
                  <option value="PROJECT_REJECTED">رد نهایی پروژه توسط شورا (PROJECT_REJECTED)</option>
                  <option value="PROJECT_NEEDS_REVISION">اعلام نیاز به اصلاح و بازنگری پروژه (PROJECT_NEEDS_REVISION)</option>
                  <option value="NEW_VOTE_CAST">ثبت رای جدید توسط داوران (NEW_VOTE_CAST)</option>
                  <option value="PASSWORD_RESET">صدور رمز عبور جدید توسط مدیر ارشد (PASSWORD_RESET)</option>
                </select>
              </div>

              {/* Target Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  ۲. گیرندگان پیامک (Target Audience) *
                </label>
                <select
                  value={ruleTarget}
                  onChange={(e) => setRuleTarget(e.target.value as SmsTargetType)}
                  className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500 shadow-2xs"
                >
                  <option value="ALL_COUNCIL">تمامی اعضای دارای حق رای در شورا</option>
                  <option value="ALL_ADMINS">مدیران ارشد سامانه (Admins)</option>
                  <option value="PROJECT_CREATOR">ثبت‌کننده و طراح پروژه</option>
                  <option value="SPECIFIC_POSITIONS">سمت‌های سازمانی خاص انتخابی</option>
                  <option value="CUSTOM_NUMBERS">شماره موبایل‌های مستقیم و دلخواه</option>
                </select>
              </div>

              {/* Specific Positions Checkboxes */}
              {ruleTarget === 'SPECIFIC_POSITIONS' && (
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <label className="block text-[11px] font-bold text-slate-700">
                    سمت‌های سازمانی مدنظر را انتخاب کنید:
                  </label>
                  <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto">
                    {positions.map((pos) => (
                      <label key={pos.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ruleSelectedPositions.includes(pos.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setRuleSelectedPositions((prev) => [...prev, pos.id]);
                            } else {
                              setRuleSelectedPositions((prev) => prev.filter((id) => id !== pos.id));
                            }
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>{pos.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom Phone Numbers */}
              {ruleTarget === 'CUSTOM_NUMBERS' && (
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    شماره موبایل‌های گیرنده (با کاما یا سرخط جدا کنید):
                  </label>
                  <textarea
                    rows={2}
                    value={ruleCustomNumbers}
                    onChange={(e) => setRuleCustomNumbers(e.target.value)}
                    placeholder="09121234567, 09359876543"
                    className="w-full rounded-xl bg-white border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:border-indigo-500 shadow-2xs"
                    dir="ltr"
                  />
                </div>
              )}

              {/* Template & Tags */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-800">
                    ۳. متن قالب پیامک *
                  </label>
                  <span className="text-[10px] text-slate-400">کلیک روی متغیرها برای درج در متن</span>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[
                    { tag: 'project_title', label: 'نام پروژه' },
                    { tag: 'project_code', label: 'کد پروژه' },
                    { tag: 'creator_name', label: 'نام ثبت‌کننده' },
                    { tag: 'status', label: 'وضعیت شورا' },
                    { tag: 'date', label: 'تاریخ شمسی' },
                  ].map((v) => (
                    <button
                      key={v.tag}
                      type="button"
                      onClick={() => insertVariableTag(v.tag)}
                      className="px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-[10px] font-bold transition cursor-pointer"
                    >
                      +{v.label} ({`{${v.tag}}`})
                    </button>
                  ))}
                </div>

                <textarea
                  rows={3}
                  value={ruleTemplate}
                  onChange={(e) => setRuleTemplate(e.target.value)}
                  placeholder="متن پیامک با متغیرها..."
                  className="w-full rounded-xl bg-white border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 shadow-2xs leading-relaxed"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  توضیح یا یادداشت این شرط (اختیاری):
                </label>
                <input
                  type="text"
                  value={ruleDescription}
                  onChange={(e) => setRuleDescription(e.target.value)}
                  placeholder="مثال: اطلاع‌رسانی به دبیرخانه پس از ثبت پروژه"
                  className="w-full rounded-xl bg-white border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 shadow-2xs"
                />
              </div>

              {/* Enabled toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="ruleEnabled"
                  checked={ruleEnabled}
                  onChange={(e) => setRuleEnabled(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="ruleEnabled" className="text-xs font-bold text-slate-800 cursor-pointer">
                  این شرط اکنون فعال و آماده ارسال باشد
                </label>
              </div>

              {/* Form Footer */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRuleModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-500/20 transition cursor-pointer"
                >
                  {editingRule ? 'ذخیره تغییرات' : 'ثبت شرط پیامک'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
