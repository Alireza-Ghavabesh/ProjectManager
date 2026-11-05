import React, { useState } from 'react';
import { api } from '../services/api';
import { User, PasswordResetRequest } from '../types';
import { 
  Lock, 
  UserCheck, 
  Key, 
  Building2, 
  Eye, 
  EyeOff, 
  HelpCircle, 
  ArrowRight, 
  Send, 
  CheckCircle2, 
  Clock, 
  Copy, 
  Check, 
  AlertCircle,
  Phone
} from 'lucide-react';

interface LoginModalProps {
  onSuccess: (user: User) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onSuccess }) => {
  const [mode, setMode] = useState<'login' | 'forgot'>('login');

  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Forgot password form state
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotPhone, setForgotPhone] = useState('');
  const [forgotNote, setForgotNote] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [forgotError, setForgotError] = useState('');

  // Tracking request status
  const [checkStatusLoading, setCheckStatusLoading] = useState(false);
  const [requestStatus, setRequestStatus] = useState<PasswordResetRequest | null>(null);
  const [copiedPass, setCopiedPass] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('لطفاً نام کاربری و رمز عبور را وارد فرمایید.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await api.login(username.trim(), password);
      onSuccess(data.user);
    } catch (err: any) {
      setError(err.message || 'نام کاربری یا رمز عبور اشتباه است.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotUsername.trim()) {
      setForgotError('نام کاربری الزامی است.');
      return;
    }

    setForgotLoading(true);
    setForgotError('');
    setForgotSuccess('');
    setRequestStatus(null);

    try {
      const res = await api.forgotPassword(forgotUsername.trim(), forgotPhone.trim() || undefined, forgotNote.trim() || undefined);
      setForgotSuccess(res.message || 'درخواست شما با موفقیت برای مدیر سیستم ارسال شد.');
      // Auto check status
      handleCheckStatus();
    } catch (err: any) {
      setForgotError(err.message || 'خطا در ثبت درخواست');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    const u = forgotUsername.trim() || username.trim();
    if (!u) {
      setForgotError('ابتدا نام کاربری را وارد فرمایید.');
      return;
    }

    setCheckStatusLoading(true);
    setForgotError('');
    try {
      const res = await api.getResetStatus(u);
      if (res.found && res.request) {
        setRequestStatus(res.request);
      } else {
        setForgotError('درخواست بازیابی برای این نام کاربری یافت نشد.');
        setRequestStatus(null);
      }
    } catch (err: any) {
      setForgotError(err.message || 'خطا در استعلام وضعیت');
    } finally {
      setCheckStatusLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPass(true);
    setTimeout(() => setCopiedPass(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-100/80 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Subtle background decoration */}
      <div className="absolute top-1/4 -right-20 w-96 h-96 bg-indigo-100/50 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -left-20 w-96 h-96 bg-blue-100/50 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-3xl shadow-xl p-7 sm:p-10 relative z-10 animate-in fade-in zoom-in-95 duration-200 text-slate-800">
        
        {/* Brand Logo & Title */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/25 mb-4">
            <Building2 className="w-8 h-8" />
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            شورای تولید و ارزیابی
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            سامانه جامع کارتابل مصوبات و مدیریت طرح‌ها
          </p>
        </div>

        {/* ======================= MODE 1: STANDARD LOGIN ======================= */}
        {mode === 'login' && (
          <>
            {error && (
              <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Username Field */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  نام کاربری
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="نام کاربری (مثلاً: admin یا نام کاربری شما)"
                    autoComplete="username"
                    className="w-full rounded-xl bg-slate-50 border border-slate-300 pr-10 pl-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition shadow-2xs text-right"
                    dir="rtl"
                    required
                  />
                  <UserCheck className="absolute right-3.5 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    رمز عبور
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotUsername(username);
                      setError('');
                      setForgotError('');
                      setForgotSuccess('');
                      setRequestStatus(null);
                      setMode('forgot');
                    }}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition cursor-pointer hover:underline flex items-center gap-1"
                  >
                    <HelpCircle className="w-3 h-3" />
                    <span>فراموشی رمز عبور؟</span>
                  </button>
                </div>

                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="رمز عبور حساب"
                    autoComplete="current-password"
                    className="w-full rounded-xl bg-slate-50 border border-slate-300 pr-10 pl-10 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition shadow-2xs text-right"
                    dir="rtl"
                    required
                  />
                  <Key className="absolute right-3.5 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3.5 top-3.5 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                    title={showPassword ? 'مخفی‌سازی رمز' : 'نمایش رمز'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Quick-fill helper for default admin credentials */}
              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setUsername('admin');
                    setPassword('admin123');
                  }}
                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition cursor-pointer hover:underline flex items-center gap-1"
                >
                  <span>درج خودکار مشخصات مدیر پیش‌فرض (admin)</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-98 py-3 text-xs sm:text-sm font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" />
                <span>{loading ? 'در حال بررسی...' : 'ورود به سامانه کارتابل'}</span>
              </button>
            </form>
          </>
        )}

        {/* ======================= MODE 2: FORGOT PASSWORD REQUEST ======================= */}
        {mode === 'forgot' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Key className="w-4 h-4 text-indigo-600" />
                <span>درخواست بازیابی و صدور رمز عبور جدید</span>
              </h3>
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer font-medium"
              >
                <span>بازگشت به ورود</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              نام کاربری خود را وارد فرمایید تا درخواست تغییر رمز مستقیماً در کارتابل مدیر شورا ثبت شود. مدیر پس از بررسی، رمز جدیدی برای شما تنظیم خواهد کرد.
            </p>

            {forgotError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{forgotError}</span>
              </div>
            )}

            {forgotSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{forgotSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSendForgotRequest} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  نام کاربری شما در سامانه *
                </label>
                <input
                  type="text"
                  value={forgotUsername}
                  onChange={(e) => setForgotUsername(e.target.value)}
                  placeholder="مثال: rezaei یا tehrani"
                  className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-indigo-500 shadow-2xs text-right"
                  dir="rtl"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  شماره موبایل جهت هماهنگی (اختیاری)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={forgotPhone}
                    onChange={(e) => setForgotPhone(e.target.value)}
                    placeholder="0912xxxxxxx"
                    className="w-full rounded-xl bg-slate-50 border border-slate-300 pr-9 pl-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-indigo-500 shadow-2xs"
                    dir="ltr"
                  />
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                </div>
              </div>

              <div className="pt-1 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{forgotLoading ? 'در حال ارسال...' : 'ارسال درخواست به کارتابل مدیر'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCheckStatus}
                  disabled={checkStatusLoading}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  title="استعلام وضعیت درخواست‌های قبلی"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>پیگیری</span>
                </button>
              </div>
            </form>

            {/* Status Details Card if checked */}
            {requestStatus && (
              <div className="mt-4 p-4 rounded-2xl border bg-slate-50 space-y-2 text-xs animate-in fade-in duration-200">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="font-bold text-slate-800">وضعیت درخواست:</span>
                  {requestStatus.status === 'PENDING' && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-300 flex items-center gap-1 text-[11px]">
                      <Clock className="w-3 h-3" />
                      در انتظار بررسی مدیر
                    </span>
                  )}
                  {requestStatus.status === 'APPROVED' && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-300 flex items-center gap-1 text-[11px]">
                      <CheckCircle2 className="w-3 h-3" />
                      تایید شده (رمز جدید صادر شد)
                    </span>
                  )}
                  {requestStatus.status === 'REJECTED' && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold border border-rose-300 text-[11px]">
                      درخواست رد شد
                    </span>
                  )}
                </div>

                {requestStatus.status === 'PENDING' && (
                  <p className="text-slate-600 text-[11px] leading-relaxed">
                    درخواست شما در تاریخ {new Date(requestStatus.requestedAt).toLocaleDateString('fa-IR')} ثبت شده و به زودی توسط مدیر شورا تعیین رمز خواهد شد. لطفاً دقایقی دیگر با همین نام کاربری مجدداً دکمه پیگیری را لمس فرمایید.
                  </p>
                )}

                {requestStatus.status === 'APPROVED' && requestStatus.newPassword && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                    <div className="text-[11px] text-emerald-900 font-bold">
                      رمز عبور جدید توسط مدیر ({requestStatus.resolvedByName || 'مدیر سیستم'}) صادر شد:
                    </div>
                    <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-emerald-300 font-mono text-sm text-slate-900 font-bold" dir="ltr">
                      <span>{requestStatus.newPassword}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(requestStatus.newPassword || '')}
                        className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-sans flex items-center gap-1 cursor-pointer"
                      >
                        {copiedPass ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedPass ? 'کپی شد' : 'کپی رمز'}</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setUsername(requestStatus.username);
                        setPassword(requestStatus.newPassword || '');
                        setMode('login');
                      }}
                      className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <span>ورود مستقیم با رمز جدید</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-7 pt-4 border-t border-slate-100 text-center text-[11px] text-slate-400">
          سامانه کارتابل مصوبات و ارزیابی شورا • ورود امن دو مرحله‌ای
        </div>

      </div>
    </div>
  );
};
