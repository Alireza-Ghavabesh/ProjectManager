import React, { useState } from 'react';
import { Project, User, DynamicField } from '../types';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Users,
  Trash2,
  Edit3,
  ShieldCheck,
  Calendar,
  Coins,
  GitBranch,
  ChevronDown,
  ChevronUp,
  Vote as VoteIcon,
  ArrowLeft,
  Briefcase,
  Lock,
  PackageCheck,
  Copy,
  Check,
  Paperclip,
  History,
  MessageSquare,
  UserCheck,
} from 'lucide-react';

import { ProjectAttachments } from './ProjectAttachments';
import { formatBudgetDisplay, isDeadlineExpired } from '../utils/formatters';
import { hasPerm } from '../utils/permissions';
import { getActionBadgeMeta } from '../utils/workflowActions';
import { api } from '../services/api';

interface ProjectCardProps {
  project: Project;
  currentUser: User;
  dynamicFields: DynamicField[];
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onOpenVoteModal: (project: Project) => void;
  onOpenWorkflowModal?: (project: Project) => void;
  onEditProject?: (project: Project) => void;
  onDeleteProject?: (projectId: string) => void;
  onRefreshData?: () => void;
  viewContext?: 'cartable' | 'project_list';
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  currentUser,
  dynamicFields,
  isExpanded: controlledExpanded,
  onToggleExpand,
  onOpenVoteModal,
  onOpenWorkflowModal,
  onEditProject,
  onDeleteProject,
  onRefreshData,
  viewContext = 'cartable',
}) => {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const [showAdminVotes, setShowAdminVotes] = useState(false);
  const [showWorkflowDetails, setShowWorkflowDetails] = useState(true);
  const [copiedTrackingCode, setCopiedTrackingCode] = useState(false);
  const [manualApproving, setManualApproving] = useState(false);

  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const handleToggleExpand = () => {
    if (onToggleExpand) {
      onToggleExpand();
    } else {
      setInternalExpanded((prev) => !prev);
    }
  };

  const isListContext = viewContext === 'project_list';
  const canEditProject = isListContext
    ? hasPerm(currentUser, 'project_list.edit')
    : hasPerm(currentUser, 'projects.edit');
  const canDeleteProject = isListContext
    ? hasPerm(currentUser, 'project_list.delete')
    : hasPerm(currentUser, 'projects.delete');
  const canCreateProject = isListContext
    ? hasPerm(currentUser, 'project_list.create')
    : hasPerm(currentUser, 'projects.create');
  const canManualApprove = hasPerm(currentUser, 'projects.manual_approve');
  const canViewConfidential = hasPerm(currentUser, 'voting.confidential.view_all');
  const canViewWorkflowHistory = hasPerm(currentUser, ['workflow.history.view', 'voting.confidential.view_all']);
  const canViewLiveStatus = hasPerm(currentUser, ['workflow.live_status.view', 'voting.confidential.view_all']);
  const canCastVote = hasPerm(currentUser, 'voting.cast');
  const canForwardWorkflow = hasPerm(currentUser, 'workflow.forward');
  const canManageAttachments = canEditProject || (canCreateProject && currentUser.id === project.createdById);

  const handleManualApprove = async () => {
    if (!confirm(`آیا از تایید نهایی دستی پروژه «${project.title}» خارج از روال عادی گردش کار اطمینان دارید؟`)) {
      return;
    }
    setManualApproving(true);
    try {
      await api.manualApproveProject(project.id);
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      alert(err.message || 'خطا در تایید نهایی دستی');
    } finally {
      setManualApproving(false);
    }
  };

  const getMajorityMeta = (maj: string) => {
    switch (maj) {
      case 'APPROVED':
        return {
          label: 'تایید اکثریت',
          fullLabel: 'تایید شده با رای اکثریت',
          textClass: 'text-emerald-700',
          bgClass: 'bg-emerald-50 border-emerald-200 text-emerald-800',
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />,
        };
      case 'REJECTED':
        return {
          label: 'رد اکثریت',
          fullLabel: 'رد شده با رای اکثریت',
          textClass: 'text-rose-700',
          bgClass: 'bg-rose-50 border-rose-200 text-rose-800',
          icon: <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />,
        };
      case 'NEEDS_REVISION':
        return {
          label: 'نیازمند اصلاح',
          fullLabel: 'نیازمند اصلاح بر اساس نظر اکثریت',
          textClass: 'text-amber-800',
          bgClass: 'bg-amber-50 border-amber-300 text-amber-900',
          icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />,
        };
      case 'TIED':
        return {
          label: 'برابری آرا',
          fullLabel: 'برابری آرا (در انتظار جمع‌بندی)',
          textClass: 'text-indigo-700',
          bgClass: 'bg-indigo-50 border-indigo-200 text-indigo-800',
          icon: <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />,
        };
      default:
        return {
          label: 'در حال رای‌گیری',
          fullLabel: 'در حال جمع‌آوری آرا',
          textClass: 'text-slate-600',
          bgClass: 'bg-slate-100 border-slate-200 text-slate-700',
          icon: <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />,
        };
    }
  };

  const getWorkflowStatusMeta = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return {
          label: 'تصویب نهایی',
          fullLabel: 'تصویب نهایی در گردش کار',
          textClass: 'text-emerald-700',
          bgClass: 'bg-emerald-50 border-emerald-200 text-emerald-800',
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />,
        };
      case 'REJECTED':
        return {
          label: 'رد در گردش کار',
          fullLabel: 'رد شده در گردش کار',
          textClass: 'text-rose-700',
          bgClass: 'bg-rose-50 border-rose-200 text-rose-800',
          icon: <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />,
        };
      case 'NEEDS_REVISION':
        return {
          label: 'نیازمند اصلاح',
          fullLabel: 'عودت جهت اصلاح در گردش کار',
          textClass: 'text-amber-800',
          bgClass: 'bg-amber-50 border-amber-300 text-amber-900',
          icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />,
        };
      default:
        return {
          label: 'در حال گردش کار',
          fullLabel: 'در حال بررسی و ارجاع در گردش کار',
          textClass: 'text-blue-700',
          bgClass: 'bg-blue-50 border-blue-200 text-blue-800',
          icon: <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />,
        };
    }
  };

  const getVoteStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            موافق / تایید
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" />
            مخالف / رد
          </span>
        );
      case 'NEEDS_REVISION':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            نیاز به اصلاح
          </span>
        );
      default:
        return null;
    }
  };

  // Map dynamic field values into hierarchical groups + legacy keys
  const reqObj = project.requirements || {};
  const validFieldIds = new Set(dynamicFields.map((f) => f.id));
  const buildFieldTree = (pId: string | null): DynamicField[] =>
    dynamicFields
      .filter((f) => {
        const effParent = f.parentId && validFieldIds.has(f.parentId) ? f.parentId : null;
        return effParent === pId;
      })
      .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
      .map((f) => ({ ...f, children: buildFieldTree(f.id) }));

  const fieldTree = buildFieldTree(null);
  const hasAnyKeyInBranch = (fld: DynamicField): boolean => {
    if (reqObj[fld.key] !== undefined && reqObj[fld.key] !== '') return true;
    return (fld.children || []).some((ch) => hasAnyKeyInBranch(ch));
  };
  const visibleRootFields = fieldTree.filter((fld) => hasAnyKeyInBranch(fld));

  const knownKeys = new Set(dynamicFields.map((f) => f.key));
  const legacyEntries = Object.entries(reqObj)
    .filter(([key]) => !knownKeys.has(key))
    .map(([key, val]) => ({
      key,
      name: key,
      unit: '',
      value: val,
    }));
  const totalRequirementCount = Object.keys(reqObj).length;

  const steps = project.workflowSteps || [];
  const hasWorkflow = Boolean(project.hasWorkflow || project.workflowId || steps.length > 0);
  const rawStepOrder = project.currentStepOrder ?? 1;
  const isCreatorRevisionTurn = project.status === 'NEEDS_REVISION' && Number(rawStepOrder) === 0;
  const currentStep = !isCreatorRevisionTurn
    ? steps.find((s) => s.stepOrder === rawStepOrder)
    : undefined;
  const isCompletedOrRejected = project.status === 'APPROVED' || project.status === 'REJECTED';
  const currentPosIds =
    project.currentPositionIds && project.currentPositionIds.length > 0
      ? project.currentPositionIds
      : project.currentPositionId
      ? [project.currentPositionId]
      : [];
  const isMyTurnInWorkflow =
    hasWorkflow &&
    !isCompletedOrRejected &&
    (project.isMyWorkflowTurn ??
      (isCreatorRevisionTurn
        ? project.createdById === currentUser.id
        : currentStep?.config?.assigneeMode === 'CREATOR'
        ? project.createdById === currentUser.id
        : Boolean(currentUser.positionId && currentPosIds.includes(currentUser.positionId))));
  const isCreatorAssignedStep =
    !isCreatorRevisionTurn &&
    currentStep?.config?.assigneeMode === 'CREATOR' &&
    project.createdById === currentUser.id;
  const canEditEffective =
    canEditProject ||
    (isCreatorRevisionTurn && project.createdById === currentUser.id) ||
    isCreatorAssignedStep;
  const canForwardEffective =
    canForwardWorkflow ||
    (isCreatorRevisionTurn && project.createdById === currentUser.id) ||
    isCreatorAssignedStep;
  const canManageAttachmentsEffective =
    canManageAttachments ||
    (isCreatorRevisionTurn && project.createdById === currentUser.id) ||
    isCreatorAssignedStep;
  const singleStepActionLabel =
    !isCreatorRevisionTurn &&
    currentStep?.config?.allowedActions?.length === 1 &&
    currentStep.config.allowedActions[0] === 'APPROVE' &&
    currentStep.config.actionLabels?.APPROVE?.trim()
      ? currentStep.config.actionLabels.APPROVE.trim()
      : null;
  const hasCurrentUserApproved = Boolean(project.currentStepApprovalProgress?.hasCurrentUserApproved);
  const hasCurrentUserRequestedRevision = Boolean(
    project.currentStepApprovalProgress?.hasCurrentUserRequestedRevision
  );
  const hasCurrentUserRejected = Boolean(project.currentStepApprovalProgress?.hasCurrentUserRejected);
  const isExpired = project.isDeadlineExpired ?? isDeadlineExpired(project.deadline);

  const participatedCount = project.workflowParticipatedCount ?? 0;
  const totalWfParticipants = project.workflowTotalParticipants ?? 0;
  const wfProgressPct =
    totalWfParticipants > 0
      ? Math.min(100, Math.round((participatedCount / totalWfParticipants) * 100))
      : 0;

  const totalVotesCount = project.voteCounts?.total ?? (project.allVotes?.length || (project.hasVoted ? 1 : 0));
  const totalCouncil = project.totalCouncilMembers && project.totalCouncilMembers > 0 ? project.totalCouncilMembers : 4;
  const voteProgressPct = Math.min(100, Math.round((totalVotesCount / Math.max(totalCouncil, 1)) * 100));
  const attachmentCount = project.attachments?.length || 0;
  const majorityMeta = getMajorityMeta(project.majorityResult);
  const primaryStatusMeta = hasWorkflow ? getWorkflowStatusMeta(project.status) : majorityMeta;

  return (
    <div
      className={`bg-white rounded-2xl border transition-colors duration-150 ${
        isExpanded
          ? 'border-indigo-300 shadow-sm'
          : isMyTurnInWorkflow
          ? 'border-blue-200 hover:border-blue-300'
          : 'border-slate-200/90 hover:border-slate-300'
      }`}
    >
      {/* ===================== COMPACT OVERVIEW ROW (CLICK TO EXPAND) ===================== */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={handleToggleExpand}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggleExpand();
          }
        }}
        className="w-full px-4 py-3.5 cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-2xl"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
          {/* Column 1 (5 cols): Title + Codes + Metadata Strip */}
          <div className="lg:col-span-5 min-w-0 flex items-start gap-2.5">
            <span
              className={`mt-0.5 w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                isExpanded
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="text-sm font-bold text-slate-900 truncate">
                  {project.title}
                </h3>
                {isMyTurnInWorkflow && (
                  <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-600 text-white whitespace-nowrap">
                    نوبت شما
                  </span>
                )}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                <span className="font-mono tabular-nums font-semibold text-indigo-700" dir="ltr">
                  {project.code}
                </span>
                {project.workflowTrackingCode && (
                  <>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard?.writeText(project.workflowTrackingCode || '').catch(() => {});
                        setCopiedTrackingCode(true);
                        setTimeout(() => setCopiedTrackingCode(false), 1800);
                      }}
                      className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-600 hover:text-indigo-700 transition cursor-pointer"
                      title="کلیک برای کپی کد رهگیری گردش کار"
                    >
                      <span dir="ltr">{project.workflowTrackingCode}</span>
                      {copiedTrackingCode ? (
                        <Check className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <Copy className="w-3 h-3 text-slate-400" />
                      )}
                    </button>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="truncate">{project.projectTypeTitle || project.productionType || 'تولید محتوا'}</span>
                {attachmentCount > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-0.5 tabular-nums text-slate-500">
                      <Paperclip className="w-3 h-3" />
                      {attachmentCount}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Column 2 (2 cols): Workflow Stage & Current Position */}
          <div className="lg:col-span-2 min-w-0 text-xs flex lg:flex-col items-center lg:items-start justify-between gap-1">
            {isCreatorRevisionTurn ? (
              <>
                <span className="font-semibold text-amber-800 truncate max-w-full">
                  {project.currentTaskTitle || 'نیاز به اصلاح'}
                </span>
                <span className="text-[11px] text-amber-700 truncate max-w-full">
                  کارتابل ثبت‌کننده اولیه پروژه
                </span>
              </>
            ) : steps.length > 0 ? (
              <>
                <span className="font-semibold text-slate-800 truncate max-w-full">
                  {project.currentTaskTitle || currentStep?.title || project.workflowTitle || 'گردش کار'}
                </span>
                <span className="text-[11px] text-slate-500 tabular-nums truncate max-w-full">
                  گام {rawStepOrder} از {steps.length}
                  {currentStep?.config?.assigneeMode === 'CREATOR'
                    ? ' · ثبت‌کننده اولیه'
                    : project.currentPositionTitle
                    ? ` · ${project.currentPositionTitle}`
                    : ''}
                </span>
              </>
            ) : (
              <span className="text-[11px] text-slate-400">بدون گردش کار</span>
            )}
          </div>

          {/* Column 3 (2 cols): Workflow/Majority Status & Participation */}
          <div className="lg:col-span-2 min-w-0 flex lg:flex-col items-center lg:items-start justify-between gap-1">
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${primaryStatusMeta.textClass}`}>
              {primaryStatusMeta.icon}
              <span>{primaryStatusMeta.label}</span>
            </span>
            {hasWorkflow ? (
              <span className="text-[11px] text-slate-500 tabular-nums truncate max-w-full">
                {(project.majorityResult === 'APPROVED' || project.majorityResult === 'REJECTED')
                  ? `${majorityMeta.label} · `
                  : ''}
                مشارکت: {participatedCount} نفر
                {totalWfParticipants > 0 ? ` از ${totalWfParticipants}` : ''}
              </span>
            ) : (
              <span className="text-[11px] text-slate-500 tabular-nums">
                {totalVotesCount} از {totalCouncil} رای ({voteProgressPct}٪)
              </span>
            )}
          </div>

          {/* Column 4 (1 col / compact): Deadline & Budget */}
          <div className="lg:col-span-1 min-w-0 flex lg:flex-col items-center lg:items-start justify-between gap-1 text-[11px]">
            <span className={`tabular-nums truncate max-w-full ${isExpired ? 'text-rose-700 font-bold' : 'text-slate-600'}`}>
              {project.deadline ? project.deadline : 'بدون مهلت'}
            </span>
            <span className="text-slate-500 tabular-nums truncate max-w-full">
              {project.budgetEstimated ? formatBudgetDisplay(project.budgetEstimated) : '—'}
            </span>
          </div>

          {/* Column 5 (2 cols): Quick Status / Actions */}
          <div
            className="lg:col-span-2 flex items-center justify-end gap-1.5 flex-wrap"
            onClick={(e) => e.stopPropagation()}
          >
            {!hasWorkflow && canCastVote && !project.hasVoted && !isExpired && (
              <button
                type="button"
                onClick={() => onOpenVoteModal(project)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold transition cursor-pointer whitespace-nowrap shrink-0"
              >
                <VoteIcon className="w-3.5 h-3.5" />
                <span>ثبت رای</span>
              </button>
            )}

            {!hasWorkflow && canCastVote && project.hasVoted && (
              <button
                type="button"
                onClick={() => onOpenVoteModal(project)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-bold transition cursor-pointer whitespace-nowrap shrink-0"
                title="مشاهده یا ویرایش رای شما"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>رای ثبت شد</span>
              </button>
            )}

            {hasWorkflow && hasCurrentUserApproved && !isCompletedOrRejected && (
              <button
                type="button"
                onClick={() => onOpenWorkflowModal && onOpenWorkflowModal(project)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-bold transition cursor-pointer whitespace-nowrap shrink-0"
                title="تایید شما در این گام ثبت شده است"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>تایید شما ثبت شد</span>
              </button>
            )}

            {hasWorkflow &&
              !hasCurrentUserApproved &&
              hasCurrentUserRequestedRevision &&
              !isCompletedOrRejected && (
                <button
                  type="button"
                  onClick={() => onOpenWorkflowModal && onOpenWorkflowModal(project)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-bold transition cursor-pointer whitespace-nowrap shrink-0"
                  title="درخواست اصلاح شما در این گام ثبت شده است (در انتظار نظر سایر اعضا)"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>رای اصلاح ثبت شد</span>
                </button>
              )}

            {hasWorkflow &&
              !hasCurrentUserApproved &&
              !hasCurrentUserRequestedRevision &&
              hasCurrentUserRejected &&
              !isCompletedOrRejected && (
                <button
                  type="button"
                  onClick={() => onOpenWorkflowModal && onOpenWorkflowModal(project)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold transition cursor-pointer whitespace-nowrap shrink-0"
                  title="رای مخالف شما در این گام ثبت شده است"
                >
                  <XCircle className="w-3.5 h-3.5 text-rose-600" />
                  <span>رای مخالف ثبت شد</span>
                </button>
              )}

            {hasWorkflow &&
              !hasCurrentUserApproved &&
              !hasCurrentUserRequestedRevision &&
              !hasCurrentUserRejected &&
              canForwardEffective &&
              !isCompletedOrRejected &&
              (isMyTurnInWorkflow || currentUser.role === 'ADMIN') &&
              onOpenWorkflowModal && (
                <button
                  type="button"
                  onClick={() => onOpenWorkflowModal(project)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-white text-[11px] font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    isCreatorRevisionTurn
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                  title={isCreatorRevisionTurn ? 'ارسال مجدد پروژه اصلاح‌شده به گردش کار' : 'تایید و ارجاع مرحله'}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{isCreatorRevisionTurn ? 'ارسال مجدد' : singleStepActionLabel || 'ارجاع'}</span>
                </button>
              )}

            {hasWorkflow &&
              !hasCurrentUserApproved &&
              !hasCurrentUserRequestedRevision &&
              !hasCurrentUserRejected &&
              !canForwardEffective &&
              !isCompletedOrRejected &&
              isMyTurnInWorkflow && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-300 text-[10px] font-bold whitespace-nowrap shrink-0"
                  title="برای ثبت اقدام باید دسترسی «تایید و ارجاع در مراحل گردش کار» به کاربر یا سمت داده شود"
                >
                  <Lock className="w-3 h-3 text-amber-600" />
                  <span>نیاز به مجوز ارجاع</span>
                </span>
              )}

            {!hasWorkflow && !isExpanded && isExpired && !project.hasVoted && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 whitespace-nowrap">
                <Lock className="w-3 h-3" />
                منقضی
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ===================== EXPANDED FULL DETAILS PANEL ===================== */}
      {isExpanded && (
        <div className="px-5 pb-5 pt-4 border-t border-slate-100 space-y-5 animate-in fade-in duration-150">
          {/* Top Detail Toolbar: Tracking Code, Workflow, Majority Badge, Edit/Delete */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600">
              {project.workflowTitle && (
                <span className="inline-flex items-center gap-1 font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200/70">
                  <GitBranch className="w-3.5 h-3.5 text-indigo-500" />
                  {project.workflowTitle}
                </span>
              )}
              {isExpired && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200">
                  <Lock className="w-3.5 h-3.5 text-rose-600" />
                  مهلت ارزیابی پایان یافته
                </span>
              )}
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${primaryStatusMeta.bgClass}`}>
                {primaryStatusMeta.icon}
                {primaryStatusMeta.fullLabel}
              </span>
              {hasWorkflow &&
                (project.majorityResult === 'APPROVED' || project.majorityResult === 'REJECTED') && (
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${majorityMeta.bgClass}`}>
                    {majorityMeta.icon}
                    {majorityMeta.fullLabel}
                  </span>
                )}
              {project.currentTaskTitle && !isCompletedOrRejected && (
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                    isCreatorRevisionTurn
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-blue-50 border-blue-200 text-blue-800'
                  }`}
                >
                  کار فعلی: {project.currentTaskTitle}
                </span>
              )}
            </div>

            {(canEditEffective || canDeleteProject) && (
              <div className="flex items-center gap-1.5">
                {canEditEffective && onEditProject && (
                  <button
                    type="button"
                    onClick={() => onEditProject(project)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 transition cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>
                      {isCreatorRevisionTurn || isCreatorAssignedStep
                        ? 'ویرایش و بارگذاری فایل‌ها'
                        : 'ویرایش پروژه'}
                    </span>
                  </button>
                )}
                {canDeleteProject && onDeleteProject && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`آیا از حذف پروژه «${project.title}» اطمینان دارید؟`)) {
                        onDeleteProject(project.id);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Description */}
          {project.description && (
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-wrap bg-slate-50/70 p-3 rounded-xl border border-slate-100">
              {project.description}
            </p>
          )}

          {/* Participation Progress (Workflow Participants vs Legacy Council Voting) */}
          {hasWorkflow ? (
            <div className="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-100 text-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-700" />
                  <span className="text-xs font-bold text-slate-900">
                    وضعیت مشارکت:{' '}
                    <strong className="text-indigo-700 font-black tabular-nums">
                      {participatedCount} نفر
                    </strong>
                  </span>
                </div>

                <span className="text-[11px] font-bold text-indigo-700 tabular-nums">
                  {totalWfParticipants > 0
                    ? participatedCount >= totalWfParticipants
                      ? 'مشارکت کامل اعضای گردش کار'
                      : `از مجموع ${totalWfParticipants} نفر عضو گردش کار (${wfProgressPct}٪)`
                    : `${participatedCount} اقدام ثبت شده`}
                </span>
              </div>

              <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden mb-2.5">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                  style={{ width: `${wfProgressPct}%` }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 pt-1.5 border-t border-indigo-100">
                <div className="flex items-center gap-2 flex-wrap tabular-nums">
                  {isCreatorRevisionTurn ? (
                    <span className="text-amber-800 font-bold">
                      کارتابل ثبت‌کننده پروژه (نیازمند اصلاح و ارسال مجدد)
                    </span>
                  ) : !isCompletedOrRejected &&
                    project.currentStepApprovalProgress &&
                    (project.currentStepApprovalProgress.mode === 'MAJORITY' ||
                      project.currentStepApprovalProgress.mode === 'ALL' ||
                      project.currentStepApprovalProgress.revisionMode === 'MAJORITY' ||
                      project.currentStepApprovalProgress.revisionMode === 'ALL' ||
                      project.currentStepApprovalProgress.rejectMode === 'MAJORITY' ||
                      project.currentStepApprovalProgress.rejectMode === 'ALL' ||
                      project.currentStepApprovalProgress.voteCollectionMode === 'WAIT_ALL') ? (
                    <span className="text-violet-800 font-semibold">
                      {`موافق: ${project.currentStepApprovalProgress.approvedUserIds.length}/${project.currentStepApprovalProgress.requiredCount} | اصلاح: ${
                        project.currentStepApprovalProgress.revisionUserIds?.length || 0
                      }/${
                        project.currentStepApprovalProgress.revisionRequiredCount ??
                        project.currentStepApprovalProgress.requiredCount
                      } | مخالف: ${project.currentStepApprovalProgress.rejectedUserIds?.length || 0}/${
                        project.currentStepApprovalProgress.rejectRequiredCount ??
                        project.currentStepApprovalProgress.requiredCount
                      } (کل: ${project.currentStepApprovalProgress.totalAssignees}${
                        project.currentStepApprovalProgress.voteCollectionMode === 'WAIT_ALL'
                          ? ' · صبر تا همه'
                          : ''
                      })`}
                    </span>
                  ) : (
                    <span>
                      مرحله {rawStepOrder} از {steps.length}
                      {project.currentPositionTitle ? ` · ${project.currentPositionTitle}` : ''}
                    </span>
                  )}
                </div>

                <div>
                  {hasCurrentUserApproved && !isCompletedOrRejected ? (
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      تایید شما در این گام ثبت شده است
                    </span>
                  ) : hasCurrentUserRequestedRevision && !isCompletedOrRejected ? (
                    <span className="text-amber-800 font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      رای اصلاح شما ثبت شد (در انتظار سایر اعضا)
                    </span>
                  ) : hasCurrentUserRejected && !isCompletedOrRejected ? (
                    <span className="text-rose-700 font-bold flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5 text-rose-600" />
                      رای مخالف شما در این گام ثبت شده است
                    </span>
                  ) : isCompletedOrRejected ? (
                    <span className={`font-bold ${primaryStatusMeta.textClass}`}>
                      {primaryStatusMeta.label}
                    </span>
                  ) : canForwardEffective && isMyTurnInWorkflow && onOpenWorkflowModal ? (
                    <button
                      type="button"
                      onClick={() => onOpenWorkflowModal(project)}
                      className="text-blue-800 font-bold hover:text-blue-900 bg-blue-100/80 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-300 flex items-center gap-1 cursor-pointer transition"
                    >
                      <ArrowLeft className="w-3 h-3 text-blue-700" />
                      {isCreatorRevisionTurn
                        ? 'ارسال مجدد به گردش کار'
                        : singleStepActionLabel || 'ثبت اقدام گردش کار'}
                    </button>
                  ) : (
                    <span className="text-slate-500 font-medium">
                      در انتظار بررسی سمت‌های مرحله فعلی
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-100 text-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-700" />
                  <span className="text-xs font-bold text-slate-900">
                    وضعیت مشارکت:{' '}
                    <strong className="text-indigo-700 font-black tabular-nums">
                      {totalVotesCount} نفر از {totalCouncil} نفر رای داده‌اند
                    </strong>
                  </span>
                </div>

                <span className="text-[11px] font-bold text-indigo-700 tabular-nums">
                  {totalVotesCount >= totalCouncil ? 'تکمیل تمامی آرا' : `${voteProgressPct}٪ مشارکت`}
                </span>
              </div>

              <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden mb-2.5">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                  style={{ width: `${voteProgressPct}%` }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 pt-1.5 border-t border-indigo-100">
                <div className="flex items-center gap-4 tabular-nums">
                  {project.voteCounts && (
                    <>
                      <span className="text-emerald-700 font-semibold">
                        موافق: {project.voteCounts.APPROVED || 0}
                      </span>
                      <span className="text-rose-700 font-semibold">
                        مخالف: {project.voteCounts.REJECTED || 0}
                      </span>
                      <span className="text-amber-800 font-semibold">
                        نیاز به اصلاح: {project.voteCounts.NEEDS_REVISION || 0}
                      </span>
                    </>
                  )}
                </div>

                <div>
                  {project.hasVoted ? (
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      رای شما ثبت شده است
                    </span>
                  ) : isExpired ? (
                    <span className="text-rose-800 font-bold flex items-center gap-1 text-xs">
                      <Lock className="w-3.5 h-3.5 text-rose-600" />
                      مهلت رای‌گیری پایان یافته
                    </span>
                  ) : canCastVote ? (
                    <button
                      type="button"
                      onClick={() => onOpenVoteModal(project)}
                      className="text-amber-800 font-bold hover:text-amber-900 bg-amber-100/80 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-300 flex items-center gap-1 cursor-pointer transition"
                    >
                      <VoteIcon className="w-3 h-3 text-amber-700" />
                      رای شما ثبت نشده (ثبت رای)
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {/* Meta details: Deadline, Delivery Date, Budget */}
          {(project.deadline || project.deliveryDate || project.budgetEstimated) && (
            <div className="flex flex-wrap items-center gap-5 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200/70 text-xs">
              {project.deadline && (
                <div className="flex items-center gap-1.5 text-slate-700">
                  <Calendar className={`w-4 h-4 shrink-0 ${isExpired ? 'text-rose-600' : 'text-indigo-600'}`} />
                  <span className="text-slate-500">مهلت ارزیابی:</span>
                  <span className={`font-semibold tabular-nums ${isExpired ? 'text-rose-700' : 'text-slate-900'}`}>
                    {project.deadline}
                  </span>
                </div>
              )}
              {project.deliveryDate && (
                <div className="flex items-center gap-1.5 text-slate-700">
                  <PackageCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-slate-500">تاریخ حدودی تحویل:</span>
                  <span className="font-semibold tabular-nums text-slate-900">{project.deliveryDate}</span>
                </div>
              )}
              {project.budgetEstimated && (
                <div className="flex items-center gap-1.5 text-slate-700">
                  <Coins className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="text-slate-500">برآورد هزینه:</span>
                  <span className="font-bold tabular-nums text-slate-900">{formatBudgetDisplay(project.budgetEstimated)}</span>
                </div>
              )}
            </div>
          )}

          {/* Dynamic Requirements Section */}
          <div>
            <div className="text-xs font-bold text-slate-800 mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-indigo-600" />
                فیلدهای مصوب نیازهای پروژه (ساختار پویا)
              </span>
              <span className="text-[11px] text-slate-500 tabular-nums">
                {totalRequirementCount} فیلد ثبت شده
              </span>
            </div>

            {totalRequirementCount > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {visibleRootFields.map((fld) => {
                  const val = reqObj[fld.key];
                  const childNodes = (fld.children || []).filter(
                    (ch) => reqObj[ch.key] !== undefined && reqObj[ch.key] !== ''
                  );
                  const hasChildren = childNodes.length > 0;
                  const formattedVal =
                    fld.fieldType === 'currency' && val !== undefined && val !== ''
                      ? formatBudgetDisplay(String(val))
                      : val ?? '—';

                  return (
                    <div
                      key={fld.key}
                      className={`p-2.5 rounded-xl border flex flex-col justify-between ${
                        hasChildren
                          ? 'bg-indigo-50/40 border-indigo-200/90 col-span-2 sm:col-span-3 md:col-span-2'
                          : 'bg-slate-50 border-slate-200/80'
                      }`}
                    >
                      <div>
                        <span className="text-[11px] text-slate-500 font-medium truncate block mb-1">
                          {fld.name}
                        </span>
                        <div className="flex items-baseline justify-between gap-1">
                          <span className="text-sm font-extrabold text-indigo-600 truncate tabular-nums">
                            {formattedVal}
                          </span>
                          {fld.fieldType !== 'currency' && fld.unit && (
                            <span className="text-[10px] text-slate-500 font-normal shrink-0">
                              {fld.unit}
                            </span>
                          )}
                        </div>
                      </div>

                      {hasChildren && (
                        <div className="mt-2 pt-2 border-t border-indigo-200/60 flex flex-wrap gap-1.5">
                          {childNodes.map((ch) => {
                            const chVal = reqObj[ch.key];
                            const chDisplay =
                              ch.fieldType === 'currency'
                                ? formatBudgetDisplay(String(chVal))
                                : `${chVal}${ch.unit ? ` ${ch.unit}` : ''}`;
                            return (
                              <span
                                key={ch.key}
                                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg bg-white border border-indigo-200/70 text-slate-700"
                              >
                                <span className="text-slate-500">{ch.name}:</span>
                                <strong className="text-indigo-700 tabular-nums">{chDisplay}</strong>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {legacyEntries.map((req) => (
                  <div
                    key={req.key}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between"
                  >
                    <span className="text-[11px] text-slate-500 font-medium truncate mb-1">
                      {req.name}
                    </span>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-extrabold text-indigo-600 tabular-nums">{req.value}</span>
                      <span className="text-[10px] text-slate-500 font-normal">{req.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-slate-50 text-slate-500 text-xs text-center border border-slate-200">
                نیاز اختصاصی ثبت نشده است
              </div>
            )}
          </div>

          {/* Project Attachments & Files Section */}
          <div className="p-3.5 rounded-2xl bg-slate-50/70 border border-slate-200/90">
            <ProjectAttachments
              projectId={project.id}
              projectTitle={project.title}
              attachments={project.attachments || []}
              canManage={canManageAttachmentsEffective}
              onAttachmentChange={() => {
                if (onRefreshData) onRefreshData();
              }}
            />
          </div>

          {/* Workflow Progress & Transition Bar */}
          {steps.length > 0 && (
            <div
              className={`p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
                isMyTurnInWorkflow
                  ? 'bg-blue-50/70 border-blue-200'
                  : 'bg-slate-50/70 border-slate-200/80'
              }`}
            >
              <div className="flex items-center gap-2.5 flex-wrap text-xs">
                <GitBranch className="w-4 h-4 text-blue-700 shrink-0" />
                <span className="font-bold text-slate-900">
                  {project.status === 'APPROVED'
                    ? 'تصویب نهایی شده در گردش کار'
                    : project.status === 'REJECTED'
                    ? 'رد شده در گردش کار'
                    : isCreatorRevisionTurn
                    ? 'کارتابل ثبت‌کننده پروژه (نیازمند اصلاح و ارسال مجدد به گام ۱)'
                    : `مرحله ${rawStepOrder} از ${steps.length}: ${currentStep?.title || 'در حال بررسی'}`}
                </span>
                {!isCompletedOrRejected && !isCreatorRevisionTurn && project.currentPositionTitle && (
                  <span className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                    <Briefcase className="w-3 h-3 text-indigo-600" />
                    سمت(های) فعلی: {project.currentPositionTitle}
                  </span>
                )}
                {!isCompletedOrRejected &&
                  !isCreatorRevisionTurn &&
                  project.currentStepApprovalProgress &&
                  (project.currentStepApprovalProgress.mode === 'MAJORITY' ||
                    project.currentStepApprovalProgress.mode === 'ALL' ||
                    project.currentStepApprovalProgress.revisionMode === 'MAJORITY' ||
                    project.currentStepApprovalProgress.revisionMode === 'ALL' ||
                    project.currentStepApprovalProgress.rejectMode === 'MAJORITY' ||
                    project.currentStepApprovalProgress.rejectMode === 'ALL' ||
                    project.currentStepApprovalProgress.voteCollectionMode === 'WAIT_ALL') && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-violet-50 text-violet-800 border border-violet-200 tabular-nums">
                      {`موافق: ${project.currentStepApprovalProgress.approvedUserIds.length}/${project.currentStepApprovalProgress.requiredCount} | اصلاح: ${
                        project.currentStepApprovalProgress.revisionUserIds?.length || 0
                      }/${
                        project.currentStepApprovalProgress.revisionRequiredCount ??
                        project.currentStepApprovalProgress.requiredCount
                      } | مخالف: ${project.currentStepApprovalProgress.rejectedUserIds?.length || 0}/${
                        project.currentStepApprovalProgress.rejectRequiredCount ??
                        project.currentStepApprovalProgress.requiredCount
                      }${
                        project.currentStepApprovalProgress.voteCollectionMode === 'WAIT_ALL'
                          ? ' · صبر تا همه'
                          : ''
                      }`}
                    </span>
                  )}
                {!isCompletedOrRejected && !canManualApprove && (
                  <span className="text-[10px] font-medium text-slate-500">
                    (تایید نهایی فقط با تکمیل گردش کار)
                  </span>
                )}
                {!isCompletedOrRejected && isCreatorAssignedStep && currentStep?.config?.approveTarget !== 'END_APPROVED' && (
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                    در این گام می‌توانید مشخصات پروژه را ویرایش و فایل‌های ساخته‌شده را در بخش پیوست‌ها بارگذاری کنید، سپس ارسال نمایید.
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {canManualApprove && project.status !== 'APPROVED' && (
                  <button
                    type="button"
                    disabled={manualApproving}
                    onClick={handleManualApprove}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{manualApproving ? 'در حال ثبت...' : 'تایید نهایی دستی'}</span>
                  </button>
                )}

                {canForwardEffective && !isCompletedOrRejected && (isMyTurnInWorkflow || currentUser.role === 'ADMIN') && onOpenWorkflowModal ? (
                  <button
                    type="button"
                    onClick={() => onOpenWorkflowModal(project)}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-white text-xs font-bold transition cursor-pointer ${
                      isCreatorRevisionTurn
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>
                      {isCreatorRevisionTurn
                        ? 'ارسال مجدد اصلاحات به گردش کار'
                        : singleStepActionLabel || 'تایید و ارجاع گردش کار'}
                    </span>
                  </button>
                ) : !isCompletedOrRejected && isMyTurnInWorkflow && !canForwardEffective ? (
                  <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-300">
                    نوبت شماست (نیاز به دسترسی «تایید و ارجاع در مراحل گردش کار»)
                  </span>
                ) : !isCompletedOrRejected ? (
                  <span className="text-[11px] font-semibold text-slate-500 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                    {isCreatorRevisionTurn ? 'در کارتابل ثبت‌کننده پروژه جهت اصلاح' : 'نوبت بررسی با سمت دیگری است'}
                  </span>
                ) : null}
              </div>
            </div>
          )}

          {/* Project Status History & Workflow Audit Section */}
          {hasWorkflow && (canViewWorkflowHistory || canViewLiveStatus || steps.length > 0) && (
            <div className="p-4 rounded-2xl bg-slate-50/90 border border-slate-200/90 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <History className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="text-xs font-extrabold text-slate-900">
                    وضعیت پروژه، تاریخچه آرا و اقدامات گردش کار
                  </span>
                  {canViewWorkflowHistory && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white text-indigo-700 border border-indigo-200 tabular-nums">
                      {(project.workflowLogs || []).length} رویداد ثبت‌شده
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowWorkflowDetails((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                >
                  {showWorkflowDetails ? (
                    <>
                      <span>بستن جزئیات</span>
                      <ChevronUp className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      <span>مشاهده جزئیات و تاریخچه</span>
                      <ChevronDown className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              {showWorkflowDetails && (
                <div className="space-y-4 pt-1">
                  {/* 1. Steps roadmap with assignees & approval mode */}
                  {steps.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                        <GitBranch className="w-3.5 h-3.5 text-indigo-600" />
                        <span>مراحل گردش کار و مسئولان هر مرحله:</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {steps.map((st) => {
                          const isPast =
                            project.status === 'APPROVED' || (!isCreatorRevisionTurn && Number(rawStepOrder) > st.stepOrder);
                          const isCurrent =
                            !isCompletedOrRejected && !isCreatorRevisionTurn && Number(rawStepOrder) === st.stepOrder;
                          const stepMode = st.config?.approvalMode || 'SINGLE';
                          const modeLabel =
                            stepMode === 'ALL'
                              ? 'اجماع همه'
                              : stepMode === 'MAJORITY'
                              ? 'رای اکثریت'
                              : stepMode === 'NOTIFY_ONLY'
                              ? 'اطلاع‌رسانی'
                              : 'تک‌نفره';

                          return (
                            <div
                              key={st.id}
                              className={`p-2.5 rounded-xl border space-y-1.5 ${
                                isCurrent
                                  ? 'bg-blue-50/70 border-blue-300'
                                  : isPast
                                  ? 'bg-emerald-50/60 border-emerald-200'
                                  : 'bg-white border-slate-200'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1.5">
                                <span className="text-xs font-bold text-slate-900 truncate tabular-nums">
                                  گام {st.stepOrder}: {st.title}
                                </span>
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                                    isCurrent
                                      ? 'bg-blue-600 text-white'
                                      : isPast
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-slate-100 text-slate-500'
                                  }`}
                                >
                                  {isCurrent ? 'مرحله فعلی' : isPast ? 'تکمیل شده' : 'در انتظار'}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-600">
                                <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-semibold text-indigo-700">
                                  {modeLabel}
                                </span>
                                {st.config?.voteCollectionMode === 'WAIT_ALL' && (
                                  <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 font-semibold text-indigo-700">
                                    صبر تا اقدام همه
                                  </span>
                                )}
                                <span className="truncate">
                                  {st.config?.assigneeMode === 'CREATOR'
                                    ? 'ثبت‌کننده اولیه پروژه'
                                    : st.positions && st.positions.length > 0
                                    ? st.positions.map((p) => p.title).join('، ')
                                    : st.positionTitle || 'سمت نامشخص'}
                                </span>
                              </div>
                              {canViewLiveStatus && st.assignees && st.assignees.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-200/70">
                                  {st.assignees.map((u) => (
                                    <span
                                      key={u.id}
                                      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700"
                                    >
                                      {u.name}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 2. Live current step per-assignee status & comment */}
                  {!isCompletedOrRejected && !canViewLiveStatus && (
                    <div className="p-3 rounded-xl bg-white border border-slate-200 text-[11px] text-slate-500 flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>مشاهده وضعیت لحظه‌ای افراد در مرحله فعلی نیازمند دسترسی «دیدن وضعیت لحظه‌ای افراد» است.</span>
                    </div>
                  )}
                  {canViewLiveStatus &&
                    !isCompletedOrRejected &&
                    ((project.currentAssignees && project.currentAssignees.length > 0) ||
                      (project.currentStepApprovalProgress &&
                        (project.currentStepApprovalProgress.approvedUsers.length > 0 ||
                          (project.currentStepApprovalProgress.revisionUsers?.length || 0) > 0 ||
                          (project.currentStepApprovalProgress.rejectedUsers?.length || 0) > 0))) && (
                      <div className="space-y-2">
                        <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                          <span>
                            {isCreatorRevisionTurn
                              ? 'وضعیت کارتابل ثبت‌کننده (نیازمند اصلاح و ارسال مجدد):'
                              : `وضعیت لحظه‌ای افراد در مرحله فعلی (گام ${rawStepOrder}):`}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {(project.currentAssignees || []).map((assignee) => {
                            const approvedEntry = project.currentStepApprovalProgress?.approvedUsers.find(
                              (au) => au.userId === assignee.id
                            );
                            const revisionEntry = project.currentStepApprovalProgress?.revisionUsers?.find(
                              (rv) => rv.userId === assignee.id
                            );
                            const rejectedEntry = project.currentStepApprovalProgress?.rejectedUsers?.find(
                              (ru) => ru.userId === assignee.id
                            );
                            const activeEntry = approvedEntry || revisionEntry || rejectedEntry;

                            return (
                              <div
                                key={assignee.id}
                                className={`p-2.5 rounded-xl border space-y-1.5 ${
                                  approvedEntry
                                    ? 'bg-emerald-50/70 border-emerald-200'
                                    : revisionEntry
                                    ? 'bg-amber-50/70 border-amber-300'
                                    : rejectedEntry
                                    ? 'bg-rose-50/70 border-rose-200'
                                    : 'bg-white border-slate-200'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <span className="text-xs font-bold text-slate-900 truncate block">
                                      {assignee.name}
                                    </span>
                                    <span className="text-[10px] text-slate-500 truncate block">
                                      {assignee.positionTitle || assignee.sources.join(' • ')}
                                    </span>
                                  </div>
                                  {approvedEntry ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                                      <CheckCircle2 className="w-3 h-3" />
                                      تایید کرده
                                    </span>
                                  ) : revisionEntry ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
                                      <AlertTriangle className="w-3 h-3" />
                                      درخواست اصلاح
                                    </span>
                                  ) : rejectedEntry ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-rose-100 text-rose-800 border border-rose-300 shrink-0">
                                      <XCircle className="w-3 h-3" />
                                      رای مخالف
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                                      <Clock className="w-3 h-3" />
                                      در انتظار اقدام
                                    </span>
                                  )}
                                </div>
                                {activeEntry && (
                                  <div className="text-[11px] text-slate-700 bg-white/90 px-2.5 py-1.5 rounded-lg border border-slate-200/80 flex items-start justify-between gap-2">
                                    <span className="leading-relaxed">
                                      {activeEntry.comment ? (
                                        <>
                                          <strong className="text-indigo-700 ml-1">توضیح:</strong>
                                          {activeEntry.comment}
                                        </>
                                      ) : (
                                        <span className="text-slate-400">بدون توضیح تکمیلی</span>
                                      )}
                                    </span>
                                    <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                                      {new Date(activeEntry.createdAt).toLocaleTimeString('fa-IR', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  {/* 3. Chronological timeline of all user decisions & comments across steps */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                      <span>تاریخچه کامل انتخاب‌ها و توضیحات افراد در تمام مراحل:</span>
                    </div>
                    {!canViewWorkflowHistory ? (
                      <div className="p-3 rounded-xl bg-white border border-slate-200 text-[11px] text-slate-500 flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>مشاهده تاریخچه کامل انتخاب‌ها و توضیحات افراد نیازمند دسترسی «دیدن تاریخچه کامل انتخاب‌ها و توضیحات افراد» است.</span>
                      </div>
                    ) : project.workflowLogs && project.workflowLogs.length > 0 ? (
                      <div className="space-y-2">
                        {project.workflowLogs.map((log, idx) => {
                          const actionMeta = getActionBadgeMeta(log.action);
                          return (
                            <div
                              key={log.id}
                              className="p-3 rounded-xl bg-white border border-slate-200 text-xs space-y-1.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[10px] font-mono font-bold text-slate-400 tabular-nums">
                                    #{idx + 1}
                                  </span>
                                  <span
                                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${actionMeta.badgeClass}`}
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full ${actionMeta.dotClass}`} />
                                    {actionMeta.label}
                                  </span>
                                  {log.stepOrder > 0 && (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 tabular-nums">
                                      گام {log.stepOrder}
                                    </span>
                                  )}
                                  <span className="font-bold text-slate-900">
                                    {log.fromUserName || 'کاربر'}
                                  </span>
                                  {log.fromUsername && (
                                    <span className="text-[10px] font-mono text-slate-400" dir="ltr">
                                      @{log.fromUsername}
                                    </span>
                                  )}
                                  {log.fromUserPosition && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-600">
                                      {log.fromUserPosition}
                                    </span>
                                  )}
                                  {log.toPositionTitle &&
                                    ['FORWARD', 'NEEDS_REVISION', 'REJECTED', 'FINAL_APPROVED'].includes(log.action) && (
                                      <span className="text-[11px] text-slate-600">
                                        ← به: <strong>{log.toPositionTitle}</strong>
                                      </span>
                                    )}
                                </div>
                                <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                                  {new Date(log.createdAt).toLocaleDateString('fa-IR')} •{' '}
                                  {new Date(log.createdAt).toLocaleTimeString('fa-IR', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                              {log.comment ? (
                                <p className="text-xs text-slate-700 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200/80 leading-relaxed whitespace-pre-wrap">
                                  {log.comment}
                                </p>
                              ) : (
                                <p className="text-[11px] text-slate-400">
                                  بدون توضیح تکمیلی
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-500 text-center">
                        هنوز رویدادی در گردش کار این پروژه ثبت نشده است.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Personal Voting Action Section (only for non-workflow projects) */}
          {!hasWorkflow && canCastVote && (
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">وضعیت رای شما در کارتابل:</span>
                {project.hasVoted && project.userVote ? (
                  getVoteStatusBadge(project.userVote.status)
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    در انتظار ثبت نظر و رای شما
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => onOpenVoteModal(project)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white transition cursor-pointer"
              >
                <VoteIcon className="w-4 h-4" />
                <span>{project.hasVoted ? 'ویرایش یا بازبینی رای شما' : 'ثبت رای کارتابل'}</span>
              </button>
            </div>
          )}

          {/* Confidential Inspection Section (hidden for workflow projects without historical votes) */}
          {canViewConfidential && (!hasWorkflow || (project.allVotes && project.allVotes.length > 0)) && (
            <div className="pt-3 border-t border-slate-100">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-amber-600" />
                    خلاصه آرای اعضای شورا (مشاهده اختصاصی مدیر):
                  </span>
                  <span className="text-xs font-medium text-slate-500 tabular-nums">
                    ({project.voteCounts?.total || 0} از {project.totalCouncilMembers || 0} عضو)
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdminVotes(!showAdminVotes)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                >
                  {showAdminVotes ? (
                    <>
                      <span>بستن جدول آرا</span>
                      <ChevronUp className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      <span>مشاهده جزئیات و دلایل آرا ({project.allVotes?.length || 0})</span>
                      <ChevronDown className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2 mb-3 tabular-nums">
                <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-xl p-2 text-center">
                  <span className="text-[10px] text-emerald-800 block font-medium">موافق (تایید)</span>
                  <span className="text-sm font-extrabold text-emerald-700">{project.voteCounts?.APPROVED || 0}</span>
                </div>
                <div className="flex-1 bg-amber-50 border border-amber-300 rounded-xl p-2 text-center">
                  <span className="text-[10px] text-amber-900 block font-medium">نیاز به اصلاح</span>
                  <span className="text-sm font-extrabold text-amber-800">{project.voteCounts?.NEEDS_REVISION || 0}</span>
                </div>
                <div className="flex-1 bg-rose-50 border border-rose-200 rounded-xl p-2 text-center">
                  <span className="text-[10px] text-rose-800 block font-medium">مخالف (رد)</span>
                  <span className="text-sm font-extrabold text-rose-700">{project.voteCounts?.REJECTED || 0}</span>
                </div>
              </div>

              {showAdminVotes && (
                <div className="mt-3 space-y-2 animate-in fade-in duration-150">
                  {project.allVotes && project.allVotes.length > 0 ? (
                    project.allVotes.map((v) => (
                      <div
                        key={v.id}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center border border-indigo-200">
                              {v.userName ? v.userName.charAt(0) : 'U'}
                            </div>
                            <div>
                              <span className="text-xs font-bold text-slate-900 block">
                                {v.userName}
                              </span>
                              <span className="text-[10px] text-indigo-600">
                                سمت: {v.userPositionTitle || 'عضو شورا'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {getVoteStatusBadge(v.status)}
                            <span className="text-[10px] text-slate-400 tabular-nums">
                              {new Date(v.votedAt).toLocaleDateString('fa-IR')}
                            </span>
                          </div>
                        </div>

                        {v.reason ? (
                          <div className="text-xs text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200 leading-relaxed">
                            <span className="font-bold text-indigo-600 ml-1">شرح و ادله:</span>
                            {v.reason}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400">
                            بدون شرح تکمیلی
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="p-4 rounded-xl bg-slate-50 text-center text-xs text-slate-500 border border-slate-200">
                      هنوز هیچ رایی برای این پروژه در سامانه ثبت نشده است.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
