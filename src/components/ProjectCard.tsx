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
  MapPin, 
  Coins, 
  GitBranch,
  ChevronDown,
  ChevronUp,
  Vote as VoteIcon,
  ArrowLeft,
  Briefcase
} from 'lucide-react';

interface ProjectCardProps {
  project: Project;
  currentUser: User;
  dynamicFields: DynamicField[];
  onOpenVoteModal: (project: Project) => void;
  onOpenWorkflowModal?: (project: Project) => void;
  onEditProject?: (project: Project) => void;
  onDeleteProject?: (projectId: string) => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  currentUser,
  dynamicFields,
  onOpenVoteModal,
  onOpenWorkflowModal,
  onEditProject,
  onDeleteProject,
}) => {
  const [showAdminVotes, setShowAdminVotes] = useState(false);
  const isAdmin = currentUser.role === 'ADMIN';

  // Helper for majority badge
  const getMajorityBadge = (maj: string) => {
    switch (maj) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            تایید شده با رای اکثریت
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
            رد شده با رای اکثریت
          </span>
        );
      case 'NEEDS_REVISION':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            نیازمند اصلاح بر اساس نظر اکثریت
          </span>
        );
      case 'TIED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            برابری آرا (در انتظار جمع‌بندی)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            در حال جمع‌آوری آرا
          </span>
        );
    }
  };

  const getVoteStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            موافق / تایید
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
            <XCircle className="w-3 h-3 text-rose-400" />
            مخالف / رد
          </span>
        );
      case 'NEEDS_REVISION':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
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
    <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-3xl p-5 sm:p-6 shadow-xl transition duration-200">
      
      {/* Top Header: Code, Badges, Admin Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-black px-2.5 py-1 rounded-xl bg-slate-950 text-cyan-400 border border-slate-800">
            {project.code}
          </span>
          <span className="text-xs px-2.5 py-1 rounded-xl bg-slate-800/80 text-slate-300 border border-slate-700/60 font-medium">
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
                  className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition cursor-pointer"
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
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition cursor-pointer"
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
        <h3 className="text-lg font-bold text-white mb-2 leading-snug">
          {project.title}
        </h3>
        {project.description && (
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            {project.description}
          </p>
        )}
      </div>

      {/* Organizational Workflow Progress Bar */}
      {steps.length > 0 && (
        <div className="mb-5 p-3.5 rounded-2xl bg-gradient-to-r from-slate-950 via-indigo-950/30 to-slate-950 border border-indigo-500/30">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-indigo-500/20 text-indigo-400">
                <GitBranch className="w-3.5 h-3.5" />
              </span>
              <span className="text-xs font-bold text-white">
                گردش کار سازمانی: گام {project.currentStepOrder || 1} از {steps.length}
              </span>
              {currentStep && (
                <span className="text-xs text-cyan-300 font-semibold">
                  («{currentStep.title}»)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isMyTurnInWorkflow && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                  اکنون نوبت ارزیابی سمت شماست
                </span>
              )}

              {onOpenWorkflowModal && (
                <button
                  onClick={() => onOpenWorkflowModal(project)}
                  className="flex items-center gap-1 text-xs font-bold text-cyan-400 hover:text-cyan-300 transition cursor-pointer"
                >
                  <span>ارجاع در گردش کار</span>
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
            <span className="flex items-center gap-1">
              <Briefcase className="w-3 h-3 text-cyan-400" />
              سمت مسئول فعلی در چارت: <strong className="text-white">{project.currentPositionTitle || currentStep?.positionTitle || 'دبیرخانه شورا'}</strong>
            </span>
            <span className="text-[10px] text-slate-500">
              {project.workflowLogs?.length || 0} گردش ثبت شده
            </span>
          </div>
        </div>
      )}

      {/* Meta details: Deadline, Location, Budget */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-5 p-3 rounded-2xl bg-slate-950/60 border border-slate-800/60 text-xs">
        {project.deadline && (
          <div className="flex items-center gap-2 text-slate-300">
            <Calendar className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="text-slate-400">مهلت ارزیابی:</span>
            <span className="font-semibold text-white">{project.deadline}</span>
          </div>
        )}
        {project.location && (
          <div className="flex items-center gap-2 text-slate-300">
            <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-slate-400">محل/استودیو:</span>
            <span className="font-semibold text-white truncate">{project.location}</span>
          </div>
        )}
        {project.budgetEstimated && (
          <div className="flex items-center gap-2 text-slate-300">
            <Coins className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-slate-400">برآورد هزینه:</span>
            <span className="font-semibold text-white">{project.budgetEstimated}</span>
          </div>
        )}
      </div>

      {/* Dynamic Requirements Section */}
      <div className="mb-5">
        <div className="text-xs font-bold text-slate-300 mb-2.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            فیلدهای مصوب نیازهای پروژه (تعریف شده به صورت پویا):
          </span>
          <span className="text-[10px] text-slate-400">
            {requirementEntries.length} فیلد ثبت شده
          </span>
        </div>

        {requirementEntries.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {requirementEntries.map((req) => (
              <div
                key={req.key}
                className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50 flex flex-col justify-between"
              >
                <span className="text-[11px] text-slate-400 font-medium truncate mb-1">
                  {req.name}
                </span>
                <div className="flex items-baseline justify-between">
                  <span className="text-base font-extrabold text-cyan-300">
                    {req.value}
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {req.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-slate-950/40 text-slate-400 text-xs text-center border border-slate-800/60">
            نیاز اختصاصی ثبت نشده است
          </div>
        )}
      </div>

      {/* Role-Specific Voting Section */}
      {isAdmin ? (
        /* ======================== ADMIN VIEW ======================== */
        <div className="pt-4 border-t border-slate-800/80">
          
          {/* Tally Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                خلاصه آرای اعضای شورا (مشاهده اختصاصی مدیر):
              </span>
              <span className="text-xs font-medium text-slate-400">
                ({project.voteCounts?.total || 0} از {project.totalCouncilMembers || 0} عضو)
              </span>
            </div>

            <button
              onClick={() => setShowAdminVotes(!showAdminVotes)}
              className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition cursor-pointer"
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
            <div className="flex-1 bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-2 text-center">
              <span className="text-[10px] text-emerald-400 block font-medium">موافق (تایید)</span>
              <span className="text-sm font-extrabold text-emerald-300">{project.voteCounts?.APPROVED || 0}</span>
            </div>
            <div className="flex-1 bg-amber-950/40 border border-amber-500/30 rounded-xl p-2 text-center">
              <span className="text-[10px] text-amber-400 block font-medium">نیاز به اصلاح</span>
              <span className="text-sm font-extrabold text-amber-300">{project.voteCounts?.NEEDS_REVISION || 0}</span>
            </div>
            <div className="flex-1 bg-rose-950/40 border border-rose-500/30 rounded-xl p-2 text-center">
              <span className="text-[10px] text-rose-400 block font-medium">مخالف (رد)</span>
              <span className="text-sm font-extrabold text-rose-300">{project.voteCounts?.REJECTED || 0}</span>
            </div>
          </div>

          {/* Expandable Confidential Vote Rationale Table */}
          {showAdminVotes && (
            <div className="mt-3 space-y-2.5 animate-in fade-in duration-150">
              {project.allVotes && project.allVotes.length > 0 ? (
                project.allVotes.map((v) => (
                  <div
                    key={v.id}
                    className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-cyan-600/30 text-cyan-300 font-bold text-xs flex items-center justify-center border border-cyan-500/30">
                          {v.userName ? v.userName.charAt(0) : 'U'}
                        </div>
                        <div>
                          <span className="text-xs font-bold text-white block">
                            {v.userName}
                          </span>
                          <span className="text-[10px] text-cyan-400">
                            سمت: {v.userPositionTitle || 'عضو شورا'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {getVoteStatusBadge(v.status)}
                        <span className="text-[10px] text-slate-500">
                          {new Date(v.votedAt).toLocaleDateString('fa-IR')}
                        </span>
                      </div>
                    </div>

                    {/* Rationale / Reason */}
                    {v.reason ? (
                      <div className="text-xs text-slate-300 bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 leading-relaxed">
                        <span className="font-bold text-cyan-400 ml-1">شرح و ادله:</span>
                        {v.reason}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-500 italic">
                        بدون شرح تکمیلی
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-4 rounded-xl bg-slate-950/40 text-center text-xs text-slate-500 border border-slate-800/80">
                  هنوز هیچ رایی برای این پروژه در سامانه ثبت نشده است.
                </div>
              )}
            </div>
          )}

        </div>
      ) : (
        /* ======================== COUNCIL MEMBER VIEW ======================== */
        <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
          
          {/* Member's Confidential Vote Status */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">وضعیت در کارتابل شما:</span>
            {project.hasVoted && project.userVote ? (
              <div className="flex items-center gap-2">
                {getVoteStatusBadge(project.userVote.status)}
                <span className="text-[10px] text-emerald-400 font-medium">
                  (رای شما با موفقیت ثبت شد)
                </span>
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 animate-pulse">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                در انتظار ثبت نظر و رای شما
              </span>
            )}
          </div>

          {/* Action button */}
          <button
            onClick={() => onOpenVoteModal(project)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-xs font-bold text-white shadow-md shadow-cyan-600/20 transition cursor-pointer"
          >
            <VoteIcon className="w-4 h-4" />
            <span>{project.hasVoted ? 'ویرایش یا بازبینی رای شما' : 'ثبت رای کارتابل'}</span>
          </button>

        </div>
      )}

    </div>
  );
};
