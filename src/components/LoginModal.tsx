import React, { useState } from 'react';
import { api } from '../services/api';
import { User } from '../types';
import { Lock, UserCheck, Key, Building2, Eye, EyeOff } from 'lucide-react';

interface LoginModalProps {
  onSuccess: (user: User) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <div className="min-h-screen bg-slate-100/80 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Subtle background decoration */}
      <div className="absolute top-1/4 -right-20 w-96 h-96 bg-indigo-100/50 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -left-20 w-96 h-96 bg-blue-100/50 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-3xl shadow-xl p-8 sm:p-10 relative z-10 animate-in fade-in zoom-in-95 duration-200 text-slate-800">
        
        {/* Brand Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/25 mb-4">
            <Building2 className="w-8 h-8" />
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            شورای تولید و ارزیابی
          </h1>
          <p className="text-xs text-slate-500 mt-2 font-medium">
            سامانه جامع کارتابل مصوبات و مدیریت طرح‌ها
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              نام کاربری
            </label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="نام کاربری سازمانی"
                autoComplete="username"
                className="w-full rounded-xl bg-slate-50 border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
                dir="ltr"
                required
              />
              <UserCheck className="absolute left-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              رمز عبور
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="رمز عبور"
                autoComplete="current-password"
                className="w-full rounded-xl bg-slate-50 border border-slate-300 px-4 py-2.5 pl-10 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
                dir="ltr"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-3 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                title={showPassword ? 'مخفی‌سازی رمز' : 'نمایش رمز'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 py-3 text-xs sm:text-sm font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4" />
            <span>{loading ? 'در حال بررسی...' : 'ورود به سامانه کارتابل'}</span>
          </button>
        </form>

        <div className="mt-8 pt-5 border-t border-slate-100 text-center text-[11px] text-slate-400">
          دسترسی و ورود صرفاً مختص اعضای رسمی شورا و دبیرخانه می‌باشد.
        </div>

      </div>
    </div>
  );
};
