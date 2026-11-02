import React, { useState } from 'react';
import { Project, User } from '../types';
import { api } from '../services/api';
import { 
  GitBranch, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Clock, 
  X, 
  MessageSquare, 
  Send,
  History
} from 'lucide-react';

interface WorkflowTransitionModalProps {
  project: Project;
  currentUser: User;
  onClose: () => void;
  onSuccess: () => void;
}

export const WorkflowTransitionModal: React.FC<WorkflowTransitionModalProps> = ({
  project,
  currentUser,
  onClose,
  onSuccess,
}) => {
  const [action, setAction] = useState<'FORWARD' | 'NEEDS_REVISION' | 'REJECTED'>('FORWARD');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const steps = project.workflowSteps || [];
  const currentStepIndex = (project.currentStepOrder || 1) - 1;
  const currentStep = steps[currentStepIndex];
  const nextStep = steps[currentStepIndex + 1];
  const logs = project.workflowLogs || [];

  const handleTransition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (action === 'NEEDS_REVISION' && !comment.trim()) {
      setError('ثبت توضیحات و موارد اصلاحی جهت عودت در گردش کار الزامی است.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.transitionWorkflow(project.id, {
        action,
        comment: comment.trim(),
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'خطا در ارجاع گردش کار');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-2xl rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                ارجاع و گردش کار سازمانی پروژه
              </h3>
              <p className="text-xs text-blue-700 font-semibold">
                {project.code} — {project.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="m-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            {error}
          </div>
        )}

        {/* Workflow Progression Roadmap */}
        <div className="p-5 border-b border-slate-100 bg-slate-50/40">
          <div className="text-xs font-bold text-slate-600 mb-3 flex items-center justify-between">
            <span>مراحل طی‌شده در چارت سازمانی:</span>
            <span className="text-blue-700 font-bold bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-200">
              گام {project.currentStepOrder || 1} از {steps.length}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {steps.map((st, idx) => {
              const isPast = (project.currentStepOrder || 1) > st.stepOrder;
              const isCurrent = (project.currentStepOrder || 1) === st.stepOrder;

              return (
                <div
                  key={st.id}
                  className={`p-3 rounded-2xl border text-center transition ${
                    isCurrent
                      ? 'bg-blue-50 border-blue-500 shadow-xs ring-2 ring-blue-500/20'
                      : isPast
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : 'bg-white border-slate-200 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-center mb-1">
                    {isPast ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : isCurrent ? (
                      <Clock className="w-4 h-4 text-blue-600 animate-pulse" />
                    ) : (
                      <span className="w-4 h-4 rounded-full border border-slate-300 text-[10px] flex items-center justify-center font-bold text-slate-400">
                        {idx + 1}
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-bold truncate text-slate-900">
                    {st.title}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate mt-0.5">
                    {st.positionTitle}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Form */}
        <form onSubmit={handleTransition} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              انتخاب اقدام در این مرحله از گردش کار:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              
              <button
                type="button"
                onClick={() => setAction('FORWARD')}
                className={`p-3 rounded-2xl border text-center transition cursor-pointer flex flex-col items-center justify-center ${
                  action === 'FORWARD'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/50'
                }`}
              >
                <CheckCircle2 className="w-5 h-5 mb-1 text-emerald-600" />
                <span className="text-xs font-bold">تایید و ارجاع به بعد</span>
                <span className="text-[10px] text-slate-500 mt-0.5 truncate max-w-full">
                  {nextStep ? `به: ${nextStep.title}` : 'تصویب نهایی'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setAction('NEEDS_REVISION')}
                className={`p-3 rounded-2xl border text-center transition cursor-pointer flex flex-col items-center justify-center ${
                  action === 'NEEDS_REVISION'
                    ? 'bg-amber-50 border-amber-500 text-amber-800 ring-2 ring-amber-500/20 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-amber-300 hover:bg-amber-50/50'
                }`}
              >
                <AlertTriangle className="w-5 h-5 mb-1 text-amber-600" />
                <span className="text-xs font-bold">عودت جهت اصلاح</span>
                <span className="text-[10px] text-slate-500 mt-0.5">
                  بازگشت به گام قبل
                </span>
              </button>

              <button
                type="button"
                onClick={() => setAction('REJECTED')}
                className={`p-3 rounded-2xl border text-center transition cursor-pointer flex flex-col items-center justify-center ${
                  action === 'REJECTED'
                    ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/20 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-rose-300 hover:bg-rose-50/50'
                }`}
              >
                <XCircle className="w-5 h-5 mb-1 text-rose-600" />
                <span className="text-xs font-bold">رد در این مرحله</span>
                <span className="text-[10px] text-slate-500 mt-0.5">
                  خروج از گردش کار
                </span>
              </button>

            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                <span>هامش، دلایل یا توضیحات ارجاع:</span>
              </label>
              {action === 'NEEDS_REVISION' && (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                  الزامی برای عودت
                </span>
              )}
            </div>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="دستور، نظر کارشناسی یا توضیحات برای ارجاع به سمت بعدی..."
              className="w-full rounded-2xl bg-slate-50 border border-slate-300 px-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white leading-relaxed transition"
            />
          </div>

          {/* Past Transition History Logs */}
          {logs.length > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-blue-600" />
                <span>سوابق ارجاعات و امضاهای قبلی این طرح:</span>
              </h4>
              <div className="space-y-2 max-h-36 overflow-y-auto">
                {logs.map((l) => (
                  <div
                    key={l.id}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                  >
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-bold text-slate-900 flex items-center gap-1">
                        <span>{l.fromUserName}</span>
                        {l.fromUserPosition && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 rounded font-semibold">
                            {l.fromUserPosition}
                          </span>
                        )}
                      </span>
                      <span className="text-slate-400 text-[10px]">
                        {new Date(l.createdAt).toLocaleDateString('fa-IR')}
                      </span>
                    </div>
                    {l.comment && (
                      <p className="text-slate-600 text-[11px] leading-relaxed">
                        {l.comment}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-xs text-slate-600 hover:bg-slate-100 cursor-pointer transition"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-2 transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{loading ? 'در حال ثبت...' : 'ثبت ارجاع در گردش کار'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
