import React, { useState } from 'react';
import { Project } from '../types';
import { api, formatFileSize } from '../services/api';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  ShieldCheck, 
  X, 
  MessageSquare, 
  Clock,
  Paperclip,
  Download,
  FileText,
  Coins,
  Calendar,
  Lock,
  PackageCheck
} from 'lucide-react';
import { formatBudgetDisplay, isDeadlineExpired } from '../utils/formatters';

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

  const isExpired = project.isDeadlineExpired ?? isDeadlineExpired(project.deadline);

  const handleSubmitVote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExpired) {
      setError('مهلت ارزیابی این پروژه به پایان رسیده است و امکان ثبت یا ویرایش رای وجود ندارد.');
      return;
    }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-3xl bg-white border border-slate-200/90 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-800">
        
        {/* Header (Fixed at top) */}
        <div className="shrink-0 flex items-center justify-between px-5 sm:px-6 py-3.5 border-b border-slate-100 bg-slate-50/95">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs">
              {project.code}
            </span>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                {project.userVote ? 'ویرایش و بازبینی رای شما' : 'ثبت رای و نظر کارشناسی در شورا'}
              </h3>
              <p className="text-[11px] text-slate-500">
                طرح: {project.title}
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

        {/* Form Container */}
        <form onSubmit={handleSubmitVote} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          
          {/* Unified Scrollable Body - Everything is inside this container */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
            
            {/* Project Summary Banner */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900">
                  {project.title}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 font-medium">
                  {project.productionType || 'طرح عمومی'}
                </span>
              </div>

              {/* Meta items: Budget and Deadline */}
              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                {project.budgetEstimated && (
                  <div className="flex items-center gap-1.5 text-slate-700 bg-white px-2.5 py-1 rounded-xl border border-slate-200/60 shadow-2xs">
                    <Coins className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span className="text-slate-500">برآورد بودجه:</span>
                    <span className="font-bold text-slate-900">{formatBudgetDisplay(project.budgetEstimated)}</span>
                  </div>
                )}
                {project.deadline && (
                  <div className="flex items-center gap-1.5 text-slate-700 bg-white px-2.5 py-1 rounded-xl border border-slate-200/60 shadow-2xs">
                    <Calendar className={`w-3.5 h-3.5 shrink-0 ${isExpired ? 'text-rose-600' : 'text-indigo-600'}`} />
                    <span className="text-slate-500">مهلت ارزیابی:</span>
                    <span className={`font-bold ${isExpired ? 'text-rose-700' : 'text-slate-900'}`}>{project.deadline}</span>
                    {isExpired && (
                      <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-1 py-0.2 rounded">منقضی</span>
                    )}
                  </div>
                )}
                {project.deliveryDate && (
                  <div className="flex items-center gap-1.5 text-slate-700 bg-white px-2.5 py-1 rounded-xl border border-slate-200/60 shadow-2xs">
                    <PackageCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="text-slate-500">تاریخ تحویل:</span>
                    <span className="font-bold text-slate-900">{project.deliveryDate}</span>
                  </div>
                )}
              </div>

              {/* Description with exact whitespace and newline preservation */}
              {project.description && (
                <div className="text-xs text-slate-700 leading-relaxed bg-white p-3 rounded-xl border border-slate-200/70 shadow-2xs whitespace-pre-wrap">
                  {project.description}
                </div>
              )}
            </div>

            {/* Expired Warning Banner */}
            {isExpired && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 shadow-2xs">
                <Lock className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed text-[11px]">
                  <strong className="text-rose-900 block font-bold mb-0.5">مهلت قانونی ارزیابی این پروژه به پایان رسیده است</strong>
                  امکان ثبت یا تغییر رای در کارتابل غیرفعال شده است. ثبت‌کننده طرح یا مدیر ارشد سیستم با ویرایش پروژه و تمدید تاریخ مهلت می‌توانند فرآیند رای‌گیری را مجدداً بازگشایی کنند.
                </div>
              </div>
            )}

            {/* Attached documents preview */}
            {project.attachments && project.attachments.length > 0 && (
              <div className="pt-2">
                <div className="text-xs font-bold text-slate-800 mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-indigo-600" />
                    <span>اسناد و فایل‌های پیوست جهت بررسی طرح:</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-semibold bg-slate-100 px-2 py-0.5 rounded-md">
                    {project.attachments.length} فایل پیوست
                  </span>
                </div>
                <div className="space-y-1.5">
                  {project.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="p-2.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 transition flex items-center justify-between gap-2 text-xs shadow-2xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span className="font-semibold text-slate-900 truncate" dir="ltr">{att.fileName}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({formatFileSize(att.fileSize)})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => api.downloadAttachment(att.id, att.fileName)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition cursor-pointer shrink-0"
                      >
                        <Download className="w-3 h-3" />
                        <span>دانلود فایل</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Confidentiality Notice */}
            <div className="p-3 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 text-indigo-950 text-xs flex items-start gap-2.5 shadow-2xs">
              <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed text-[11px]">
                <strong className="text-indigo-900">اصل محرمانگی آرا: </strong>
                رای و توضیحات ثبت شده شما کاملاً محرمانه بوده و صرفاً برای تصمیم‌گیری شورا اعمال می‌شود.
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* 3 Voting Status Options - Responsive Grid */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-2.5">
                تصمیم شما در خصوص این پروژه (انتخاب از ۳ حالت):
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                
                {/* 1. APPROVE */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStatus('APPROVED');
                    setError('');
                  }}
                  className={`flex flex-col items-center justify-center p-3.5 sm:p-4 rounded-2xl border transition duration-150 cursor-pointer text-center ${
                    selectedStatus === 'APPROVED'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-xs ring-2 ring-emerald-500/20'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/30'
                  }`}
                >
                  <CheckCircle2 className={`w-6 h-6 sm:w-7 sm:h-7 mb-1.5 ${selectedStatus === 'APPROVED' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span className="font-bold text-xs sm:text-sm">موافق / تایید</span>
                  <span className="text-[10px] text-slate-500 mt-0.5">تایید عوامل و طرح</span>
                </button>

                {/* 2. REJECT */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStatus('REJECTED');
                    setError('');
                  }}
                  className={`flex flex-col items-center justify-center p-3.5 sm:p-4 rounded-2xl border transition duration-150 cursor-pointer text-center ${
                    selectedStatus === 'REJECTED'
                      ? 'bg-rose-50 border-rose-500 text-rose-900 shadow-xs ring-2 ring-rose-500/20'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-rose-300 hover:bg-rose-50/30'
                  }`}
                >
                  <XCircle className={`w-6 h-6 sm:w-7 sm:h-7 mb-1.5 ${selectedStatus === 'REJECTED' ? 'text-rose-600' : 'text-slate-400'}`} />
                  <span className="font-bold text-xs sm:text-sm">مخالف / رد</span>
                  <span className="text-[10px] text-slate-500 mt-0.5">عدم تایید کلی طرح</span>
                </button>

                {/* 3. NEEDS REVISION */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStatus('NEEDS_REVISION');
                    setError('');
                  }}
                  className={`flex flex-col items-center justify-center p-3.5 sm:p-4 rounded-2xl border transition duration-150 cursor-pointer text-center ${
                    selectedStatus === 'NEEDS_REVISION'
                      ? 'bg-amber-50 border-amber-500 text-amber-950 shadow-xs ring-2 ring-amber-500/20'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-amber-300 hover:bg-amber-50/30'
                  }`}
                >
                  <AlertTriangle className={`w-6 h-6 sm:w-7 sm:h-7 mb-1.5 ${selectedStatus === 'NEEDS_REVISION' ? 'text-amber-600' : 'text-slate-400'}`} />
                  <span className="font-bold text-xs sm:text-sm">نیاز به اصلاح</span>
                  <span className="text-[10px] text-amber-800 font-bold mt-0.5">شرح دلیل اجباری</span>
                </button>

              </div>
            </div>

            {/* Reason / Explanation Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                  <span>شرح نظر و ادله کارشناسی:</span>
                </label>
                {selectedStatus === 'NEEDS_REVISION' ? (
                  <span className="text-[10px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md">
                    الزامی برای نیاز به اصلاح *
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400">اختیاری</span>
                )}
              </div>

              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  selectedStatus === 'NEEDS_REVISION'
                    ? 'موارد و بندهای نیازمند اصلاح و بازبینی را ذکر نمایید (الزامی)...'
                    : 'توضیحات و ملاحظات تکمیلی خود را در صورت تمایل یادداشت فرمایید (اختیاری)...'
                }
                className={`w-full rounded-2xl bg-white border px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none transition leading-relaxed shadow-2xs whitespace-pre-wrap ${
                  selectedStatus === 'NEEDS_REVISION' && !reason.trim()
                    ? 'border-amber-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500'
                    : 'border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                }`}
              />
            </div>

            {/* Previous vote indicator if updating */}
            {project.userVote && (
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5 p-2 rounded-xl bg-slate-50 border border-slate-200/60">
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>شما قبلاً در تاریخ {new Date(project.userVote.votedAt).toLocaleDateString('fa-IR')} رای داده‌اید؛ ثبت مجدد، رای شما را به‌روزرسانی می‌کند.</span>
              </div>
            )}

          </div>

          {/* Sticky Actions Footer (Always visible at bottom) */}
          <div className="shrink-0 px-4 sm:px-6 py-3 border-t border-slate-200/90 bg-slate-50/95 flex items-center justify-between gap-3">
            <div className="text-[11px] text-slate-500 hidden sm:block">
              رای شما پس از ثبت قطعی و در آمار شورا اعمال خواهد شد.
            </div>
            <div className="flex items-center gap-2 mr-auto w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-initial px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 transition cursor-pointer text-center"
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={loading || isExpired}
                className="flex-1 sm:flex-initial px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-center"
              >
                {loading ? 'در حال ثبت...' : isExpired ? 'مهلت ارزیابی پایان یافته' : 'ثبت قطعی رای شورا'}
              </button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
};
