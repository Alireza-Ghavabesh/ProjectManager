export interface WorkflowActionMeta {
  label: string;
  badgeClass: string;
  dotClass: string;
}

export const WORKFLOW_ACTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'PROJECT_CREATED', label: 'ثبت اولیه پروژه' },
  { value: 'STEP_APPROVED', label: 'تایید عضو در مرحله' },
  { value: 'STEP_REJECTED', label: 'مخالفت عضو در مرحله' },
  { value: 'FORWARD', label: 'تایید و ارجاع مرحله' },
  { value: 'FINAL_APPROVED', label: 'تصویب نهایی' },
  { value: 'MANUAL_APPROVED', label: 'تایید نهایی دستی' },
  { value: 'NEEDS_REVISION', label: 'عودت جهت اصلاح' },
  { value: 'REJECTED', label: 'رد مرحله' },
  { value: 'STATUS_CHANGED', label: 'تغییر وضعیت پروژه' },
  { value: 'PROJECT_EDITED', label: 'ویرایش اطلاعات پروژه' },
  { value: 'VOTE_CAST', label: 'ثبت رای جدید' },
  { value: 'VOTE_UPDATED', label: 'ویرایش رای' },
  { value: 'ATTACHMENT_UPLOADED', label: 'بارگذاری پیوست' },
  { value: 'ATTACHMENT_DELETED', label: 'حذف پیوست' },
];

export function getActionBadgeMeta(action: string): WorkflowActionMeta {
  switch (action) {
    case 'PROJECT_CREATED':
      return {
        label: 'ثبت اولیه پروژه',
        badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
        dotClass: 'bg-sky-500',
      };
    case 'STEP_APPROVED':
      return {
        label: 'تایید در مرحله',
        badgeClass: 'bg-cyan-50 text-cyan-800 border-cyan-200',
        dotClass: 'bg-cyan-500',
      };
    case 'STEP_REJECTED':
      return {
        label: 'مخالفت در مرحله',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
        dotClass: 'bg-rose-400',
      };
    case 'FORWARD':
      return {
        label: 'تایید و ارجاع',
        badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
        dotClass: 'bg-indigo-500',
      };
    case 'FINAL_APPROVED':
      return {
        label: 'تصویب نهایی',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
        dotClass: 'bg-emerald-500',
      };
    case 'MANUAL_APPROVED':
      return {
        label: 'تایید نهایی دستی',
        badgeClass: 'bg-emerald-50 text-emerald-900 border-emerald-400',
        dotClass: 'bg-emerald-600',
      };
    case 'NEEDS_REVISION':
      return {
        label: 'عودت جهت اصلاح',
        badgeClass: 'bg-amber-50 text-amber-900 border-amber-300',
        dotClass: 'bg-amber-500',
      };
    case 'REJECTED':
      return {
        label: 'رد مرحله',
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
        dotClass: 'bg-rose-500',
      };
    case 'STATUS_CHANGED':
      return {
        label: 'تغییر وضعیت',
        badgeClass: 'bg-violet-50 text-violet-800 border-violet-200',
        dotClass: 'bg-violet-500',
      };
    case 'PROJECT_EDITED':
      return {
        label: 'ویرایش پروژه',
        badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
        dotClass: 'bg-slate-500',
      };
    case 'VOTE_CAST':
      return {
        label: 'ثبت رای',
        badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
        dotClass: 'bg-teal-500',
      };
    case 'VOTE_UPDATED':
      return {
        label: 'ویرایش رای',
        badgeClass: 'bg-cyan-50 text-cyan-800 border-cyan-200',
        dotClass: 'bg-cyan-500',
      };
    case 'ATTACHMENT_UPLOADED':
      return {
        label: 'بارگذاری پیوست',
        badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
        dotClass: 'bg-blue-500',
      };
    case 'ATTACHMENT_DELETED':
      return {
        label: 'حذف پیوست',
        badgeClass: 'bg-orange-50 text-orange-800 border-orange-200',
        dotClass: 'bg-orange-500',
      };
    default:
      return {
        label: action || 'عملیات',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
        dotClass: 'bg-slate-400',
      };
  }
}
