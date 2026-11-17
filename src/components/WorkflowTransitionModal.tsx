import React, { useState } from 'react';
import { Project, User } from '../types';
import { api } from '../services/api';
import { hasPerm } from '../utils/permissions';
import { getActionBadgeMeta } from '../utils/workflowActions';
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
  const [adminOverride, setAdminOverride] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const steps = project.workflowSteps || [];
  const currentStepIndex = Math.max(0, (project.currentStepOrder || 1) - 1);
  const currentStep = steps[currentStepIndex];
  const nextStep = steps[currentStepIndex + 1];
  const logs = project.workflowLogs || [];
  const stepProgress = project.currentStepApprovalProgress;
  const currentApprovalMode = currentStep?.config?.approvalMode || stepProgress?.mode || 'SINGLE';
  const currentVoteCollectionMode =
    currentStep?.config?.voteCollectionMode || stepProgress?.voteCollectionMode || 'EARLY_DECIDE';
  const isCompletedOrRejected = project.status === 'APPROVED' || project.status === 'REJECTED';
  const currentPosIds =
    project.currentPositionIds && project.currentPositionIds.length > 0
      ? project.currentPositionIds
      : project.currentPositionId
      ? [project.currentPositionId]
      : [];
  const isAssignee = Boolean(
    project.isMyWorkflowTurn ||
      project.currentAssignees?.some((a) => a.id === currentUser.id) ||
      (currentUser.positionId && currentPosIds.includes(currentUser.positionId))
  );
  const canSubmitAction =
    !isCompletedOrRejected &&
    (isAssignee || (currentUser.role === 'ADMIN' && adminOverride));
  const canViewWorkflowHistory = hasPerm(currentUser, [
    'workflow.history.view',
    'voting.confidential.view_all',
  ]);
  const showQuorumBar =
    Boolean(stepProgress) &&
    (currentApprovalMode === 'MAJORITY' ||
      currentApprovalMode === 'ALL' ||
      currentVoteCollectionMode === 'WAIT_ALL') &&
    !isCompletedOrRejected;

  const approveTargetLabel = (() => {
    const cfg = currentStep?.config;
    if (cfg?.approveTarget === 'END_APPROVED') return 'تصویب نهایی و اتمام';
    if (cfg?.approveTarget === 'CUSTOM_STEP' && cfg.onApproveStepOrder) {
      const tStep = steps.find((s) => s.stepOrder === cfg.onApproveStepOrder);
      return tStep ? `به گام ${tStep.stepOrder}: ${tStep.title}` : `به گام ${cfg.onApproveStepOrder}`;
    }
    return nextStep ? `به: ${nextStep.title}` : 'تصویب نهایی';
  })();

  const revisionTargetLabel = (() => {
    const cfg = currentStep?.config;
    const rule = cfg?.onRevisionAction || cfg?.onRejectAction || 'RETURN_PREV';
    if (rule === 'RETURN_CREATOR') return 'بازگشت به گام ۱';
    if (rule === 'REJECT_PROJECT') return 'رد و مختومه شدن طرح';
    if (rule === 'CUSTOM_STEP') {
      const ord = cfg?.onRevisionStepOrder ?? cfg?.onRejectStepOrder ?? 1;
      const tStep = steps.find((s) => s.stepOrder === ord);
      return tStep ? `ارجاع به گام ${tStep.stepOrder}: ${tStep.title}` : `ارجاع به گام ${ord}`;
    }
    return 'بازگشت به گام قبل';
  })();

  const rejectTargetLabel = (() => {
    const cfg = currentStep?.config;
    const rule =
      cfg?.onRevisionAction !== undefined
        ? cfg?.onRejectAction || 'REJECT_PROJECT'
        : cfg?.onRejectAction === 'RETURN_CREATOR' || cfg?.onRejectAction === 'CUSTOM_STEP'
        ? cfg.onRejectAction
        : 'REJECT_PROJECT';
    if (rule === 'RETURN_CREATOR') return 'بازگشت به گام ۱';
    if (rule === 'RETURN_PREV') return 'بازگشت به گام قبل';
    if (rule === 'CUSTOM_STEP' && cfg?.onRejectStepOrder) {
      const tStep = steps.find((s) => s.stepOrder === cfg.onRejectStepOrder);
      return tStep ? `ارجاع به گام ${tStep.stepOrder}: ${tStep.title}` : `ارجاع به گام ${cfg.onRejectStepOrder}`;
    }
    return 'رد و خروج از گردش کار';
  })();

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
        adminOverride: !isAssignee && currentUser.role === 'ADMIN' ? adminOverride : undefined,
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
        <div className="p-5 border-b border-slate-100 bg-slate-50/40 space-y-3">
          <div className="text-xs font-bold text-slate-600 flex items-center justify-between">
            <span>مراحل طی‌شده در چارت سازمانی:</span>
            <span className="text-blue-700 font-bold bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-200 tabular-nums">
              گام {project.currentStepOrder || 1} از {steps.length}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {steps.map((st, idx) => {
              const isPast = project.status === 'APPROVED' || (project.currentStepOrder || 1) > st.stepOrder;
              const isCurrent =
                project.status !== 'APPROVED' &&
                project.status !== 'REJECTED' &&
                (project.currentStepOrder || 1) === st.stepOrder;
              const stepPosText =
                st.positions && st.positions.length > 0
                  ? st.positions.map((p) => p.title).join('، ')
                  : st.positionTitle;

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
                      <Clock className="w-4 h-4 text-blue-600" />
                    ) : (
                      <span className="w-4 h-4 rounded-full border border-slate-300 text-[10px] flex items-center justify-center font-bold text-slate-400 tabular-nums">
                        {idx + 1}
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-bold truncate text-slate-900">
                    {st.title}
                  </div>
                  <div className="text-[10px] text-slate-500 line-clamp-2 mt-0.5" title={stepPosText}>
                    {stepPosText}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Step Multi-User Quorum Progress Banner */}
          {showQuorumBar && stepProgress && (() => {
            const revCount = stepProgress.revisionUserIds?.length || 0;
            const rejCount = stepProgress.rejectedUserIds?.length || 0;
            const appCount = stepProgress.approvedUserIds.length;
            const votedTotal = appCount + revCount + rejCount;
            const pendingCount = Math.max(0, stepProgress.totalAssignees - votedTotal);

            return (
              <div className="p-3 rounded-2xl bg-white border border-indigo-200 text-xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-slate-800">
                      وضعیت رای‌گیری در این گام (
                      {currentApprovalMode === 'MAJORITY'
                        ? 'اکثریت اعضا'
                        : currentApprovalMode === 'ALL'
                        ? 'تایید همه اعضا'
                        : 'جمع‌آوری آرا'}
                      ):
                    </span>
                    {currentVoteCollectionMode === 'WAIT_ALL' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                        صبر تا اقدام تمام اعضا ({votedTotal} از {stepProgress.totalAssignees})
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 tabular-nums">
                    <span className="font-black text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                      موافق: {appCount}
                      {currentVoteCollectionMode !== 'WAIT_ALL' ? ` از ${stepProgress.requiredCount}` : ''}
                    </span>
                    <span className="font-black text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-lg border border-amber-300">
                      اصلاح: {revCount}
                      {currentVoteCollectionMode !== 'WAIT_ALL' && stepProgress.revisionRequiredCount
                        ? ` از ${stepProgress.revisionRequiredCount}`
                        : ''}
                    </span>
                    <span className="font-black text-rose-800 bg-rose-50 px-2.5 py-0.5 rounded-lg border border-rose-200">
                      مخالف: {rejCount}
                      {currentVoteCollectionMode !== 'WAIT_ALL' && stepProgress.rejectRequiredCount
                        ? ` از ${stepProgress.rejectRequiredCount}`
                        : ''}
                    </span>
                    <span className="font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                      در انتظار: {pendingCount} از {stepProgress.totalAssignees} نفر
                    </span>
                  </div>
                </div>

                {stepProgress.approvedUsers.length > 0 && (
                  <div className="space-y-1 text-[11px]">
                    <span className="text-slate-500 block">رای موافق تاکنون:</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {stepProgress.approvedUsers.map((au) => (
                        <span
                          key={au.userId}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold"
                        >
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>{au.userName}</span>
                          {(canViewWorkflowHistory || au.userId === currentUser.id) && au.comment && (
                            <span className="text-[10px] font-normal text-emerald-700">
                              («{au.comment}»)
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {stepProgress.revisionUsers && stepProgress.revisionUsers.length > 0 && (
                  <div className="space-y-1 text-[11px]">
                    <span className="text-slate-500 block">درخواست اصلاح تاکنون:</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {stepProgress.revisionUsers.map((rv) => (
                        <span
                          key={rv.userId}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 text-amber-900 border border-amber-300 font-semibold"
                        >
                          <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                          <span>{rv.userName}</span>
                          {(canViewWorkflowHistory || rv.userId === currentUser.id) && rv.comment && (
                            <span className="text-[10px] font-normal text-amber-800">
                              («{rv.comment}»)
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {stepProgress.rejectedUsers && stepProgress.rejectedUsers.length > 0 && (
                  <div className="space-y-1 text-[11px]">
                    <span className="text-slate-500 block">رای مخالف تاکنون:</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {stepProgress.rejectedUsers.map((ru) => (
                        <span
                          key={ru.userId}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 font-semibold"
                        >
                          <XCircle className="w-3 h-3 text-rose-600 shrink-0" />
                          <span>{ru.userName}</span>
                          {(canViewWorkflowHistory || ru.userId === currentUser.id) && ru.comment && (
                            <span className="text-[10px] font-normal text-rose-700">
                              («{ru.comment}»)
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {stepProgress.hasCurrentUserApproved && (
                  <div className="text-[11px] font-bold text-emerald-700">
                    شما رای موافق خود را در این مرحله ثبت کرده‌اید و پرونده در انتظار تکمیل آرای سایر افراد است (در صورت نیاز می‌توانید رای خود را تغییر دهید).
                  </div>
                )}
                {stepProgress.hasCurrentUserRequestedRevision && (
                  <div className="text-[11px] font-bold text-amber-800">
                    شما رای «نیاز به اصلاح» خود را در این مرحله ثبت کرده‌اید و پرونده همچنان در انتظار نظر سایر اعضای مرحله است (در صورت نیاز می‌توانید رای خود را تغییر دهید).
                  </div>
                )}
                {stepProgress.hasCurrentUserRejected && (
                  <div className="text-[11px] font-bold text-rose-700">
                    شما رای مخالف خود را در این مرحله ثبت کرده‌اید و پرونده در انتظار تکمیل آرای سایر افراد است (در صورت نیاز می‌توانید رای خود را تغییر دهید).
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Action Form */}
        <form onSubmit={handleTransition} className="p-5 space-y-4">
          {isCompletedOrRejected && (
            <div className="p-3.5 rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold">
              این پروژه پیش‌تر در گردش کار {project.status === 'APPROVED' ? 'تصویب نهایی' : 'رد و مختومه'} شده است و امکان ثبت اقدام جدید ندارد.
            </div>
          )}

          {!isCompletedOrRejected && !isAssignee && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-2.5">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>نوبت بررسی این مرحله در اختیار شما نیست.</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800">
                افراد/سمت‌های مسئول در مرحله فعلی:{' '}
                <strong>
                  {project.currentAssignees && project.currentAssignees.length > 0
                    ? project.currentAssignees.map((a) => a.name).join('، ')
                    : project.currentPositionTitle || 'سمت فعلی'}
                </strong>
              </p>
              {currentUser.role === 'ADMIN' && (
                <label className="flex items-center gap-2 pt-1 cursor-pointer select-none font-bold text-amber-950">
                  <input
                    type="checkbox"
                    checked={adminOverride}
                    onChange={(e) => setAdminOverride(e.target.checked)}
                    className="w-4 h-4 accent-amber-600 rounded cursor-pointer"
                  />
                  <span>اقدام مدیریتی خارج از نوبت (به‌جای سمت فعلی گام را ارجاع می‌دهم)</span>
                </label>
              )}
            </div>
          )}

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
                <span className="text-xs font-bold">
                  {currentApprovalMode === 'MAJORITY'
                    ? 'رای موافق (تایید در اکثریت)'
                    : showQuorumBar
                    ? 'ثبت تایید من در این مرحله'
                    : 'تایید و ارجاع'}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5 truncate max-w-full">
                  {approveTargetLabel}
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
                <span className="text-xs font-bold">
                  {showQuorumBar ? 'رای نیاز به اصلاح' : 'عودت جهت اصلاح'}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5 truncate max-w-full">
                  {showQuorumBar ? `ثبت در مرحله (${revisionTargetLabel})` : revisionTargetLabel}
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
                <span className="text-xs font-bold">
                  {showQuorumBar ? 'رای مخالف (رد در مرحله)' : 'رد در این مرحله'}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5 truncate max-w-full">
                  {showQuorumBar ? `ثبت در آمار آرا (${rejectTargetLabel})` : rejectTargetLabel}
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

          {/* Past Operation & Transition History Logs */}
          {logs.length > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-blue-600" />
                <span>تاریخچه وضعیت و عملیات ثبت‌شده روی این پروژه:</span>
              </h4>
              <div className="space-y-2 max-h-44 overflow-y-auto">
                {logs.map((l) => {
                  const actionMeta = getActionBadgeMeta(l.action);
                  return (
                    <div
                      key={l.id}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] mb-1">
                        <span className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${actionMeta.badgeClass}`}
                          >
                            {actionMeta.label}
                          </span>
                          <span>{l.fromUserName || 'کاربر'}</span>
                          {l.fromUserPosition && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-white border border-slate-200 text-slate-600 rounded font-semibold">
                              {l.fromUserPosition}
                            </span>
                          )}
                          {l.toPositionTitle &&
                            ['FORWARD', 'NEEDS_REVISION', 'REJECTED', 'FINAL_APPROVED'].includes(l.action) && (
                              <span className="text-[10px] font-normal text-slate-600">
                                ← {l.toPositionTitle}
                              </span>
                            )}
                        </span>
                        <span className="text-slate-400 text-[10px] shrink-0">
                          {new Date(l.createdAt).toLocaleDateString('fa-IR')} •{' '}
                          {new Date(l.createdAt).toLocaleTimeString('fa-IR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {l.comment && (
                        <p className="text-slate-600 text-[11px] leading-relaxed">
                          {l.comment}
                        </p>
                      )}
                    </div>
                  );
                })}
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
              disabled={loading || !canSubmitAction}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition"
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
