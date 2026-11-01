import React from 'react';
import { User } from '../types';
import { PWAInstallButton } from '../pwa/PWAComponents';
import { 
  Building2, 
  Menu, 
  Layers, 
  Sliders, 
  Users, 
  MessageSquare, 
  BarChart3, 
  Network, 
  GitBranch,
  Sparkles,
  ChevronDown
} from 'lucide-react';

interface HeaderProps {
  currentUser: User;
  activeTab: 'projects' | 'fields' | 'users' | 'org' | 'workflow' | 'chat' | 'stats';
  onSwitchUser: (username: string) => void;
  allUsers: User[];
  onOpenMobileMenu: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  activeTab,
  onSwitchUser,
  allUsers,
  onOpenMobileMenu,
}) => {
  const getTabInfo = () => {
    switch (activeTab) {
      case 'projects':
        return { title: 'کارتابل مصوبات و پروژه‌ها', icon: Layers, desc: 'مشاهده طرح‌ها، ثبت آرا محرمانه و رای اکثریت' };
      case 'org':
        return { title: 'چارت و ساختار درختی شورا', icon: Network, desc: 'سلسله‌مراتب سازمانی، سمت‌ها و ماتریس دسترسی‌ها' };
      case 'workflow':
        return { title: 'گردش کار سازمانی', icon: GitBranch, desc: 'طراحی و پیگیری فرآیندهای ارجاع و تصویب' };
      case 'fields':
        return { title: 'تعریف فیلدهای پویای پروژه', icon: Sliders, desc: 'مدیریت و افزودن فیلدهای دلخواه بدون نیاز به تغییر کد' };
      case 'users':
        return { title: 'کاربران و انتصاب سمت‌ها', icon: Users, desc: 'مدیریت اعضا، رمز عبور و انتصاب در چارت شورا' };
      case 'chat':
        return { title: 'تالار گفتگوی شورا', icon: MessageSquare, desc: 'چت گروهی و پیام‌رسانی خصوصی (پی‌وی) بین اعضا' };
      case 'stats':
        return { title: 'داشبورد و آمار تحلیلی مصوبات', icon: BarChart3, desc: 'گزارش تجمیعی آرا، مشارکت و شاخص‌های شورا' };
      default:
        return { title: 'کارتابل شورا', icon: Layers, desc: '' };
    }
  };

  const currentInfo = getTabInfo();
  const Icon = currentInfo.icon;

  return (
    <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-xl border-b border-slate-800">
      <div className="px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 flex items-center justify-between">
        
        {/* Left / Center: Current Active View Title & Breadcrumb */}
        <div className="flex items-center gap-3">
          
          {/* Mobile hamburger button to open right sidebar */}
          <button
            onClick={onOpenMobileMenu}
            className="md:hidden p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
            title="باز کردن منوی ناوبری"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-cyan-600/15 text-cyan-400 border border-cyan-500/25 flex items-center justify-center">
              <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-extrabold text-white leading-tight">
                {currentInfo.title}
              </h1>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                {currentInfo.desc}
              </p>
            </div>
          </div>
        </div>

        {/* Right side: Quick Switch Profile Badge */}
        <div className="flex items-center gap-2 sm:gap-3">
          <PWAInstallButton />

          <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-950/70 border border-slate-800">
            <div className="w-7 h-7 rounded-xl bg-cyan-600/30 text-cyan-300 font-bold text-xs flex items-center justify-center">
              {currentUser.name.charAt(0)}
            </div>
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-white flex items-center gap-1">
                <span>{currentUser.name}</span>
                {currentUser.role === 'ADMIN' ? (
                  <span className="text-[8px] px-1 bg-amber-500/20 text-amber-300 rounded font-semibold">ادمین</span>
                ) : (
                  <span className="text-[8px] px-1 bg-cyan-500/20 text-cyan-300 rounded font-semibold">شورا</span>
                )}
              </div>
              <div className="text-[10px] text-cyan-400 font-medium">
                {currentUser.positionTitle || 'عضو شورا'}
              </div>
            </div>
          </div>
        </div>

      </div>
    </header>
  );
};
