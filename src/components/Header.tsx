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
  ChevronDown,
  FolderTree
} from 'lucide-react';

interface HeaderProps {
  currentUser: User;
  activeTab: 'projects' | 'fields' | 'structures' | 'workflows' | 'users' | 'org' | 'chat' | 'stats';
  onOpenMobileMenu: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  activeTab,
  onOpenMobileMenu,
}) => {
  const getTabInfo = () => {
    switch (activeTab) {
      case 'projects':
        return { title: 'کارتابل و پروژه‌های شورا', icon: Layers, desc: 'ارزیابی مستقیم تمام طرح‌ها، رای‌گیری ۳ حالته اعضا و تجمیع آرا' };
      case 'structures':
        return { title: 'مدیریت ساختار سازمانی', icon: FolderTree, desc: 'تعریف ساختارها (مانند ماموریت، مرخصی، مالی)، چیدمان درختی سمت‌ها و انتصاب پرسنل' };
      case 'workflows':
        return { title: 'طراحی گردش کار پروژه‌ها', icon: GitBranch, desc: 'تعیین ارجاع مرحله‌ای طرح‌ها به سمت‌های مشخص از هر ساختار سازمانی' };
      case 'org':
        return { title: 'چارت و سمت‌های سازمانی', icon: Network, desc: 'کتابخانه سمت‌های سازمان، سطوح سلسله‌مراتب و ماتریس دسترسی‌ها' };
      case 'users':
        return { title: 'کاربران و پرسنل سیستم', icon: Users, desc: 'مدیریت حساب اعضا، نام کاربری، رمز عبور و نقش‌ها' };
      case 'fields':
        return { title: 'تعریف فیلدهای پویای پروژه', icon: Sliders, desc: 'مدیریت و افزودن فیلدهای دلخواه بدون نیاز به تغییر کد' };
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
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b border-slate-200/90 shadow-xs">
      <div className="px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 flex items-center justify-between">
        
        {/* Left / Center: Current Active View Title & Breadcrumb */}
        <div className="flex items-center gap-3">
          
          {/* Mobile hamburger button to open right sidebar */}
          <button
            onClick={onOpenMobileMenu}
            className="md:hidden p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
            title="باز کردن منوی ناوبری"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200/60 flex items-center justify-center">
              <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-extrabold text-slate-900 leading-tight">
                {currentInfo.title}
              </h1>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                {currentInfo.desc}
              </p>
            </div>
          </div>
        </div>

        {/* Right side: Quick Switch Profile Badge */}
        <div className="flex items-center gap-2 sm:gap-3">
          <PWAInstallButton />

          <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="w-7 h-7 rounded-xl bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">
              {currentUser.name.charAt(0)}
            </div>
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1">
                <span>{currentUser.name}</span>
                {currentUser.role === 'ADMIN' ? (
                  <span className="text-[8px] px-1 bg-amber-100 text-amber-800 rounded font-bold">ادمین</span>
                ) : (
                  <span className="text-[8px] px-1 bg-indigo-100 text-indigo-700 rounded font-semibold">شورا</span>
                )}
              </div>
              <div className="text-[10px] text-indigo-600 font-medium">
                {currentUser.positionTitle || 'عضو شورا'}
              </div>
            </div>
          </div>
        </div>

      </div>
    </header>
  );
};
