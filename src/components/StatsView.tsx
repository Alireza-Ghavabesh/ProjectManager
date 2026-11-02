import React from 'react';
import { DashboardStats, Project, User } from '../types';
import { 
  BarChart3, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Users, 
  FileText, 
  ShieldCheck, 
  PieChart, 
  Layers 
} from 'lucide-react';

interface StatsViewProps {
  stats: DashboardStats | null;
  projects: Project[];
  users: User[];
}

export const StatsView: React.FC<StatsViewProps> = ({
  stats,
  projects,
  users,
}) => {
  if (!stats) {
    return (
      <div className="p-8 text-center text-slate-500 text-xs">
        در حال بارگذاری آمار و تحلیل شورا...
      </div>
    );
  }

  const councilUsers = users.filter((u) => u.role === 'COUNCIL');
  const participationRate = councilUsers.length > 0 && stats.totalProjects > 0
    ? Math.min(100, Math.round((stats.totalVotesCast / (stats.totalProjects * councilUsers.length)) * 100))
    : 0;

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <BarChart3 className="w-5 h-5" />
            </span>
            داشبورد تحلیلی و گزارش مصوبات جلسات شورا
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            بررسی آماری آرا، تجمیع رای اکثریت و گزارش پیشرفت مصوبات در کارتابل
          </p>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        
        {/* Total Projects */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-xs text-slate-500 font-medium">کل پروژه‌ها</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold text-slate-900">{stats.totalProjects}</span>
            <Layers className="w-4 h-4 text-blue-600" />
          </div>
        </div>

        {/* Approved by Majority */}
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-xs flex flex-col justify-between">
          <span className="text-xs text-emerald-700 font-semibold">اکثریت موافق (تایید)</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold text-emerald-800">{stats.approvedMajority}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
        </div>

        {/* Needs Revision by Majority */}
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 shadow-xs flex flex-col justify-between">
          <span className="text-xs text-amber-700 font-semibold">اکثریت نیازمند اصلاح</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold text-amber-800">{stats.revisionMajority}</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
        </div>

        {/* Rejected by Majority */}
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 shadow-xs flex flex-col justify-between">
          <span className="text-xs text-rose-700 font-semibold">اکثریت مخالف (رد)</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold text-rose-800">{stats.rejectedMajority}</span>
            <XCircle className="w-4 h-4 text-rose-600" />
          </div>
        </div>

        {/* Total Votes Cast */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-xs text-slate-500 font-medium">آرای ثبت شده</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold text-blue-700">{stats.totalVotesCast}</span>
            <FileText className="w-4 h-4 text-blue-600" />
          </div>
        </div>

        {/* Council Turnout */}
        <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 shadow-xs flex flex-col justify-between">
          <span className="text-xs text-indigo-700 font-semibold">نرخ مشارکت شورا</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold text-indigo-900">{participationRate}%</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
        </div>

      </div>

      {/* Rules and Workflow Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            اصول رای‌گیری و محرمانگی سامانه شورا
          </h3>
          <ul className="space-y-3 text-xs text-slate-600 leading-relaxed">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 mt-1.5" />
              <span><strong>محرمانگی کامل:</strong> هیچ‌یک از اعضای شورا در کارتابل خود قادر به دیدن رای یا شرح ادله سایر اعضا نیستند؛ نظرات مستقیماً و منحصراً در پنل مدیر جلسه قرار می‌گیرد.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5" />
              <span><strong>قاعده رای اکثریت:</strong> نتیجه نهایی هر پروژه به‌طور سیستمی بر پایه بیشترین تعداد آرا از میان ۳ حالت (تایید، رد، نیاز به اصلاح) تعیین می‌گردد.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0 mt-1.5" />
              <span><strong>شرح اجباری برای اصلاحات:</strong> هرگاه عضوی گزینه «نیاز به اصلاح» را برگزیند، سامانه ملزم می‌کند که علل فنی، مالی یا محتوایی را قید نماید.</span>
            </li>
          </ul>
        </div>

        <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-indigo-600" />
            ترکیب اعضای فعال شورا و سمت‌ها
          </h3>
          <div className="space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px] flex items-center justify-center">
                    {u.name.charAt(0)}
                  </div>
                  <span className="font-semibold text-slate-800">{u.name}</span>
                </div>
                <span className="text-[11px] text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {u.positionTitle || 'بدون سمت'}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
};
