import React from 'react';
import { DashboardStats, Project, User } from '../types';
import { 
  BarChart3, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Clock, 
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
      <div className="p-8 text-center text-slate-400 text-xs">
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
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-cyan-400" />
            داشبورد تحلیلی و گزارش مصوبات جلسات شورا
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            بررسی آماری آرا، تجمیع رای اکثریت و گزارش پیشرفت مصوبات در کارتابل
          </p>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        
        {/* Total Projects */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-medium">کل پروژه‌ها</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold text-white">{stats.totalProjects}</span>
            <Layers className="w-4 h-4 text-cyan-400" />
          </div>
        </div>

        {/* Approved by Majority */}
        <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex flex-col justify-between">
          <span className="text-xs text-emerald-400 font-medium">اکثریت موافق (تایید)</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold text-emerald-300">{stats.approvedMajority}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
        </div>

        {/* Needs Revision by Majority */}
        <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/30 flex flex-col justify-between">
          <span className="text-xs text-amber-400 font-medium">اکثریت نیازمند اصلاح</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold text-amber-300">{stats.revisionMajority}</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
        </div>

        {/* Rejected by Majority */}
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/30 flex flex-col justify-between">
          <span className="text-xs text-rose-400 font-medium">اکثریت مخالف (رد)</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold text-rose-300">{stats.rejectedMajority}</span>
            <XCircle className="w-4 h-4 text-rose-400" />
          </div>
        </div>

        {/* Total Votes Cast */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-medium">آرای ثبت شده</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold text-cyan-300">{stats.totalVotesCast}</span>
            <FileText className="w-4 h-4 text-cyan-400" />
          </div>
        </div>

        {/* Council Turnout */}
        <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 flex flex-col justify-between">
          <span className="text-xs text-indigo-300 font-medium">نرخ مشارکت شورا</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold text-indigo-300">{participationRate}%</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
        </div>

      </div>

      {/* Rules and Workflow Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            اصول رای‌گیری و محرمانگی سامانه شورا
          </h3>
          <ul className="space-y-3 text-xs text-slate-300 leading-relaxed">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0 mt-1.5" />
              <span><strong>محرمانگی کامل:</strong> هیچ‌یک از اعضای شورا در کارتابل خود قادر به دیدن رای یا شرح ادله سایر اعضا نیستند؛ نظرات مستقیماً و منحصراً در پنل مدیر جلسه قرار می‌گیرد.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-1.5" />
              <span><strong>قاعده رای اکثریت:</strong> نتیجه نهایی هر پروژه به‌طور سیستمی بر پایه بیشترین تعداد آرا از میان ۳ حالت (تایید، رد، نیاز به اصلاح) تعیین می‌گردد.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mt-1.5" />
              <span><strong>شرح اجباری برای اصلاحات:</strong> هرگاه عضوی گزینه «نیاز به اصلاح» را برگزیند، سامانه ملزم می‌کند که علل فنی، مالی یا محتوایی را قید نماید.</span>
            </li>
          </ul>
        </div>

        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-indigo-400" />
            ترکیب اعضای فعال شورا و سمت‌ها
          </h3>
          <div className="space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-slate-800 text-cyan-400 font-bold text-[10px] flex items-center justify-center">
                    {u.name.charAt(0)}
                  </div>
                  <span className="font-semibold text-white">{u.name}</span>
                </div>
                <span className="text-[11px] text-cyan-400 font-medium">
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
