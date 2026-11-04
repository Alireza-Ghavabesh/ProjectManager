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
  Briefcase
} from 'lucide-react';

import { ProjectAttachments } from './ProjectAttachments';
import { formatBudgetDisplay } from '../utils/formatters';

interface ProjectCardProps {
  project: Project;
  currentUser: User;
  dynamicFields: DynamicField[];
  onOpenVoteModal: (project: Project) => void;
  onOpenWorkflowModal?: (project: Project) => void;
  onEditProject?: (project: Project) => void;
  onDeleteProject?: (projectId: string) => void;
  onRefreshData?: () => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  currentUser,
  dynamicFields,
  onOpenVoteModal,
  onOpenWorkflowModal,
  onEditProject,
  onDeleteProject,
  onRefreshData,
}) => {
  const [showAdminVotes, setShowAdminVotes] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const isAdmin = currentUser.role === 'ADMIN';

  // Helper for majority badge
  const getMajorityBadge = (maj: string) => {
    switch (maj) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            تایید شده با رای اکثریت
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200 shadow-2xs">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            رد شده با رای اکثریت
          </span>
        );
      case 'NEEDS_REVISION':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 shadow-2xs">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            نیازمند اصلاح بر اساس نظر اکثریت
          </span>
        );
      case 'TIED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-indigo-600" />
            برابری آرا (در انتظار جمع‌بندی)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            در حال جمع‌آوری آرا
          </span>
        );
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

  // Map dynamic field values
  const requirementEntries = Object.entries(project.requirements || {}).map(([key, val]) => {
    const fld = dynamicFields.find((f) => f.key === key);
    return {
      key,
      name: fld ? fld.name : key,
      unit: fld ? fld.unit || 'نفر' : '',
      value: val,
    };
  });

  const steps = project.workflowSteps || [];
  const currentStep = steps.find((s) => s.stepOrder === project.currentStepOrder);
  const isMyTurnInWorkflow = currentUser.positionId && currentUser.positionId === project.currentPositionId;

  return (
    <div className="bg-white border border-slate-200/90 hover:border-slate-300 rounded-3xl p-5 sm:p-6 shadow-xs hover:shadow-sm transition duration-200">
      
      {/* Top Header: Code, Badges, Admin Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-black px-2.5 py-1 rounded-xl bg-slate-100 text-indigo-700 border border-slate-200">
            {project.code}
          </span>
          <span className="text-xs px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 font-medium">
            {project.productionType || 'تولید محتوا'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Majority status */}
          {getMajorityBadge(project.majorityResult)}

          {/* Admin delete & edit */}
          {isAdmin && (
            <div className="flex items-center gap-1 mr-2">
              {onEditProject && (
                <button
                  onClick={() => onEditProject(project)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition cursor-pointer"
                  title="ویرایش پروژه"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              )}
              {onDeleteProject && (
                <button
                  onClick={() => {
                    if (confirm(`آیا از حذف پروژه «${project.title}» اطمینان دارید؟`)) {
                      onDeleteProject(project.id);
                    }
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                  title="حذف پروژه"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Title & Description */}
      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-900 mb-2 leading-snug">
          {project.title}
        </h3>
        {project.description && (
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-wrap bg-slate-50/50 p-2.5 rounded-xl border border-slate-100">
            {project.description}
          </p>
        )}
      </div>

      {/* Council Voting Tally and Participation Progress */}
      <div className="mb-5 p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-100/90 text-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-indigo-100 text-indigo-700 shadow-2xs">
              <Users className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-slate-900">
              وضعیت مشارکت شورا: <strong className="text-indigo-700 font-black text-sm">{project.voteCounts?.total ?? (project.allVotes?.length || (project.hasVoted ? 1 : 0))} تا از {project.totalCouncilMembers && project.totalCouncilMembers > 0 ? project.totalCouncilMembers : 4} نفر شورا رای داده‌اند</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {(project.voteCounts?.total ?? (project.allVotes?.length || 0)) >= (project.totalCouncilMembers && project.totalCouncilMembers > 0 ? project.totalCouncilMembers : 4) ? (
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                تکمیل تمامی آرا
              </span>
            ) : (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                {Math.round(((project.voteCounts?.total ?? (project.allVotes?.length || (project.hasVoted ? 1 : 0))) / Math.max(project.totalCouncilMembers && project.totalCouncilMembers > 0 ? project.totalCouncilMembers : 4, 1)) * 100)}٪ آرا
              </span>
            )}
          </div>
        </div>

        {/* Participation Progress Bar */}
        <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden mb-2.5">
          <div
            className="h-full bg-indigo-600 rounded-full transition-all duration-300"
            style={{
              width: `${Math.min(100, Math.round(((project.voteCounts?.total ?? (project.allVotes?.length || (project.hasVoted ? 1 : 0))) / Math.max(project.totalCouncilMembers && project.totalCouncilMembers > 0 ? project.totalCouncilMembers : 4, 1)) * 100))}%`
            }}
          />
        </div>

        {/* Voting summary and User vote status */}
        <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-600 pt-1.5 border-t border-indigo-100">
          <div className="flex items-center gap-3">
            {project.voteCounts && (
              <>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  موافق: {project.voteCounts.APPROVED || 0}
                </span>
                <span className="text-rose-700 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                  مخالف: {project.voteCounts.REJECTED || 0}
                </span>
                <span className="text-amber-700 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
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
            ) : currentUser.role === 'COUNCIL' ? (
              <button
                onClick={() => onOpenVoteModal(project)}
                className="text-amber-800 font-bold hover:text-amber-900 bg-amber-100/80 hover:bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-300 flex items-center gap-1 cursor-pointer transition"
              >
                <VoteIcon className="w-3 h-3 text-amber-700" />
                رای شما ثبت نشده (ثبت رای)
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Meta details: Deadline, Budget */}
      <div className="flex flex-wrap items-center gap-4 mb-5 p-3 rounded-2xl bg-slate-50 border border-slate-200/70 text-xs">
        {project.deadline && (
          <div className="flex items-center gap-2 text-slate-700">
            <Calendar className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="text-slate-500">مهلت ارزیابی:</span>
            <span className="font-semibold text-slate-900">{project.deadline}</span>
          </div>
        )}
        {project.budgetEstimated && (
          <div className="flex items-center gap-2 text-slate-700">
            <Coins className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-slate-500">برآورد هزینه:</span>
            <span className="font-bold text-slate-900">{formatBudgetDisplay(project.budgetEstimated)}</span>
          </div>
        )}
      </div>

      {/* Dynamic Requirements Section */}
      <div className="mb-5">
        <div className="text-xs font-bold text-slate-800 mb-2.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-indigo-600" />
            فیلدهای مصوب نیازهای پروژه (تعریف شده به صورت پویا):
          </span>
          <span className="text-[10px] text-slate-500">
            {requirementEntries.length} فیلد ثبت شده
          </span>
        </div>

        {requirementEntries.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {requirementEntries.map((req) => (
              <div
                key={req.key}
                className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between"
              >
                <span className="text-[11px] text-slate-500 font-medium truncate mb-1">
                  {req.name}
                </span>
                <div className="flex items-baseline justify-between">
                  <span className="text-base font-extrabold text-indigo-600">
                    {req.value}
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">
                    {req.unit}
                  </span>
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
      <div className="mb-5 p-4 rounded-2xl bg-slate-50/70 border border-slate-200/90">
        <ProjectAttachments
          projectId={project.id}
          projectTitle={project.title}
          attachments={project.attachments || []}
          canManage={isAdmin}
          onAttachmentChange={() => {
            if (onRefreshData) onRefreshData();
          }}
        />
      </div>

      {/* Role-Specific Voting Section */}
      {isAdmin ? (
        /* ======================== ADMIN VIEW ======================== */
        <div className="pt-4 border-t border-slate-100">
          
          {/* Tally Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-600" />
                خلاصه آرای اعضای شورا (مشاهده اختصاصی مدیر):
              </span>
              <span className="text-xs font-medium text-slate-500">
                ({project.voteCounts?.total || 0} از {project.totalCouncilMembers || 0} عضو)
              </span>
            </div>

            <button
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

          {/* Counts pill row */}
          <div className="flex items-center gap-2 mb-3">
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

          {/* Expandable Confidential Vote Rationale Table */}
          {showAdminVotes && (
            <div className="mt-3 space-y-2.5 animate-in fade-in duration-150">
              {project.allVotes && project.allVotes.length > 0 ? (
                project.allVotes.map((v) => (
                  <div
                    key={v.id}
                    className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col gap-2"
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
                        <span className="text-[10px] text-slate-400">
                          {new Date(v.votedAt).toLocaleDateString('fa-IR')}
                        </span>
                      </div>
                    </div>

                    {/* Rationale / Reason */}
                    {v.reason ? (
                      <div className="text-xs text-slate-700 bg-white p-2.5 rounded-xl border border-slate-200 leading-relaxed shadow-2xs">
                        <span className="font-bold text-indigo-600 ml-1">شرح و ادله:</span>
                        {v.reason}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 italic">
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
      ) : (
        /* ======================== COUNCIL MEMBER VIEW ======================== */
        <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          
          {/* Member's Confidential Vote Status */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">وضعیت در کارتابل شما:</span>
            {project.hasVoted && project.userVote ? (
              <div className="flex items-center gap-2">
                {getVoteStatusBadge(project.userVote.status)}
                <span className="text-[10px] text-emerald-700 font-semibold">
                  (رای شما با موفقیت ثبت شد)
                </span>
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 animate-pulse">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                در انتظار ثبت نظر و رای شما
              </span>
            )}
          </div>

          {/* Action button */}
          <button
            onClick={() => onOpenVoteModal(project)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition cursor-pointer"
          >
            <VoteIcon className="w-4 h-4" />
            <span>{project.hasVoted ? 'ویرایش یا بازبینی رای شما' : 'ثبت رای کارتابل'}</span>
          </button>

        </div>
      )}

    </div>
  );
};
