import React, { useState } from 'react';
import { PasswordResetRequest } from '../types';
import { api } from '../services/api';
import { 
  Key, 
  X, 
  Check, 
  Clock, 
  Phone, 
  RotateCcw, 
  CheckCircle2, 
  Sparkles,
  AlertCircle,
  Copy
} from 'lucide-react';

interface AdminPasswordResetsModalProps {
  requests: PasswordResetRequest[];
  onClose: () => void;
  onRefresh: () => void;
}

export const AdminPasswordResetsModal: React.FC<AdminPasswordResetsModalProps> = ({
  requests,
  onClose,
  onRefresh,
}) => {
  const [newPasswordInput, setNewPasswordInput] = useState<{ [key: string]: string }>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'RESOLVED'>('PENDING');

  const pendingCount = requests.filter((r) => r.status === 'PENDING').length;

  const filteredRequests = requests.filter((r) => {
    if (filter === 'PENDING') return r.status === 'PENDING';
    if (filter === 'RESOLVED') return r.status !== 'PENDING';
    return true;
  });

  const handleResolve = async (req: PasswordResetRequest, action: 'APPROVE' | 'REJECT') => {
    const pass = newPasswordInput[req.id]?.trim() || `pass${Math.floor(1000 + Math.random() * 9000)}`;
    if (action === 'APPROVE' && pass.length < 4) {
      alert('رمز عبور جدید باید حداقل ۴ کاراکتر باشد.');
      return;
    }

    setActionLoading(true);
    setFeedbackMsg('');
    try {
      const res = await api.resolvePasswordResetRequest(req.id, action, action === 'APPROVE' ? pass : undefined);
      setFeedbackMsg(res.message);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'خطا در بررسی درخواست');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-2xl rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-800 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  کارتابل درخواست‌های فراموشی رمز عبور
                </h3>
                {pendingCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500 text-white font-extrabold animate-pulse">
                    {pendingCount} درخواست جدید
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                تعیین رمز عبور جدید برای اعضای شورا و ارسال مستقیم نتیجه به صفحه ورود کاربر
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

        {/* Filter bar */}
        <div className="px-5 py-3 border-b border-slate-100 bg-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFilter('PENDING')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                filter === 'PENDING'
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              در انتظار تایید ({pendingCount})
            </button>
            <button
              onClick={() => setFilter('RESOLVED')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                filter === 'RESOLVED'
                  ? 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              رسیدگی‌شده ({requests.length - pendingCount})
            </button>
            <button
              onClick={() => setFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                filter === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              همه ({requests.length})
            </button>
          </div>

          <button
            onClick={onRefresh}
            className="p-1.5 text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
            title="بروزرسانی"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">بروزرسانی</span>
          </button>
        </div>

        {feedbackMsg && (
          <div className="m-4 mb-0 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{feedbackMsg}</span>
          </div>
        )}

        {/* Body list */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1">
          {filteredRequests.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs space-y-2">
              <Key className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="font-bold text-slate-600">درخواستی در این بخش وجود ندارد.</div>
              <p className="text-[11px] text-slate-400">
                هر زمان کاربری در صفحه لاگین درخواست تغییر رمز بدهد، بلافاصله در این قسمت نمایان می‌شود.
              </p>
            </div>
          ) : (
            filteredRequests.map((req) => {
              const isPending = req.status === 'PENDING';
              const isApproved = req.status === 'APPROVED';

              return (
                <div
                  key={req.id}
                  className={`p-4 rounded-2xl border transition space-y-3 ${
                    isPending
                      ? 'bg-amber-50/40 border-amber-300 ring-1 ring-amber-200/60'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs sm:text-sm font-bold text-slate-900">
                          {req.fullName || req.username}
                        </span>
                        <span className="text-xs text-slate-500 font-mono" dir="ltr">
                          @{req.username}
                        </span>
                        {isPending && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-bold">
                            در انتظار رمز جدید
                          </span>
                        )}
                        {isApproved && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold">
                            تایید شده
                          </span>
                        )}
                        {req.status === 'REJECTED' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 font-bold">
                            رد شده
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-[11px] text-slate-500 mt-1 flex-wrap">
                        {req.phone && (
                          <span className="flex items-center gap-1 text-slate-600" dir="ltr">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {req.phone}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {new Date(req.requestedAt).toLocaleString('fa-IR')}
                        </span>
                      </div>
                    </div>

                    {isApproved && req.newPassword && (
                      <div className="text-left bg-white px-2.5 py-1.5 rounded-xl border border-emerald-300 text-xs shrink-0">
                        <div className="text-[10px] text-emerald-800 font-bold mb-0.5">رمز عبور ارسالی:</div>
                        <div className="font-mono font-bold text-slate-900 text-xs" dir="ltr">
                          {req.newPassword}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Pending Form */}
                  {isPending && (
                    <div className="pt-2 border-t border-amber-200/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                      <div className="flex items-center gap-1.5 flex-1">
                        <input
                          type="text"
                          value={newPasswordInput[req.id] || ''}
                          onChange={(e) =>
                            setNewPasswordInput({ ...newPasswordInput, [req.id]: e.target.value })
                          }
                          placeholder="رمز جدید (مثلاً: pass123)"
                          className="w-full sm:w-44 rounded-xl bg-white border border-slate-300 px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 shadow-2xs"
                          dir="ltr"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setNewPasswordInput({
                              ...newPasswordInput,
                              [req.id]: `pass${Math.floor(1000 + Math.random() * 9000)}`,
                            })
                          }
                          className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-700 transition cursor-pointer shrink-0"
                          title="تولید خودکار رمز عبور تصادفی"
                        >
                          تولید رمز
                        </button>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleResolve(req, 'APPROVE')}
                          disabled={actionLoading}
                          className="flex-1 sm:flex-none px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>تایید و ارسال رمز جدید</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResolve(req, 'REJECT')}
                          disabled={actionLoading}
                          className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-medium transition cursor-pointer disabled:opacity-50"
                        >
                          رد
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>کاربر پس از تایید مدیر، می‌تواند در صفحه لاگین با زدن «پیگیری» رمز جدید را مشاهده کند.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-300 text-xs text-slate-700 hover:bg-slate-100 cursor-pointer font-medium"
          >
            بستن
          </button>
        </div>

      </div>
    </div>
  );
};
