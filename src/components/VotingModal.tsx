import React, { useState } from 'react';
import { Project } from '../types';
import { api } from '../services/api';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  ShieldCheck, 
  X, 
  MessageSquare, 
  Clock,
  Sparkles
} from 'lucide-react';

interface VotingModalProps {
  project: Project;
  onClose: () => void;
  onVoteSuccess: () => void;
}

export const VotingModal: React.FC<VotingModalProps> = ({
  project,
  onClose,
  onVoteSuccess,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<'APPROVED' | 'REJECTED' | 'NEEDS_REVISION' | null>(
    project.userVote?.status || null
  );
  const [reason, setReason] = useState(project.userVote?.reason || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmitVote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStatus) {
      setError('لطفاً یکی از ۳ وضعیت رای (تایید، رد یا نیاز به اصلاح) را انتخاب فرمایید.');
      return;
    }

    // MANDATORY REQUIREMENT: If 'NEEDS_REVISION', reason must NOT be empty!
    if (selectedStatus === 'NEEDS_REVISION' && !reason.trim()) {
      setError('ثبت شرح دلیل و جزئیات موارد اصلاحی برای وضعیت «نیاز به اصلاح» اجباری است.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await api.submitVote(project.id, selectedStatus, reason);
      onVoteSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'خطا در ثبت رای شورا');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-xl rounded-3xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/40">
          <div>
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              کد پروژه: {project.code}
            </span>
            <h3 className="text-base sm:text-lg font-bold text-white mt-1">
              ثبت رای و نظر کارشناسی در کارتابل شورا
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Project info preview */}
        <div className="p-5 border-b border-slate-800/80 bg-slate-900/40">
          <div className="text-xs text-slate-400 mb-1">نام پروژه:</div>
          <div className="text-sm font-semibold text-white mb-2">{project.title}</div>
          {project.description && (
            <div className="text-xs text-slate-300 leading-relaxed bg-slate-950/50 p-3 rounded-xl border border-slate-800">
              {project.description}
            </div>
          )}
        </div>

        {/* Confidentiality Notice */}
        <div className="mx-5 mt-4 p-3.5 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 text-cyan-200 text-xs flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold text-cyan-300">اصل محرمانگی آرا: </span>
            رای و توضیحات ثبت شده شما صرفاً برای مدیر و دبیر جلسه شورا قابل رویت خواهد بود و سایر اعضای شورا به هیچ وجه از رای شما مطلع نخواهند شد.
          </div>
        </div>

        <form onSubmit={handleSubmitVote} className="p-5 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
              <span>{error}</span>
            </div>
          )}

          {/* 3 Voting Status Options */}
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-2.5">
              تصمیم شما در خصوص این پروژه (انتخاب از ۳ حالت):
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              
              {/* 1. APPROVE */}
              <button
                type="button"
                onClick={() => {
                  setSelectedStatus('APPROVED');
                  setError('');
                }}
                className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition duration-150 cursor-pointer text-center ${
                  selectedStatus === 'APPROVED'
                    ? 'bg-emerald-950/50 border-emerald-500 text-emerald-300 shadow-lg shadow-emerald-950/50 ring-2 ring-emerald-500/50'
                    : 'bg-slate-800/60 border-slate-700/70 text-slate-300 hover:border-emerald-600/50 hover:bg-slate-800'
                }`}
              >
                <CheckCircle2 className={`w-7 h-7 mb-2 ${selectedStatus === 'APPROVED' ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span className="font-bold text-sm">موافق / تایید</span>
                <span className="text-[10px] text-slate-400 mt-1">تایید عوامل و کلیات</span>
              </button>

              {/* 2. REJECT */}
              <button
                type="button"
                onClick={() => {
                  setSelectedStatus('REJECTED');
                  setError('');
                }}
                className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition duration-150 cursor-pointer text-center ${
                  selectedStatus === 'REJECTED'
                    ? 'bg-rose-950/50 border-rose-500 text-rose-300 shadow-lg shadow-rose-950/50 ring-2 ring-rose-500/50'
                    : 'bg-slate-800/60 border-slate-700/70 text-slate-300 hover:border-rose-600/50 hover:bg-slate-800'
                }`}
              >
                <XCircle className={`w-7 h-7 mb-2 ${selectedStatus === 'REJECTED' ? 'text-rose-400' : 'text-slate-400'}`} />
                <span className="font-bold text-sm">مخالف / رد</span>
                <span className="text-[10px] text-slate-400 mt-1">عدم تایید کلی طرح</span>
              </button>

              {/* 3. NEEDS REVISION */}
              <button
                type="button"
                onClick={() => {
                  setSelectedStatus('NEEDS_REVISION');
                  setError('');
                }}
                className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition duration-150 cursor-pointer text-center ${
                  selectedStatus === 'NEEDS_REVISION'
                    ? 'bg-amber-950/50 border-amber-500 text-amber-300 shadow-lg shadow-amber-950/50 ring-2 ring-amber-500/50'
                    : 'bg-slate-800/60 border-slate-700/70 text-slate-300 hover:border-amber-600/50 hover:bg-slate-800'
                }`}
              >
                <AlertTriangle className={`w-7 h-7 mb-2 ${selectedStatus === 'NEEDS_REVISION' ? 'text-amber-400' : 'text-slate-400'}`} />
                <span className="font-bold text-sm">نیاز به اصلاح</span>
                <span className="text-[10px] text-amber-400/90 font-semibold mt-1">شرح دلیل اجباری</span>
              </button>

            </div>
          </div>

          {/* Reason / Explanation Field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
                <span>شرح نظر و ادله کارشناسی:</span>
              </label>
              {selectedStatus === 'NEEDS_REVISION' ? (
                <span className="text-[11px] font-bold text-amber-400 bg-amber-950/60 border border-amber-500/40 px-2 py-0.5 rounded-md">
                  الزامی برای نیاز به اصلاح *
                </span>
              ) : (
                <span className="text-[11px] text-slate-400">اختیاری</span>
              )}
            </div>

            <textarea
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                selectedStatus === 'NEEDS_REVISION'
                  ? 'لطفاً بندها، تعداد عوامل، لوکیشن یا مواردی که باید توسط تهیه‌کننده اصلاح شوند را به تفصیل بنویسید (الزامی)...'
                  : 'توضیحات تکمیلی یا ملاحظات تخصصی خود را در صورت تمایل یادداشت فرمایید...'
              }
              className={`w-full rounded-2xl bg-slate-950 border px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none transition leading-relaxed ${
                selectedStatus === 'NEEDS_REVISION' && !reason.trim()
                  ? 'border-amber-500/70 focus:border-amber-400'
                  : 'border-slate-700 focus:border-cyan-500'
              }`}
            />
          </div>

          {/* Previous vote indicator if updating */}
          {project.userVote && (
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>شما قبلاً در تاریخ {new Date(project.userVote.votedAt).toLocaleDateString('fa-IR')} رای داده‌اید؛ ثبت مجدد، رای قبلی شما را بروزرسانی می‌کند.</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-xs font-bold text-white shadow-lg shadow-cyan-600/25 transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? 'در حال ثبت در کارتابل...' : 'ثبت قطعی رای شورا'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
