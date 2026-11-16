import React, { useState, useEffect, useMemo } from 'react';
import {
  Workflow,
  Position,
  User,
  WorkflowTrackingItem,
} from '../types';
import { api } from '../services/api';
import { hasPerm } from '../utils/permissions';
import { getActionBadgeMeta, WORKFLOW_ACTION_OPTIONS } from '../utils/workflowActions';
import {
  Search,
  Copy,
  Check,
  User as UserIcon,
  Users,
  GitBranch,
  Calendar,
  Briefcase,
  Filter,
  RotateCcw,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  History,
  ArrowLeft,
  Hash,
  SlidersHorizontal,
  UserCheck,
  FolderTree,
  Lock,
} from 'lucide-react';

interface WorkflowTrackingViewProps {
  workflows: Workflow[];
  positions: Position[];
  users: User[];
  currentUser: User;
  onOpenWorkflowModalByProjectId?: (projectId: string) => void;
}

export const WorkflowTrackingView: React.FC<WorkflowTrackingViewProps> = ({
  workflows,
  positions,
  users,
  currentUser,
  onOpenWorkflowModalByProjectId,
}) => {
  const [items, setItems] = useState<WorkflowTrackingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Multi-criteria Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [personId, setPersonId] = useState('');
  const [personRole, setPersonRole] = useState<'CURRENT_ASSIGNEE' | 'CREATOR' | 'ANY'>('CURRENT_ASSIGNEE');
  const [workflowFilter, setWorkflowFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'IN_REVIEW' | 'APPROVED' | 'NEEDS_REVISION' | 'REJECTED'>('');
  const [deadlineFilter, setDeadlineFilter] = useState<'' | 'ACTIVE' | 'EXPIRED'>('');
  const [actionFilter, setActionFilter] = useState('');
  const [datePreset, setDatePreset] = useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM'>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<'CREATED_DESC' | 'CREATED_ASC' | 'UPDATED_DESC'>('CREATED_DESC');

  // UI state
  const [expandedProjectIds, setExpandedProjectIds] = useState<Record<string, boolean>>({});
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const canForwardWorkflow = hasPerm(currentUser, 'workflow.forward');
  const canViewHistory = hasPerm(currentUser, ['workflow.history.view', 'workflow.view', 'workflow.edit', 'workflow.forward']);

  const loadTracking = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getWorkflowTracking();
      setItems(data);
    } catch (err: any) {
      setError(err.message || 'خطا در دریافت اطلاعات رهگیری گردش کار');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTracking();
  }, [workflows.length]);

  const toIsoDateLocal = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const handleDatePreset = (preset: 'ALL' | 'TODAY' | 'WEEK' | 'MONTH') => {
    setDatePreset(preset);
    if (preset === 'ALL') {
      setDateFrom('');
      setDateTo('');
      return;
    }
    const now = new Date();
    const todayStr = toIsoDateLocal(now);
    if (preset === 'TODAY') {
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (preset === 'WEEK') {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      setDateFrom(toIsoDateLocal(d));
      setDateTo(todayStr);
    } else if (preset === 'MONTH') {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      setDateFrom(toIsoDateLocal(d));
      setDateTo(todayStr);
    }
  };

  const resetFilters = () => {
    setSearchQuery('');
    setPersonId('');
    setPersonRole('CURRENT_ASSIGNEE');
    setWorkflowFilter('');
    setPositionFilter('');
    setStatusFilter('');
    setDeadlineFilter('');
    setActionFilter('');
    setDatePreset('ALL');
    setDateFrom('');
    setDateTo('');
    setSortBy('CREATED_DESC');
  };

  const hasActiveFilters = Boolean(
    searchQuery ||
      personId ||
      workflowFilter ||
      positionFilter ||
      statusFilter ||
      deadlineFilter ||
      actionFilter ||
      dateFrom ||
      dateTo ||
      sortBy !== 'CREATED_DESC'
  );

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = items.filter((it) => {
      if (q) {
        const matchesText =
          (it.workflowTrackingCode || '').toLowerCase().includes(q) ||
          (it.projectCode || '').toLowerCase().includes(q) ||
          (it.projectTitle || '').toLowerCase().includes(q) ||
          (it.workflowTitle || '').toLowerCase().includes(q) ||
          (it.creatorName || '').toLowerCase().includes(q) ||
          (it.currentPositionTitle || '').toLowerCase().includes(q) ||
          it.currentAssignees.some(
            (a) =>
              a.name.toLowerCase().includes(q) ||
              a.username.toLowerCase().includes(q)
          );
        if (!matchesText) return false;
      }

      if (personId) {
        if (personRole === 'CURRENT_ASSIGNEE') {
          if (!it.currentAssignees.some((a) => a.id === personId)) return false;
        } else if (personRole === 'CREATOR') {
          if (it.creatorId !== personId) return false;
        } else {
          const involved =
            it.creatorId === personId ||
            it.currentAssignees.some((a) => a.id === personId) ||
            it.logs.some((l) => l.fromUserId === personId);
          if (!involved) return false;
        }
      }

      if (workflowFilter && it.workflowId !== workflowFilter) return false;
      if (
        positionFilter &&
        it.currentPositionId !== positionFilter &&
        !(it.currentPositionIds && it.currentPositionIds.includes(positionFilter))
      ) {
        return false;
      }
      if (statusFilter && it.status !== statusFilter) return false;
      if (deadlineFilter === 'EXPIRED' && !it.isDeadlineExpired) return false;
      if (deadlineFilter === 'ACTIVE' && it.isDeadlineExpired) return false;
      if (actionFilter && !it.logs.some((l) => l.action === actionFilter)) return false;

      const createdDate = (it.createdAt || '').slice(0, 10);
      if (dateFrom && createdDate < dateFrom) return false;
      if (dateTo && createdDate > dateTo) return false;

      return true;
    });

    filtered.sort((a, b) => {
      if (sortBy === 'CREATED_ASC') {
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      }
      if (sortBy === 'UPDATED_DESC') {
        return (b.updatedAt || '').localeCompare(a.updatedAt || '');
      }
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    return filtered;
  }, [
    items,
    searchQuery,
    personId,
    personRole,
    workflowFilter,
    positionFilter,
    statusFilter,
    deadlineFilter,
    actionFilter,
    dateFrom,
    dateTo,
    sortBy,
  ]);

  const counts = useMemo(
    () => ({
      total: items.length,
      inReview: items.filter((i) => i.status === 'IN_REVIEW').length,
      approved: items.filter((i) => i.status === 'APPROVED').length,
      needsRevision: items.filter((i) => i.status === 'NEEDS_REVISION').length,
      rejected: items.filter((i) => i.status === 'REJECTED').length,
    }),
    [items]
  );

  const handleCopyCode = (code: string) => {
    if (!code) return;
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopiedCode(code);
    setTimeout(() => setCopiedCode((prev) => (prev === code ? null : prev)), 1800);
  };

  const toggleExpand = (projectId: string) => {
    setExpandedProjectIds((prev) => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            تایید نهایی
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" />
            رد شده
          </span>
        );
      case 'NEEDS_REVISION':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            نیازمند اصلاح
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
            <Clock className="w-3 h-3 text-blue-600" />
            در حال بررسی
          </span>
        );
    }
  };

  const formatJalaliDateTime = (iso?: string) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      const dateStr = d.toLocaleDateString('fa-IR');
      const timeStr = d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
      return `${dateStr} • ${timeStr}`;
    } catch {
      return iso;
    }
  };

  const formatJalaliDateOnly = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(`${dateStr}T12:00:00`);
      return d.toLocaleDateString('fa-IR');
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-5">
      {/* Quick Status KPI Strip (clickable filters) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <button
          type="button"
          onClick={() => setStatusFilter('')}
          className={`p-3 rounded-2xl border text-right transition cursor-pointer ${
            statusFilter === ''
              ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
              : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
          }`}
        >
          <span className={`text-[10px] block font-semibold ${statusFilter === '' ? 'text-slate-300' : 'text-slate-500'}`}>
            کل پرونده‌های گردش کار
          </span>
          <span className="text-lg font-black">{counts.total}</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'IN_REVIEW' ? '' : 'IN_REVIEW')}
          className={`p-3 rounded-2xl border text-right transition cursor-pointer ${
            statusFilter === 'IN_REVIEW'
              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
              : 'bg-white text-slate-800 border-slate-200 hover:border-blue-300'
          }`}
        >
          <span className={`text-[10px] block font-semibold ${statusFilter === 'IN_REVIEW' ? 'text-blue-100' : 'text-blue-700'}`}>
            در حال بررسی و ارجاع
          </span>
          <span className="text-lg font-black">{counts.inReview}</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'NEEDS_REVISION' ? '' : 'NEEDS_REVISION')}
          className={`p-3 rounded-2xl border text-right transition cursor-pointer ${
            statusFilter === 'NEEDS_REVISION'
              ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
              : 'bg-white text-slate-800 border-slate-200 hover:border-amber-300'
          }`}
        >
          <span className={`text-[10px] block font-semibold ${statusFilter === 'NEEDS_REVISION' ? 'text-amber-100' : 'text-amber-700'}`}>
            نیازمند اصلاح
          </span>
          <span className="text-lg font-black">{counts.needsRevision}</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'APPROVED' ? '' : 'APPROVED')}
          className={`p-3 rounded-2xl border text-right transition cursor-pointer ${
            statusFilter === 'APPROVED'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
              : 'bg-white text-slate-800 border-slate-200 hover:border-emerald-300'
          }`}
        >
          <span className={`text-[10px] block font-semibold ${statusFilter === 'APPROVED' ? 'text-emerald-100' : 'text-emerald-700'}`}>
            تایید نهایی شده
          </span>
          <span className="text-lg font-black">{counts.approved}</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'REJECTED' ? '' : 'REJECTED')}
          className={`p-3 rounded-2xl border text-right transition cursor-pointer col-span-2 sm:col-span-1 ${
            statusFilter === 'REJECTED'
              ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
              : 'bg-white text-slate-800 border-slate-200 hover:border-rose-300'
          }`}
        >
          <span className={`text-[10px] block font-semibold ${statusFilter === 'REJECTED' ? 'text-rose-100' : 'text-rose-700'}`}>
            رد شده
          </span>
          <span className="text-lg font-black">{counts.rejected}</span>
        </button>
      </div>

      {/* Multi-Criteria Filter & Search Studio */}
      <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-black text-slate-900">
              جستجوی کد گردش کار و فیلترهای چندگانه کارتابل
            </h3>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              {filteredItems.length} نتیجه از {items.length} پرونده
            </span>
          </div>

          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>پاک کردن فیلترها</span>
              </button>
            )}
            <button
              type="button"
              onClick={loadTracking}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
              <span>بروزرسانی</span>
            </button>
          </div>
        </div>

        {/* Row 1: Workflow Code / Project Search + Person Filter + Person Mode */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              کد یونیک گردش کار، کد پروژه، عنوان یا نام شخص
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="مثلاً: WFL-8A4K2M یا عنوان پروژه یا نام کاربر..."
                className="w-full rounded-2xl bg-slate-50 focus:bg-white border border-slate-200 px-3.5 py-2 pr-9 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
            </div>
          </div>

          <div className="md:col-span-4">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              فیلتر بر اساس شخص
            </label>
            <select
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              className="w-full rounded-2xl bg-slate-50 focus:bg-white border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
            >
              <option value="">همه اشخاص</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.positionTitle || u.username})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              نقش شخص در پرونده
            </label>
            <select
              value={personRole}
              onChange={(e) => setPersonRole(e.target.value as any)}
              disabled={!personId}
              className="w-full rounded-2xl bg-slate-50 focus:bg-white border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
            >
              <option value="CURRENT_ASSIGNEE">در کارتابل فعلی شخص</option>
              <option value="CREATOR">ایجادکننده پروژه</option>
              <option value="ANY">همه مرتبط‌ها (کارتابل، ثبت، ارجاع)</option>
            </select>
          </div>
        </div>

        {/* Row 2: Workflow, Position, Deadline, Action Filter, Sort */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              فرآیند گردش کار
            </label>
            <select
              value={workflowFilter}
              onChange={(e) => setWorkflowFilter(e.target.value)}
              className="w-full rounded-2xl bg-slate-50 focus:bg-white border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
            >
              <option value="">همه گردش کارها</option>
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              سمت فعلی کارتابل
            </label>
            <select
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="w-full rounded-2xl bg-slate-50 focus:bg-white border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
            >
              <option value="">همه سمت‌ها</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              وضعیت مهلت ارزیابی
            </label>
            <select
              value={deadlineFilter}
              onChange={(e) => setDeadlineFilter(e.target.value as any)}
              className="w-full rounded-2xl bg-slate-50 focus:bg-white border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
            >
              <option value="">همه مهلت‌ها</option>
              <option value="ACTIVE">دارای مهلت فعال</option>
              <option value="EXPIRED">مهلت منقضی‌شده</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              نوع عملیات در تاریخچه
            </label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full rounded-2xl bg-slate-50 focus:bg-white border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
            >
              <option value="">همه عملیات</option>
              {WORKFLOW_ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              مرتب‌سازی نتایج
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full rounded-2xl bg-slate-50 focus:bg-white border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
            >
              <option value="CREATED_DESC">جدیدترین تاریخ ایجاد پروژه</option>
              <option value="CREATED_ASC">قدیمی‌ترین تاریخ ایجاد پروژه</option>
              <option value="UPDATED_DESC">آخرین بروزرسانی و ارجاع</option>
            </select>
          </div>
        </div>

        {/* Row 3: Creation Date Range Filter + Quick Presets */}
        <div className="pt-2 border-t border-slate-100 flex flex-col lg:flex-row lg:items-end justify-between gap-3">
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              بازه سریع تاریخ ایجاد پروژه:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { key: 'ALL' as const, label: 'همه زمان‌ها' },
                { key: 'TODAY' as const, label: 'امروز' },
                { key: 'WEEK' as const, label: '۷ روز اخیر' },
                { key: 'MONTH' as const, label: '۳۰ روز اخیر' },
              ].map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handleDatePreset(p.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                    datePreset === p.key
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                ایجاد شده از تاریخ {dateFrom ? `(${formatJalaliDateOnly(dateFrom)})` : ''}
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDatePreset('CUSTOM');
                  setDateFrom(e.target.value);
                }}
                dir="ltr"
                className="w-full rounded-2xl bg-slate-50 focus:bg-white border border-slate-200 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                تا تاریخ {dateTo ? `(${formatJalaliDateOnly(dateTo)})` : ''}
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDatePreset('CUSTOM');
                  setDateTo(e.target.value);
                }}
                dir="ltr"
                className="w-full rounded-2xl bg-slate-50 focus:bg-white border border-slate-200 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          {error}
        </div>
      )}

      {/* Results List */}
      {loading && items.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white border border-slate-200 text-slate-500 text-xs">
          در حال بارگذاری وضعیت گردش کار پروژه‌ها...
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white border border-slate-200 text-slate-500 space-y-3">
          <Filter className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-800">
            هیچ پرونده‌ای با فیلترهای انتخاب‌شده یافت نشد
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            کد گردش کار، فیلتر شخص یا بازه تاریخ ایجاد را تغییر دهید یا فیلترها را پاک کنید.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((item) => {
            const isExpanded = Boolean(expandedProjectIds[item.projectId]);
            const isFinished = item.status === 'APPROVED' || item.status === 'REJECTED';

            return (
              <div
                key={item.projectId}
                className="p-5 rounded-3xl bg-white border border-slate-200/90 hover:border-indigo-200 shadow-xs transition space-y-4"
              >
                {/* Top Identity Row: Unique Workflow Tracking Code + Project Title + Status */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleCopyCode(item.workflowTrackingCode)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-mono text-xs font-black shadow-2xs transition cursor-pointer"
                      title="کلیک برای کپی کد یونیک گردش کار"
                    >
                      <Hash className="w-3.5 h-3.5 text-indigo-200" />
                      <span dir="ltr">{item.workflowTrackingCode || 'بدون کد'}</span>
                      {copiedCode === item.workflowTrackingCode ? (
                        <Check className="w-3.5 h-3.5 text-emerald-300" />
                      ) : (
                        <Copy className="w-3 h-3 text-indigo-200" />
                      )}
                    </button>

                    <span className="font-mono text-[11px] font-bold px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 border border-slate-200">
                      {item.projectCode}
                    </span>

                    <h4 className="text-sm sm:text-base font-extrabold text-slate-900">
                      {item.projectTitle}
                    </h4>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {item.isDeadlineExpired && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                        <Lock className="w-3 h-3" />
                        مهلت منقضی
                      </span>
                    )}
                    {getStatusBadge(item.status)}
                  </div>
                </div>

                {/* Middle Row: Current Stage + WHOSE CARTABLE IT IS IN RIGHT NOW */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                  {/* Left: Workflow Stage & Creator Info */}
                  <div className="lg:col-span-5 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 font-medium flex items-center gap-1.5">
                        <GitBranch className="w-3.5 h-3.5 text-indigo-600" />
                        گردش کار:
                      </span>
                      <span className="font-bold text-slate-900">{item.workflowTitle}</span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 font-medium">مرحله فعلی:</span>
                      <span className="font-bold text-indigo-700">
                        {item.totalSteps > 0
                          ? `گام ${item.currentStepOrder} از ${item.totalSteps}${item.currentStepTitle ? ` (${item.currentStepTitle})` : ''}`
                          : 'بدون گام تعریف‌شده'}
                      </span>
                    </div>

                    <div className="flex items-start justify-between gap-2">
                      <span className="text-slate-500 font-medium shrink-0">سمت(های) متصدی فعلی:</span>
                      <div className="flex flex-wrap justify-end gap-1">
                        {item.currentPositions && item.currentPositions.length > 0 ? (
                          item.currentPositions.map((p) => (
                            <span
                              key={p.id}
                              className="inline-flex items-center gap-1 font-bold text-slate-800 bg-white px-2 py-0.5 rounded-lg border border-slate-200"
                            >
                              <Briefcase className="w-3 h-3 text-indigo-600" />
                              {p.title}
                            </span>
                          ))
                        ) : (
                          <span className="inline-flex items-center gap-1 font-bold text-slate-800 bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                            <Briefcase className="w-3 h-3 text-indigo-600" />
                            {item.currentPositionTitle || 'تعیین‌نشده'}
                          </span>
                        )}
                      </div>
                    </div>

                    {item.currentStepApprovalProgress &&
                      (item.currentStepApprovalProgress.mode === 'MAJORITY' ||
                        item.currentStepApprovalProgress.mode === 'ALL') &&
                      !isFinished && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-500 font-medium">نصاب تایید مرحله:</span>
                          <span className="font-bold text-violet-800 bg-violet-50 px-2 py-0.5 rounded-lg border border-violet-200 tabular-nums">
                            {item.currentStepApprovalProgress.approvedUserIds.length} از{' '}
                            {item.currentStepApprovalProgress.requiredCount} تایید لازم
                          </span>
                        </div>
                      )}

                    {item.currentStructureTitle && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500 font-medium">ساختار مرحله:</span>
                        <span className="inline-flex items-center gap-1 font-semibold text-indigo-700">
                          <FolderTree className="w-3 h-3" />
                          {item.currentStructureTitle}
                        </span>
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-slate-500">
                        ثبت‌کننده: <strong className="text-slate-800">{item.creatorName}</strong>
                      </span>
                      <span className="text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {formatJalaliDateTime(item.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Right: CURRENT ASSIGNEES IN CARTABLE */}
                  <div className="lg:col-span-7 p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4 text-indigo-600" />
                        {isFinished
                          ? 'وضعیت کارتابل (پرونده مختومه / نهایی شده):'
                          : 'هم‌اکنون در کارتابل این اشخاص قرار دارد:'}
                      </span>
                      {!isFinished && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white text-indigo-700 border border-indigo-200">
                          {item.currentAssignees.length} نفر
                        </span>
                      )}
                    </div>

                    {isFinished ? (
                      <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-600">
                        {item.status === 'APPROVED'
                          ? 'این پروژه در گردش کار به تصویب نهایی رسیده است و در انتظار اقدام هیچ شخصی نیست.'
                          : 'این پروژه در گردش کار رد و مختومه شده است.'}
                      </div>
                    ) : item.currentAssignees.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {item.currentAssignees.map((assignee) => (
                          <div
                            key={assignee.id}
                            className="p-2.5 rounded-xl bg-white border border-indigo-200/80 flex items-center gap-2.5 shadow-2xs"
                          >
                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-black text-xs flex items-center justify-center border border-indigo-200 shrink-0">
                              {assignee.name.charAt(0)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1">
                                <span className="truncate">{assignee.name}</span>
                                <span className="text-[10px] font-mono text-slate-400 shrink-0" dir="ltr">
                                  @{assignee.username}
                                </span>
                              </div>
                              <div className="text-[10px] text-indigo-600 truncate mt-0.5">
                                {assignee.sources.join(' • ')}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          در حال حاضر هیچ کاربری به سمت «{item.currentPositionTitle || 'فعلی'}» منتسب نشده است.
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Compact Latest Operation / Status Preview */}
                {canViewHistory && item.logs.length > 0 && (() => {
                  const lastLog = item.logs[item.logs.length - 1];
                  const lastMeta = getActionBadgeMeta(lastLog.action);
                  return (
                    <div className="px-3.5 py-2.5 rounded-2xl bg-slate-50/90 border border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1 shrink-0">
                          <History className="w-3.5 h-3.5 text-indigo-600" />
                          آخرین وضعیت / عملیات ثبت‌شده:
                        </span>
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${lastMeta.badgeClass}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${lastMeta.dotClass}`} />
                          {lastMeta.label}
                        </span>
                        <span className="font-bold text-slate-800">
                          {lastLog.fromUserName || 'کاربر'}
                        </span>
                        {lastLog.comment && (
                          <span className="text-[11px] text-slate-500 truncate max-w-md">
                            — {lastLog.comment}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {formatJalaliDateTime(lastLog.createdAt)}
                      </span>
                    </div>
                  );
                })()}

                {/* Bottom Action & Expand Strip */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => toggleExpand(item.projectId)}
                    className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="w-4 h-4" />
                        <span>بستن تاریخچه کامل وضعیت، عملیات و نقشه گام‌ها</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        <span>
                          مشاهده تاریخچه کامل وضعیت، عملیات و نقشه گام‌ها ({item.logs.length} رویداد)
                        </span>
                      </>
                    )}
                  </button>

                  {!isFinished &&
                    canForwardWorkflow &&
                    onOpenWorkflowModalByProjectId &&
                    (item.currentAssignees.some((a) => a.id === currentUser.id) || currentUser.role === 'ADMIN') && (
                      <button
                        type="button"
                        onClick={() => onOpenWorkflowModalByProjectId(item.projectId)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>تایید و ارجاع مرحله</span>
                      </button>
                    )}
                </div>

                {/* Expanded Roadmap & Transition Logs */}
                {isExpanded && (
                  <div className="pt-3 border-t border-slate-100 space-y-4 animate-in fade-in duration-150">
                    {/* Visual Steps with Assignees per Step */}
                    {item.steps.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-indigo-600" />
                          <span>مراحل گردش کار و اشخاص متصدی هر گام:</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                          {item.steps.map((st) => {
                            const isPast =
                              item.status === 'APPROVED' || item.currentStepOrder > st.stepOrder;
                            const isCurrent =
                              item.status !== 'APPROVED' &&
                              item.status !== 'REJECTED' &&
                              item.currentStepOrder === st.stepOrder;

                            return (
                              <div
                                key={st.id}
                                className={`p-3 rounded-2xl border space-y-2 ${
                                  isCurrent
                                    ? 'bg-blue-50/70 border-blue-400 ring-2 ring-blue-500/15'
                                    : isPast
                                    ? 'bg-emerald-50/50 border-emerald-200'
                                    : 'bg-slate-50 border-slate-200'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1.5">
                                  <span className="text-xs font-bold text-slate-900 truncate">
                                    {st.stepOrder}. {st.title}
                                  </span>
                                  {isCurrent ? (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white shrink-0">
                                      مرحله فعلی
                                    </span>
                                  ) : isPast ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                  ) : null}
                                </div>

                                <div className="flex flex-wrap gap-1">
                                  {st.positions && st.positions.length > 0 ? (
                                    st.positions.map((p) => (
                                      <span
                                        key={p.id}
                                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-white px-1.5 py-0.5 rounded-md border border-indigo-200/80"
                                      >
                                        <Briefcase className="w-2.5 h-2.5 shrink-0" />
                                        {p.title}
                                      </span>
                                    ))
                                  ) : (
                                    <div className="text-[11px] font-semibold text-indigo-700 flex items-center gap-1">
                                      <Briefcase className="w-3 h-3 shrink-0" />
                                      <span className="truncate">{st.positionTitle}</span>
                                    </div>
                                  )}
                                </div>

                                <div className="pt-1 border-t border-slate-200/70 flex flex-wrap gap-1">
                                  {st.assignees && st.assignees.length > 0 ? (
                                    st.assignees.map((u) => (
                                      <span
                                        key={u.id}
                                        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium"
                                      >
                                        <UserIcon className="w-2.5 h-2.5 text-indigo-500" />
                                        {u.name}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-[10px] text-slate-400">
                                      بدون شخص منتسب
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Full Project Status & Operations Audit Timeline */}
                    {canViewHistory && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <History className="w-3.5 h-3.5 text-blue-600" />
                            <span>تاریخچه کامل وضعیت و عملیات انجام‌شده روی پروژه:</span>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                            {item.logs.length} رویداد ثبت‌شده
                          </span>
                        </div>
                        {item.logs.length > 0 ? (
                          <div className="relative pr-5 space-y-3 before:content-[''] before:absolute before:top-2 before:bottom-2 before:right-2 before:w-0.5 before:bg-slate-200">
                            {item.logs.map((log, idx) => {
                              const actionMeta = getActionBadgeMeta(log.action);
                              return (
                                <div key={log.id} className="relative">
                                  <span
                                    className={`w-3 h-3 rounded-full ring-4 ring-white border border-white absolute -right-4 top-3.5 ${actionMeta.dotClass}`}
                                  />
                                  <div className="p-3.5 rounded-2xl bg-slate-50/90 border border-slate-200/90 text-xs flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                                    <div className="space-y-1.5 min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[10px] font-mono font-bold text-slate-400">
                                          #{idx + 1}
                                        </span>
                                        <span
                                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${actionMeta.badgeClass}`}
                                        >
                                          {actionMeta.label}
                                        </span>
                                        {log.stepOrder > 0 && (
                                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-600">
                                            گام {log.stepOrder}
                                          </span>
                                        )}
                                        <span className="font-bold text-slate-900">
                                          {log.fromUserName || 'کاربر'}
                                        </span>
                                        {log.fromUsername && (
                                          <span
                                            className="text-[10px] font-mono text-slate-400"
                                            dir="ltr"
                                          >
                                            @{log.fromUsername}
                                          </span>
                                        )}
                                        {log.fromUserPosition && (
                                          <span className="text-[10px] px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-600">
                                            {log.fromUserPosition}
                                          </span>
                                        )}
                                        {log.toPositionTitle &&
                                          ['FORWARD', 'NEEDS_REVISION', 'REJECTED', 'FINAL_APPROVED'].includes(log.action) && (
                                            <span className="text-[11px] text-slate-600">
                                              ← به سمت: <strong>{log.toPositionTitle}</strong>
                                            </span>
                                          )}
                                      </div>
                                      {log.comment && (
                                        <p className="text-[11px] text-slate-700 leading-relaxed bg-white/80 px-3 py-1.5 rounded-xl border border-slate-200/70">
                                          {log.comment}
                                        </p>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-slate-500 font-medium shrink-0 flex items-center gap-1">
                                      <Clock className="w-3 h-3 text-slate-400" />
                                      {formatJalaliDateTime(log.createdAt)}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500">
                            هنوز رویدادی در تاریخچه این پروژه ثبت نشده است.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
