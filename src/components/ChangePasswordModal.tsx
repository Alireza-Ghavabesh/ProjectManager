import React, { useState } from 'react';
import { api } from '../services/api';
import { User } from '../types';
import { 
  Lock, 
  Key, 
  Eye, 
  EyeOff, 
  X, 
  CheckCircle2, 
  AlertCircle,
  Save,
  ShieldCheck
} from 'lucide-react';

interface ChangePasswordModalProps {
  currentUser: User;
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  currentUser,
  onClose,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('تمامی فیلدها الزامی هستند.');
      return;
    }

    if (newPassword.length < 4) {
      setError('رمز عبور جدید باید حداقل ۴ کاراکتر باشد.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('رمز عبور جدید و تکرار آن یکسان نیستند.');
      return;
    }

    if (currentPassword === newPassword) {
      setError('رمز عبور جدید نمی‌تواند مشابه رمز عبور فعلی باشد.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await api.changePassword(currentPassword, newPassword);
      setSuccess(res.message || 'رمز عبور شما با موفقیت تغییر یافت.');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'خطا در تغییر رمز عبور');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-800">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                تغییر رمز عبور حساب کاربری
              </h3>
              <p className="text-[11px] text-slate-500">
                کاربر: {currentUser.name} (@{currentUser.username})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="m-4 mb-0 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="m-4 mb-0 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Current Password */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              رمز عبور فعلی *
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="رمز عبور فعلی خود را وارد فرمایید"
                className="w-full rounded-xl bg-slate-50 border border-slate-300 pr-3.5 pl-10 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500 shadow-2xs text-right"
                dir="rtl"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute left-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              رمز عبور جدید *
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="حداقل ۴ کاراکتر"
                className="w-full rounded-xl bg-slate-50 border border-slate-300 pr-3.5 pl-10 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500 shadow-2xs text-right"
                dir="rtl"
                required
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute left-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm New Password */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              تکرار رمز عبور جدید *
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="رمز عبور جدید را مجدداً وارد فرمایید"
              className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500 shadow-2xs text-right"
              dir="rtl"
              required
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{loading ? 'در حال ثبت...' : 'ثبت رمز عبور جدید'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
