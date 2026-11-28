import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Project, ProjectAttachment, User } from '../types';
import { api } from '../services/api';
import { hasPerm } from '../utils/permissions';
import { getActionBadgeMeta } from '../utils/workflowActions';
import { ProjectAttachments } from './ProjectAttachments';
import { 
  GitBranch, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Clock, 
  X, 
  MessageSquare, 
  Send,
  History,
  Lock,
  Edit3,
  Paperclip,
  ShieldCheck
} from 'lucide-react';

interface WorkflowTransitionModalProps {
  project: Project;
  currentUser: User;
  onClose: () => void;
  onSuccess: () => void;
  onOpenEditProject?: (project: Project) => void;
}

export const WorkflowTransitionModal: React.FC<WorkflowTransitionModalProps> = ({
  project,
  currentUser,
  onClose,
  onSuccess,
  onOpenEditProject,
}) => {
  const [action, setAction] = useState<'FORWARD' | 'NEEDS_REVISION' | 'REJECTED'>('FORWARD');
  const [comment, setComment] = useState('');
  const [adminOverride, setAdminOverride] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attachments, setAttachments] = useState<ProjectAttachment[]>(project.attachments || []);

  const refreshAttachments = useCallback(async () => {
    try {
      const fresh = await api.getProjectAttachments(project.id);
      setAttachments(fresh);
      onSuccess();
    } catch {
      // Keep current attachments state on transient error
    }
  }, [project.id, onSuccess]);

  useEffect(() => {
    setAttachments(project.attachments || []);
    api
      .getProjectAttachments(project.id)
      .then((fresh) => setAttachments(fresh))
      .catch(() => {});
  }, [project.id, project.attachments]);

  const steps = project.workflowSteps || [];
  const rawStepOrder = project.currentStepOrder ?? 1;
  const isCreatorRevisionTurn =
    project.status === 'NEEDS_REVISION' && Number(rawStepOrder) === 0;
  const currentStepIndex = isCreatorRevisionTurn ? 0 : Math.max(0, rawStepOrder - 1);
  const currentStep = isCreatorRevisionTurn ? undefined : steps[currentStepIndex];
  const nextStep = isCreatorRevisionTurn ? steps[0] : steps[currentStepIndex + 1];
  const logs = project.workflowLogs || [];
  const stepProgress = project.currentStepApprovalProgress;
  const currentApprovalMode = currentStep?.config?.approvalMode || stepProgress?.mode || 'SINGLE';
  const currentRevisionMode = currentStep?.config?.revisionMode || stepProgress?.revisionMode || 'SINGLE';
  const currentRejectMode = currentStep?.config?.rejectMode || stepProgress?.rejectMode || 'SINGLE';
  const currentVoteCollectionMode =
    currentStep?.config?.voteCollectionMode || stepProgress?.voteCollectionMode || 'EARLY_DECIDE';
  const leavesCartable = Boolean(
    currentStep?.config?.removeFromCartableAfterVote ?? (currentVoteCollectionMode === 'WAIT_ALL')
  );
  const hasCurrentUserVotedInStep = Boolean(
    stepProgress?.hasCurrentUserVoted ||
      stepProgress?.hasCurrentUserApproved ||
      stepProgress?.hasCurrentUserRequestedRevision ||
      stepProgress?.hasCurrentUserRejected
  );
  const isCompletedOrRejected = project.status === 'APPROVED' || project.status === 'REJECTED';
  const currentPosIds =
    project.currentPositionIds && project.currentPositionIds.length > 0
      ? project.currentPositionIds
      : project.currentPositionId
      ? [project.currentPositionId]
      : [];
  const isAssignee = Boolean(
    project.isMyWorkflowTurn ||
      (isCreatorRevisionTurn && project.createdById === currentUser.id) ||
      (!isCreatorRevisionTurn &&
        currentStep?.config?.assigneeMode === 'CREATOR' &&
        project.createdById === currentUser.id) ||
      project.currentAssignees?.some((a) => a.id === currentUser.id) ||
      (!isCreatorRevisionTurn && currentUser.positionId && currentPosIds.includes(currentUser.positionId))
  );
  const isAdminOverriding = !isAssignee && currentUser.role === 'ADMIN' && adminOverride;
  const canEditWorkflowVote = hasPerm(currentUser, 'projects.edit_workflow_vote');
  const lockedByLeaveCartable =
    !isCreatorRevisionTurn && hasCurrentUserVotedInStep && leavesCartable && !isAdminOverriding;
  const lockedByNoEditPerm =
    !isCreatorRevisionTurn &&
    hasCurrentUserVotedInStep &&
    !leavesCartable &&
    !canEditWorkflowVote &&
    !isAdminOverriding;
  const lockedAfterVote = lockedByLeaveCartable || lockedByNoEditPerm;
  const canSubmitAction =
    !isCompletedOrRejected &&
    !lockedAfterVote &&
    (isAssignee || isAdminOverriding);
  const canViewWorkflowHistory = hasPerm(currentUser, [
    'workflow.history.view',
    'voting.confidential.view_all',
  ]);
  const canViewLiveStatus = hasPerm(currentUser, [
    'workflow.live_status.view',
    'voting.confidential.view_all',
  ]);
  const isCreatorAssignedStep = Boolean(
    !isCreatorRevisionTurn &&
      currentStep?.config?.assigneeMode === 'CREATOR' &&
      project.createdById === currentUser.id
  );

  const configuredAllowedActions: ('APPROVE' | 'REVISION' | 'REJECT')[] =
    currentStep?.config?.allowedActions && currentStep.config.allowedActions.length > 0
      ? currentStep.config.allowedActions
      : ['APPROVE', 'REVISION', 'REJECT'];
  const allowApprove = isCreatorRevisionTurn || isAdminOverriding || configuredAllowedActions.includes('APPROVE');
  const allowRevision = !isCreatorRevisionTurn && (isAdminOverriding || configuredAllowedActions.includes('REVISION'));
  const allowReject = isCreatorRevisionTurn || isAdminOverriding || configuredAllowedActions.includes('REJECT');

  useEffect(() => {
    if (isCreatorRevisionTurn) {
      if (action === 'NEEDS_REVISION') {
        setAction('FORWARD');
      }
      return;
    }
    const isValid =
      (action === 'FORWARD' && allowApprove) ||
      (action === 'NEEDS_REVISION' && allowRevision) ||
      (action === 'REJECTED' && allowReject);
    if (!isValid) {
      if (allowApprove) setAction('FORWARD');
      else if (allowRevision) setAction('NEEDS_REVISION');
      else if (allowReject) setAction('REJECTED');
    }
  }, [isCreatorRevisionTurn, allowApprove, allowRevision, allowReject, action]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const showQuorumBar =
    Boolean(stepProgress) &&
    !isCreatorRevisionTurn &&
    (currentApprovalMode === 'MAJORITY' ||
      currentApprovalMode === 'ALL' ||
      currentRevisionMode === 'MAJORITY' ||
      currentRevisionMode === 'ALL' ||
      currentRejectMode === 'MAJORITY' ||
      currentRejectMode === 'ALL' ||
      currentVoteCollectionMode === 'WAIT_ALL') &&
    !isCompletedOrRejected;

  const approveTargetLabel = (() => {
    if (isCreatorRevisionTurn) {
      return steps[0] ? `به گام ۱: ${steps[0].title}` : 'به گام اول گردش کار';
    }
    const cfg = currentStep?.config;
    if (cfg?.approveBehavior === 'RECORD_AND_WAIT' && !cfg?.hasGateway) {
      return 'ثبت رای موافق در تاریخچه وضعیت';
    }
    if (cfg?.approveTarget === 'END_APPROVED') return 'تصویب نهایی و اتمام';
    if (cfg?.approveTarget === 'CUSTOM_STEP' && cfg.onApproveStepOrder) {
      const tStep = steps.find((s) => s.stepOrder === cfg.onApproveStepOrder);
      return tStep ? `به گام ${tStep.stepOrder}: ${tStep.title}` : `به گام ${cfg.onApproveStepOrder}`;
    }
    return nextStep ? `به: ${nextStep.title}` : 'تصویب نهایی';
  })();

  const revisionTargetLabel = (() => {
    const cfg = currentStep?.config;
    if (cfg?.revisionBehavior === 'RECORD_AND_WAIT' && !cfg?.hasGateway) {
      return 'ثبت نظر اصلاحی در تاریخچه وضعیت';
    }
    const rule = cfg?.onRevisionAction || cfg?.onRejectAction || 'RETURN_PREV';
    if (rule === 'RETURN_CREATOR') {
      const titleHint = cfg?.returnCreatorTaskTitle?.trim() || 'نیاز به اصلاح';
      return `کارتابل ثبت‌کننده (${titleHint})`;
    }
    if (rule === 'RETURN_STEP_1') return 'بازگشت به گام ۱';
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
    if (cfg?.rejectBehavior === 'RECORD_AND_WAIT' && !cfg?.hasGateway) {
      return 'ثبت رای رد در تاریخچه وضعیت (خروج از کارتابل)';
    }
    const rule =
      cfg?.onRevisionAction !== undefined
        ? cfg?.onRejectAction || 'REJECT_PROJECT'
        : cfg?.onRejectAction === 'RETURN_CREATOR' ||
          cfg?.onRejectAction === 'RETURN_STEP_1' ||
          cfg?.onRejectAction === 'CUSTOM_STEP'
        ? cfg.onRejectAction
        : 'REJECT_PROJECT';
    if (rule === 'RETURN_CREATOR') {
      const titleHint = cfg?.returnCreatorTaskTitle?.trim() || 'نیاز به اصلاح';
      return `کارتابل ثبت‌کننده (${titleHint})`;
    }
    if (rule === 'RETURN_STEP_1') return 'بازگشت به گام ۱';
    if (rule === 'RETURN_PREV') return 'بازگشت به گام قبل';
    if (rule === 'CUSTOM_STEP' && cfg?.onRejectStepOrder) {
      const tStep = steps.find((s) => s.stepOrder === cfg.onRejectStepOrder);
      return tStep ? `ارجاع به گام ${tStep.stepOrder}: ${tStep.title}` : `ارجاع به گام ${cfg.onRejectStepOrder}`;
    }
    return 'رد و خروج از گردش کار';
  })();

  const approveBtnLabel =
    currentStep?.config?.actionLabels?.APPROVE?.trim() ||
    (currentApprovalMode === 'MAJORITY'
      ? 'رای موافق (نصاب اکثریت)'
      : showQuorumBar
      ? 'ثبت تایید من در این مرحله'
      : 'تایید و ارجاع');
  const revisionBtnLabel =
    currentStep?.config?.actionLabels?.REVISION?.trim() ||
    (currentRevisionMode === 'MAJORITY'
      ? 'رای اصلاح (نصاب اکثریت)'
      : currentRevisionMode === 'ALL'
      ? 'رای اصلاح (نصاب اجماع)'
      : 'عودت جهت اصلاح');
  const rejectBtnLabel =
    currentStep?.config?.actionLabels?.REJECT?.trim() ||
    (currentRejectMode === 'MAJORITY'
      ? 'رای مخالف (نصاب اکثریت)'
      : currentRejectMode === 'ALL'
      ? 'رای مخالف (نصاب اجماع)'
      : 'رد در این مرحله');

  const visibleActionCount = [allowApprove, allowRevision, allowReject].filter(Boolean).length;

  const allowStepAttachmentUpload =
    !isCompletedOrRejected &&
    (isCreatorRevisionTurn || currentStep?.config?.allowAttachmentUploadInStep !== false);
  const canUploadAttachmentsInModal =
    allowStepAttachmentUpload &&
    (isAssignee ||
      isAdminOverriding ||
      hasPerm(currentUser, ['projects.edit', 'project_list.edit']));

  const requireAttachment =
    !isCreatorRevisionTurn && Boolean(currentStep?.config?.requireAttachment);
  const requireNewAttachmentInStep = Boolean(currentStep?.config?.requireNewAttachmentInStep);
  const minAttachmentsRequired = Math.max(
    1,
    Number(currentStep?.config?.minAttachmentsCount || 1)
  );
  const requireCommentOnApprove =
    !isCreatorRevisionTurn && Boolean(currentStep?.config?.requireCommentOnApprove);
  const requireCommentOnReject =
    !isCreatorRevisionTurn && Boolean(currentStep?.config?.requireCommentOnReject);

  const stepEnteredAt = useMemo(() => {
    let latest = project.createdAt || '';
    for (const l of logs) {
      if (['PROJECT_CREATED', 'FORWARD', 'NEEDS_REVISION'].includes(l.action)) {
        if (l.createdAt && l.createdAt > latest) {
          latest = l.createdAt;
        }
      }
    }
    return latest;
  }, [logs, project.createdAt]);

  const matchingAttachmentsCount = useMemo(() => {
    if (!requireNewAttachmentInStep) return attachments.length;
    if (!stepEnteredAt) return attachments.length;
    return attachments.filter((a) => a.createdAt >= stepEnteredAt).length;
  }, [attachments, requireNewAttachmentInStep, stepEnteredAt]);

  const attachmentReqSatisfied =
    !requireAttachment || matchingAttachmentsCount >= minAttachmentsRequired;

  const handleTransition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdminOverriding) {
      if (action === 'FORWARD' && requireAttachment && !attachmentReqSatisfied) {
        const defaultMsg = requireNewAttachmentInStep
          ? minAttachmentsRequired === 1
            ? 'بارگذاری حداقل یک فایل پیوست جدید در همین مرحله پیش از تایید و ارجاع الزامی است.'
            : `بارگذاری حداقل ${minAttachmentsRequired} فایل پیوست جدید در همین مرحله پیش از تایید و ارجاع الزامی است.`
          : minAttachmentsRequired === 1
          ? 'وجود حداقل یک فایل پیوست در پروژه پیش از تایید و ارجاع الزامی است.'
          : `وجود حداقل ${minAttachmentsRequired} فایل پیوست در پروژه پیش از تایید و ارجاع الزامی است.`;
        setError(currentStep?.config?.attachmentRequirementMessage?.trim() || defaultMsg);
        return;
      }
      if (action === 'FORWARD' && requireCommentOnApprove && !comment.trim()) {
        setError('ثبت توضیحات / هامش برای تایید و ارجاع در این مرحله الزامی است.');
        return;
      }
      if (action === 'REJECTED' && requireCommentOnReject && !comment.trim()) {
        setError('ثبت دلیل / توضیحات برای رد طرح در این مرحله الزامی است.');
        return;
      }
    }
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/40 backdrop-blur-sm overflow-hidden"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col rounded-2xl sm:rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed Header */}
        <div className="shrink-0 flex items-center justify-between gap-2 p-3.5 sm:p-5 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center">
              <GitBranch className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                ارجاع و گردش کار سازمانی پروژه
              </h3>
              <p className="text-[11px] sm:text-xs text-blue-700 font-semibold truncate">
                {project.code} — {project.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form wraps scrollable middle body + fixed bottom action bar */}
        <form onSubmit={handleTransition} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {error && (
              <div className="mx-4 mt-4 sm:mx-5 sm:mt-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {error}
              </div>
            )}

            {/* Workflow Progression Roadmap */}
            <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/40 space-y-3">
          <div className="text-xs font-bold text-slate-600 flex items-center justify-between gap-2 flex-wrap">
            <span>مراحل طی‌شده در چارت سازمانی:</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {project.currentTaskTitle && !isCompletedOrRejected && (
                <span
                  className={`font-bold px-2.5 py-0.5 rounded-lg border ${
                    isCreatorRevisionTurn
                      ? 'text-amber-900 bg-amber-100/80 border-amber-300'
                      : 'text-indigo-800 bg-indigo-50 border-indigo-200'
                  }`}
                >
                  عنوان کار: {project.currentTaskTitle}
                </span>
              )}
              <span
                className={`font-bold px-2.5 py-0.5 rounded-lg border tabular-nums ${
                  isCreatorRevisionTurn
                    ? 'text-amber-900 bg-amber-50 border-amber-300'
                    : 'text-blue-700 bg-blue-50 border-blue-200'
                }`}
              >
                {isCreatorRevisionTurn
                  ? `در کارتابل ثبت‌کننده (${project.currentTaskTitle || 'نیاز به اصلاح'})`
                  : `گام ${rawStepOrder} از ${steps.length}`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {steps.map((st, idx) => {
              const isPast = !isCreatorRevisionTurn && (project.status === 'APPROVED' || rawStepOrder > st.stepOrder);
              const isCurrent =
                !isCreatorRevisionTurn &&
                project.status !== 'APPROVED' &&
                project.status !== 'REJECTED' &&
                rawStepOrder === st.stepOrder;
              const stepPosText =
                st.config?.assigneeMode === 'CREATOR'
                  ? 'ثبت‌کننده اولیه پروژه'
                  : st.positions && st.positions.length > 0
                  ? st.positions.map((p) => p.title).join('، ')
                  : st.positionTitle || 'بدون سمت';

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
                      وضعیت رای‌گیری و نصاب در این گام:
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      نصاب تایید: {currentApprovalMode === 'ALL' ? 'اجماع' : currentApprovalMode === 'MAJORITY' ? 'اکثریت' : '۱ نفر'} | اصلاح: {currentRevisionMode === 'ALL' ? 'اجماع' : currentRevisionMode === 'MAJORITY' ? 'اکثریت' : '۱ نفر'} | رد: {currentRejectMode === 'ALL' ? 'اجماع' : currentRejectMode === 'MAJORITY' ? 'اکثریت' : '۱ نفر'}
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

                {(() => {
                  const visibleApproved = (stepProgress.approvedUsers || []).filter(
                    (au) => canViewLiveStatus || au.userId === currentUser.id
                  );
                  const visibleRevision = (stepProgress.revisionUsers || []).filter(
                    (rv) => canViewLiveStatus || rv.userId === currentUser.id
                  );
                  const visibleRejected = (stepProgress.rejectedUsers || []).filter(
                    (ru) => canViewLiveStatus || ru.userId === currentUser.id
                  );

                  return (
                    <>
                      {visibleApproved.length > 0 && (
                        <div className="space-y-1 text-[11px]">
                          <span className="text-slate-500 block">رای موافق تاکنون:</span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {visibleApproved.map((au) => (
                              <span
                                key={au.userId}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold"
                              >
                                <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                <span>{au.userName}</span>
                                {(canViewLiveStatus || au.userId === currentUser.id) && au.comment && (
                                  <span className="text-[10px] font-normal text-emerald-700">
                                    («{au.comment}»)
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {visibleRevision.length > 0 && (
                        <div className="space-y-1 text-[11px]">
                          <span className="text-slate-500 block">درخواست اصلاح تاکنون:</span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {visibleRevision.map((rv) => (
                              <span
                                key={rv.userId}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 text-amber-900 border border-amber-300 font-semibold"
                              >
                                <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                <span>{rv.userName}</span>
                                {(canViewLiveStatus || rv.userId === currentUser.id) && rv.comment && (
                                  <span className="text-[10px] font-normal text-amber-800">
                                    («{rv.comment}»)
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {visibleRejected.length > 0 && (
                        <div className="space-y-1 text-[11px]">
                          <span className="text-slate-500 block">رای مخالف تاکنون:</span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {visibleRejected.map((ru) => (
                              <span
                                key={ru.userId}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 font-semibold"
                              >
                                <XCircle className="w-3 h-3 text-rose-600 shrink-0" />
                                <span>{ru.userName}</span>
                                {(canViewLiveStatus || ru.userId === currentUser.id) && ru.comment && (
                                  <span className="text-[10px] font-normal text-rose-700">
                                    («{ru.comment}»)
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {!canViewLiveStatus && (
                        <div className="text-[10px] text-slate-500 flex items-center gap-1.5 pt-0.5">
                          <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>مشاهده وضعیت لحظه‌ای و نام سایر رای‌دهندگان نیازمند دسترسی «دیدن وضعیت لحظه‌ای افراد» است.</span>
                        </div>
                      )}
                    </>
                  );
                })()}

                {stepProgress.hasCurrentUserApproved && (
                  <div className="text-[11px] font-bold text-emerald-700">
                    {leavesCartable
                      ? 'شما رای موافق خود را در این مرحله ثبت کرده‌اید و پرونده از کارتابل شما خارج شده است.'
                      : canEditWorkflowVote
                      ? 'شما رای موافق خود را در این مرحله ثبت کرده‌اید و پرونده در انتظار تکمیل آرای سایر افراد است (به دلیل داشتن دسترسی «امکان ویرایش رای در کارتابل» می‌توانید رای خود را تغییر دهید).'
                      : 'شما رای موافق خود را در این مرحله ثبت کرده‌اید و پرونده در کارتابل شما باقی مانده است، اما امکان تغییر رای وجود ندارد.'}
                  </div>
                )}
                {stepProgress.hasCurrentUserRequestedRevision && (
                  <div className="text-[11px] font-bold text-amber-800">
                    {leavesCartable
                      ? 'شما رای «نیاز به اصلاح» خود را ثبت کرده‌اید و پرونده از کارتابل شما خارج شده است.'
                      : canEditWorkflowVote
                      ? 'شما رای «نیاز به اصلاح» خود را در این مرحله ثبت کرده‌اید و پرونده همچنان در انتظار نظر سایر اعضای مرحله است (به دلیل داشتن دسترسی «امکان ویرایش رای در کارتابل» می‌توانید رای خود را تغییر دهید).'
                      : 'شما رای «نیاز به اصلاح» خود را در این مرحله ثبت کرده‌اید و پرونده در کارتابل شما باقی مانده است، اما امکان تغییر رای وجود ندارد.'}
                  </div>
                )}
                {stepProgress.hasCurrentUserRejected && (
                  <div className="text-[11px] font-bold text-rose-700">
                    {leavesCartable
                      ? 'شما رای مخالف خود را ثبت کرده‌اید و پرونده از کارتابل شما خارج شده است.'
                      : canEditWorkflowVote
                      ? 'شما رای مخالف خود را در این مرحله ثبت کرده‌اید و پرونده در انتظار تکمیل آرای سایر افراد است (به دلیل داشتن دسترسی «امکان ویرایش رای در کارتابل» می‌توانید رای خود را تغییر دهید).'
                      : 'شما رای مخالف خود را در این مرحله ثبت کرده‌اید و پرونده در کارتابل شما باقی مانده است، اما امکان تغییر رای وجود ندارد.'}
                  </div>
                )}
              </div>
            );
          })()}
            </div>

            {/* Action Form Body */}
            <div className="p-4 sm:p-5 space-y-4">
          {isCompletedOrRejected && (
            <div className="p-3.5 rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold">
              این پروژه پیش‌تر در گردش کار {project.status === 'APPROVED' ? 'تصویب نهایی' : 'رد و مختومه'} شده است و امکان ثبت اقدام جدید ندارد.
            </div>
          )}

          {lockedByLeaveCartable && !isCompletedOrRejected && (
            <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-semibold flex items-start gap-2">
              <Lock className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>
                رای و توضیحات شما در این مرحله ثبت شده و پرونده از کارتابل شما خارج شده است. انتقال به گام بعدی پس از ثبت رای سایر اعضای این سمت انجام می‌شود.
              </span>
            </div>
          )}

          {lockedByNoEditPerm && !isCompletedOrRejected && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-semibold flex items-start gap-2">
              <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                رای شما قبلاً در این مرحله ثبت شده است. پرونده تا تکمیل رای سایر اعضا در کارتابل شما باقی می‌ماند، اما به دلیل نداشتن دسترسی «امکان ویرایش رای در کارتابل» امکان تغییر یا ویرایش رای خود را ندارید.
              </span>
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
                  {canViewLiveStatus && project.currentAssignees && project.currentAssignees.length > 0
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

          {!isCompletedOrRejected &&
            onOpenEditProject &&
            (isCreatorRevisionTurn ||
              (isCreatorAssignedStep && currentStep?.config?.approveTarget !== 'END_APPROVED')) && (
              <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                <div className="text-indigo-950 font-medium leading-relaxed">
                  <strong className="font-bold block">ویرایش مشخصات پروژه</strong>
                  <span className="text-[11px] text-indigo-800">
                    فایل‌های پروژه را می‌توانید مستقیماً در کادر پیوست زیر بارگذاری کنید؛ برای ویرایش عنوان، بودجه یا توضیحات روی دکمه روبه‌رو کلیک کنید.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenEditProject(project);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition cursor-pointer shrink-0"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>ویرایش مشخصات پروژه</span>
                </button>
              </div>
            )}

          {/* Step Prerequisite Control Notice */}
          {!isCompletedOrRejected && requireAttachment && (
            <div
              className={`p-3 rounded-2xl border text-xs flex items-start gap-2.5 ${
                attachmentReqSatisfied
                  ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50/80 border-rose-200 text-rose-900'
              }`}
            >
              {attachmentReqSatisfied ? (
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <Paperclip className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="leading-relaxed">
                <strong className="font-bold block">
                  {attachmentReqSatisfied
                    ? 'شرط فایل پیوست این مرحله برقرار است ✓'
                    : 'الزام بارگذاری فایل پیش از تایید و ارجاع'}
                </strong>
                <span className="text-[11px]">
                  {currentStep?.config?.attachmentRequirementMessage?.trim() ||
                    (requireNewAttachmentInStep
                      ? `در این مرحله باید حداقل ${minAttachmentsRequired} فایل پیوست جدید بارگذاری شود.`
                      : `برای ارجاع در این مرحله وجود حداقل ${minAttachmentsRequired} فایل پیوست روی پروژه الزامی است.`)}{' '}
                  <strong className="tabular-nums">
                    ({matchingAttachmentsCount} از {minAttachmentsRequired} فایل)
                  </strong>
                </span>
              </div>
            </div>
          )}

          {/* Direct Project File Upload right inside the workflow action modal */}
          {(canUploadAttachmentsInModal || attachments.length > 0) && (
            <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200">
              <ProjectAttachments
                projectId={project.id}
                projectTitle={project.title}
                attachments={attachments}
                canManage={canUploadAttachmentsInModal}
                onAttachmentChange={refreshAttachments}
                compact
              />
            </div>
          )}

          {isCreatorRevisionTurn ? (
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-1">
                <div className="font-black flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>پرونده در کارتابل ثبت‌کننده پروژه جهت انجام اصلاحات قرار دارد</span>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-800">
                  می‌توانید ابتدا اطلاعات پروژه را ویرایش کنید و سپس با انتخاب گزینه «ارسال مجدد»، پروژه را دوباره به مرحله اول گردش کار بفرستید.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                  <span className="text-xs font-bold">اصلاح شد — ارسال مجدد به گام ۱</span>
                  <span className="text-[10px] text-slate-500 mt-0.5 truncate max-w-full">
                    {approveTargetLabel}
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
                  <span className="text-xs font-bold">انصراف و مختومه کردن طرح</span>
                  <span className="text-[10px] text-slate-500 mt-0.5 truncate max-w-full">
                    بستن نهایی پروژه
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="block text-xs font-bold text-slate-700">
                  انتخاب اقدام در این مرحله از گردش کار:
                </label>
                {leavesCartable && !hasCurrentUserVotedInStep && !isCompletedOrRejected && (
                  <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg">
                    پس از ثبت رای، از کارتابل شما خارج و در وضعیت پروژه ثبت می‌شود
                  </span>
                )}
              </div>
              <div
                className={`grid grid-cols-1 gap-2.5 ${
                  visibleActionCount === 1
                    ? 'sm:grid-cols-1'
                    : visibleActionCount === 2
                    ? 'sm:grid-cols-2'
                    : 'sm:grid-cols-3'
                }`}
              >
                {allowApprove && (
                  <button
                    type="button"
                    disabled={lockedAfterVote || isCompletedOrRejected}
                    onClick={() => setAction('FORWARD')}
                    className={`p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center disabled:opacity-55 disabled:cursor-not-allowed ${
                      lockedAfterVote || isCompletedOrRejected ? 'cursor-not-allowed' : 'cursor-pointer'
                    } ${
                      action === 'FORWARD'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/50'
                    }`}
                  >
                    <CheckCircle2 className="w-5 h-5 mb-1 text-emerald-600" />
                    <span className="text-xs font-bold">{approveBtnLabel}</span>
                    <span className="text-[10px] text-slate-500 mt-0.5 truncate max-w-full">
                      {approveTargetLabel}
                    </span>
                  </button>
                )}

                {allowRevision && (
                  <button
                    type="button"
                    disabled={lockedAfterVote || isCompletedOrRejected}
                    onClick={() => setAction('NEEDS_REVISION')}
                    className={`p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center disabled:opacity-55 disabled:cursor-not-allowed ${
                      lockedAfterVote || isCompletedOrRejected ? 'cursor-not-allowed' : 'cursor-pointer'
                    } ${
                      action === 'NEEDS_REVISION'
                        ? 'bg-amber-50 border-amber-500 text-amber-800 ring-2 ring-amber-500/20 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-amber-300 hover:bg-amber-50/50'
                    }`}
                  >
                    <AlertTriangle className="w-5 h-5 mb-1 text-amber-600" />
                    <span className="text-xs font-bold">{revisionBtnLabel}</span>
                    <span className="text-[10px] text-slate-500 mt-0.5 truncate max-w-full">
                      {showQuorumBar ? `ثبت در مرحله ← ${revisionTargetLabel}` : revisionTargetLabel}
                    </span>
                  </button>
                )}

                {allowReject && (
                  <button
                    type="button"
                    disabled={lockedAfterVote || isCompletedOrRejected}
                    onClick={() => setAction('REJECTED')}
                    className={`p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center disabled:opacity-55 disabled:cursor-not-allowed ${
                      lockedAfterVote || isCompletedOrRejected ? 'cursor-not-allowed' : 'cursor-pointer'
                    } ${
                      action === 'REJECTED'
                        ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/20 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-rose-300 hover:bg-rose-50/50'
                    }`}
                  >
                    <XCircle className="w-5 h-5 mb-1 text-rose-600" />
                    <span className="text-xs font-bold">{rejectBtnLabel}</span>
                    <span className="text-[10px] text-slate-500 mt-0.5 truncate max-w-full">
                      {showQuorumBar ? `ثبت در آمار آرا ← ${rejectTargetLabel}` : rejectTargetLabel}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

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
              {action === 'FORWARD' && requireCommentOnApprove && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                  الزامی برای تایید
                </span>
              )}
              {action === 'REJECTED' && requireCommentOnReject && (
                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
                  الزامی برای رد
                </span>
              )}
            </div>
            <textarea
              rows={3}
              value={comment}
              disabled={lockedAfterVote || isCompletedOrRejected}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                lockedAfterVote
                  ? 'رای شما پیش‌تر ثبت شده و امکان ویرایش ندارد.'
                  : currentStep?.config?.assigneeMode === 'CREATOR' && !isCreatorRevisionTurn
                  ? 'توضیحات اختیاری پیش از ارسال به مرحله بعد...'
                  : 'دستور، نظر کارشناسی یا توضیحات برای ثبت در تاریخچه وضعیت پروژه...'
              }
              className="w-full rounded-2xl bg-slate-50 border border-slate-300 px-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white leading-relaxed transition disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          {/* Past Operation & Transition History Logs */}
          {canViewWorkflowHistory ? (
            logs.length > 0 && (
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
            )
          ) : (
            <div className="pt-3 border-t border-slate-100">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>مشاهده تاریخچه کامل انتخاب‌ها و توضیحات افراد نیازمند دسترسی «دیدن تاریخچه کامل انتخاب‌ها و توضیحات افراد» است.</span>
              </div>
            </div>
          )}

            </div>
          </div>

          {/* Fixed Bottom Actions Bar */}
          <div className="shrink-0 flex items-center justify-end gap-2.5 sm:gap-3 px-4 py-3 sm:px-5 sm:py-3.5 border-t border-slate-100 bg-white">
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
              <span>
                {loading
                  ? 'در حال ثبت...'
                  : hasCurrentUserVotedInStep && canEditWorkflowVote && !leavesCartable
                  ? 'ویرایش و ثبت مجدد رای'
                  : 'ثبت ارجاع در گردش کار'}
              </span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
