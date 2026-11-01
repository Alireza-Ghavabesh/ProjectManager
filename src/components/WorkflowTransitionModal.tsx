import React, { useState } from 'react';
import { Project, User, WorkflowStep, WorkflowLog } from '../types';
import { api } from '../services/api';
import { 
  GitBranch, 
  ArrowLeft, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Clock, 
  X, 
  MessageSquare, 
  Send,
  History,
  Briefcase
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-2xl rounded-3xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                ارجاع و گردش کار سازمانی پروژه
              </h3>
              <p className="text-xs text-cyan-400 font-medium">
                {project.code} — {project.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="m-5 p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
            {error}
          </div>
        )}

        {/* Workflow Progression Roadmap */}
        <div className="p-5 border-b border-slate-800/80 bg-slate-950/30">
          <div className="text-xs font-bold text-slate-400 mb-3 flex items-center justify-between">
            <span>مراحل طی‌شده در چارت سازمانی:</span>
            <span className="text-cyan-400 font-bold">
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
                      ? 'bg-cyan-950/70 border-cyan-500 shadow-md ring-2 ring-cyan-500/30'
                      : isPast
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-950/60 border-slate-800 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-center mb-1">
                    {isPast ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : isCurrent ? (
                      <Clock className="w-4 h-4 text-cyan-400 animate-pulse" />
                    ) : (
                      <span className="w-4 h-4 rounded-full border border-slate-700 text-[10px] flex items-center justify-center font-bold">
                        {idx + 1}
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-bold truncate text-white">
                    {st.title}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
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
            <label className="block text-xs font-bold text-slate-200 mb-2">
              انتخاب اقدام در این مرحله از گردش کار:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              
              <button
                type="button"
                onClick={() => setAction('FORWARD')}
                className={`p-3 rounded-2xl border text-center transition cursor-pointer flex flex-col items-center justify-center ${
                  action === 'FORWARD'
                    ? 'bg-emerald-950/50 border-emerald-500 text-emerald-300 ring-2 ring-emerald-500/40'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-emerald-600/40'
                }`}
              >
                <CheckCircle2 className="w-5 h-5 mb-1 text-emerald-400" />
                <span className="text-xs font-bold">تایید و ارجاع به بعد</span>
                <span className="text-[10px] text-slate-400 mt-0.5 truncate max-w-full">
                  {nextStep ? `به: ${nextStep.title}` : 'تصویب نهایی'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setAction('NEEDS_REVISION')}
                className={`p-3 rounded-2xl border text-center transition cursor-pointer flex flex-col items-center justify-center ${
                  action === 'NEEDS_REVISION'
                    ? 'bg-amber-950/50 border-amber-500 text-amber-300 ring-2 ring-amber-500/40'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-amber-600/40'
                }`}
              >
                <AlertTriangle className="w-5 h-5 mb-1 text-amber-400" />
                <span className="text-xs font-bold">عودت جهت اصلاح</span>
                <span className="text-[10px] text-slate-400 mt-0.5">
                  بازگشت به گام قبل
                </span>
              </button>

              <button
                type="button"
                onClick={() => setAction('REJECTED')}
                className={`p-3 rounded-2xl border text-center transition cursor-pointer flex flex-col items-center justify-center ${
                  action === 'REJECTED'
                    ? 'bg-rose-950/50 border-rose-500 text-rose-300 ring-2 ring-rose-500/40'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-rose-600/40'
                }`}
              >
                <XCircle className="w-5 h-5 mb-1 text-rose-400" />
                <span className="text-xs font-bold">رد در این مرحله</span>
                <span className="text-[10px] text-slate-400 mt-0.5">
                  خروج از گردش کار
                </span>
              </button>

            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
                <span>هامش، دلایل یا توضیحات ارجاع:</span>
              </label>
              {action === 'NEEDS_REVISION' && (
                <span className="text-[10px] font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded">
                  الزامی برای عودت
                </span>
              )}
            </div>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="دستور، نظر کارشناسی یا توضیحات برای ارجاع به سمت بعدی..."
              className="w-full rounded-2xl bg-slate-950 border border-slate-700 px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 leading-relaxed"
            />
          </div>

          {/* Past Transition History Logs */}
          {logs.length > 0 && (
            <div className="pt-3 border-t border-slate-800">
              <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-cyan-400" />
                <span>سوابق ارجاعات و امضاهای قبلی این طرح:</span>
              </h4>
              <div className="space-y-2 max-h-36 overflow-y-auto">
                {logs.map((l) => (
                  <div
                    key={l.id}
                    className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs"
                  >
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-bold text-white flex items-center gap-1">
                        <span>{l.fromUserName}</span>
                        {l.fromUserPosition && (
                          <span className="text-[9px] px-1 bg-slate-800 text-cyan-400 rounded">
                            {l.fromUserPosition}
                          </span>
                        )}
                      </span>
                      <span className="text-slate-500 text-[10px]">
                        {new Date(l.createdAt).toLocaleDateString('fa-IR')}
                      </span>
                    </div>
                    {l.comment && (
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        {l.comment}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-xs font-bold text-white shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-2"
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
