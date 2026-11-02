import React, { useState } from 'react';
import { api } from '../services/api';
import { User } from '../types';
import { Shield, UserCheck, Key, Lock, ArrowLeft, Building2 } from 'lucide-react';

interface LoginModalProps {
  onSuccess: (user: User) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (u: string, p: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.login(u, p);
      onSuccess(data.user);
    } catch (err: any) {
      setError(err.message || 'خطا در ورود به سامانه');
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('لطفاً نام کاربری و رمز عبور را وارد فرمایید.');
      return;
    }
    handleLogin(username, password);
  };

  const demoAccounts = [
    {
      title: 'مدیر و دبیر جلسه (ادمین)',
      name: 'مهندس علیرضا علوی',
      pos: 'دبیر شورا و مدیر جلسه',
      user: 'admin',
      pass: 'admin123',
      color: 'from-amber-600 to-amber-700',
      badge: 'ادمین سیستم',
    },
    {
      title: 'عضو شورا (ناظر کیفی)',
      name: 'دکتر فاطمه رضایی',
      pos: 'ناظر کیفی و محتوایی',
      user: 'rezaei',
      pass: '123456',
      color: 'from-emerald-600 to-emerald-700',
      badge: 'عضو شورا',
    },
    {
      title: 'عضو شورا (مدیر فنی)',
      name: 'مهندس سهراب تهرانی',
      pos: 'مدیر فنی و تصویربرداری',
      user: 'tehrani',
      pass: '123456',
      color: 'from-cyan-600 to-cyan-700',
      badge: 'عضو شورا',
    },
    {
      title: 'عضو شورا (کارشناس مالی)',
      name: 'مریم سادات حسینی',
      pos: 'کارشناس برآورد و مالی',
      user: 'hoseini',
      pass: '123456',
      color: 'from-purple-600 to-purple-700',
      badge: 'عضو شورا',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 -right-20 w-96 h-96 bg-blue-100 rounded-full blur-3xl pointer-events-none opacity-60" />
      <div className="absolute bottom-1/4 -left-20 w-96 h-96 bg-indigo-100 rounded-full blur-3xl pointer-events-none opacity-60" />

      <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-3xl shadow-xl p-6 sm:p-10 relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20 mb-4">
            <Building2 className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            سامانه کارتابل و مصوبات شورای پروژه
          </h1>
          <p className="text-slate-500 text-sm mt-2 max-w-md mx-auto leading-relaxed">
            سیستم هوشمند ارزیابی، رای‌گیری محرمانه اعضای شورا، تصمیم‌گیری بر اساس رای اکثریت و مدیریت پویای فیلدهای تولید
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Direct Login Form */}
          <div className="lg:col-span-5 bg-slate-50 p-6 rounded-2xl border border-slate-200">
            <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Lock className="w-4 h-4 text-blue-600" />
              ورود با نام کاربری و رمز
            </h2>
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  نام کاربری
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="مثال: admin یا rezaei"
                    className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition"
                    dir="ltr"
                  />
                  <UserCheck className="absolute left-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  رمز عبور
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full rounded-xl bg-white border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition"
                    dir="ltr"
                  />
                  <Key className="absolute left-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 rounded-xl bg-blue-600 hover:bg-blue-700 py-3 text-sm font-semibold text-white shadow-sm transition cursor-pointer disabled:opacity-50"
              >
                {loading ? 'در حال بررسی اطلاعات...' : 'ورود به کارتابل شورا'}
              </button>
            </form>
          </div>

          {/* Quick Demo Switcher */}
          <div className="lg:col-span-7">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-500" />
                ورود سریع تستی (جهت بررسی عملکرد نقش‌ها)
              </h2>
              <span className="text-xs text-slate-500">یک کلیک برای ورود</span>
            </div>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              جهت تست تفاوت دسترسی مدیر (دیدن تمام آرا و فیلدهای تفصیلی) با اعضای شورا (محرمانگی کامل آرا)، روی هریک از کاربران زیر کلیک نمایید:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {demoAccounts.map((acc) => (
                <button
                  key={acc.user}
                  type="button"
                  onClick={() => handleLogin(acc.user, acc.pass)}
                  disabled={loading}
                  className="group text-right p-3.5 rounded-xl bg-white hover:bg-blue-50/50 border border-slate-200 hover:border-blue-300 shadow-2xs transition duration-200 cursor-pointer flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between w-full mb-2">
                    <span className="text-xs font-bold text-slate-900 group-hover:text-blue-700 transition">
                      {acc.name}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                      {acc.badge}
                    </span>
                  </div>
                  <div className="text-[11px] text-blue-700 font-medium mb-3">
                    سمت: {acc.pos}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100 w-full">
                    <span>یوزر: {acc.user}</span>
                    <span className="flex items-center gap-1 text-blue-600 font-bold group-hover:translate-x-[-3px] transition">
                      ورود
                      <ArrowLeft className="w-3 h-3" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-100 text-center text-xs text-slate-400">
          دیتابیس سیستم: SQLite فایل‌بیس (council.db) — فرانت‌اند: React + Tailwind CSS — بک‌اند: Express API
        </div>
      </div>
    </div>
  );
};
