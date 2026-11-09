import React from 'react';
import { User } from '../types';
import { PWAInstallButton } from '../pwa/PWAComponents';
import { 
  Building2, 
  Layers, 
  Sliders, 
  Users, 
  MessageSquare, 
  LogOut, 
  ChevronRight, 
  ChevronLeft,
  X,
  FolderTree,
  GitBranch,
  Settings,
  Radio
} from 'lucide-react';

interface SidebarProps {
  currentUser: User;
  activeTab: 'projects' | 'fields' | 'structures' | 'workflows' | 'users' | 'org' | 'chat' | 'stats' | 'settings' | 'smstest';
  setActiveTab: (tab: 'projects' | 'fields' | 'structures' | 'workflows' | 'users' | 'org' | 'chat' | 'stats' | 'settings' | 'smstest') => void;
  onLogout: () => void;
  pendingVotesCount?: number;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  branding?: {
    login_title?: string;
    login_subtitle?: string;
    login_logo_url?: string | null;
  } | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  activeTab,
  setActiveTab,
  onLogout,
  pendingVotesCount = 0,
  mobileOpen,
  setMobileOpen,
  collapsed,
  setCollapsed,
  branding,
}) => {
  const [logoLoadError, setLogoLoadError] = React.useState(false);

  React.useEffect(() => {
    setLogoLoadError(false);
  }, [branding?.login_logo_url]);
  // Check if current user has permission
  const hasAccess = (permissionCode?: string): boolean => {
    if (!permissionCode) return true;
    if (currentUser.role === 'ADMIN') return true;
    return Array.isArray(currentUser.permissions) && currentUser.permissions.includes(permissionCode);
  };

  // Structured menu items with permission gating
  // Note: 'stats' (داشبورد تحلیلی) and 'org' (چارت درختی) are hidden as requested by user
  const menuGroups = [
    {
      groupTitle: 'پروژه‌ها و کارتابل شورا',
      items: [
        {
          id: 'projects' as const,
          title: 'کارتابل و پروژه‌های شورا',
          shortTitle: 'کارتابل',
          icon: Layers,
          badge: pendingVotesCount > 0 ? `${pendingVotesCount} در انتظار` : null,
          badgeColor: 'bg-amber-500/20 text-amber-700 border-amber-300',
          permission: undefined,
        },
      ],
    },
    {
      groupTitle: 'ساختارها و کاربران سازمانی',
      items: [
        {
          id: 'structures' as const,
          title: 'مدیریت ساختار سازمانی',
          shortTitle: 'ساختارها',
          icon: FolderTree,
          badge: null,
          badgeColor: '',
          permission: 'projects.fields.manage',
        },
        {
          id: 'workflows' as const,
          title: 'طراحی گردش کار پروژه‌ها',
          shortTitle: 'گردش کار',
          icon: GitBranch,
          badge: null,
          badgeColor: '',
          permission: 'workflow.definitions.manage',
        },
        /* 'org' (چارت و ساختار درختی سمت‌ها) - فعلا به درخواست کاربر پنهان شده است
        {
          id: 'org' as const,
          title: 'چارت و سمت‌های سازمانی',
          shortTitle: 'چارت سمت‌ها',
          icon: Network,
          badge: null,
          badgeColor: '',
          permission: 'org.positions.view',
        },
        */
        {
          id: 'users' as const,
          title: 'کاربران و سطوح دسترسی',
          shortTitle: 'کاربران و دسترسی',
          icon: Users,
          badge: null,
          badgeColor: '',
          permission: 'system.users.view',
        },
      ],
    },
    {
      groupTitle: 'تنظیمات و نیازمندی‌ها',
      items: [
        {
          id: 'fields' as const,
          title: 'تعریف فیلدهای پویای پروژه',
          shortTitle: 'فیلدها',
          icon: Sliders,
          badge: null,
          badgeColor: '',
          permission: 'projects.fields.manage',
        },
        ...(currentUser.role === 'ADMIN' ? [{
          id: 'settings' as const,
          title: 'تنظیمات مهلت و قوانین شورا',
          shortTitle: 'تنظیمات مهلت',
          icon: Settings,
          badge: null,
          badgeColor: '',
          permission: 'system',
        }] : []),
      ],
    },
    {
      groupTitle: 'ارتباطات سازمانی',
      items: [
        {
          id: 'chat' as const,
          title: 'گفتگوی شورا (پیام‌رسان)',
          shortTitle: 'چت شورا',
          icon: MessageSquare,
          badge: null,
          badgeColor: '',
          permission: 'chat.group.send',
        },
        /* 'stats' (داشبورد و آمار تحلیلی) - فعلا به درخواست کاربر پنهان شده است
        {
          id: 'stats' as const,
          title: 'داشبورد و آمار تحلیلی',
          shortTitle: 'آمار',
          icon: BarChart3,
          badge: null,
          badgeColor: '',
          permission: undefined,
        },
        */
      ],
    },
  ];

  const handleSelectTab = (tab: typeof activeTab) => {
    setActiveTab(tab);
    setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden animate-in fade-in duration-200"
        />
      )}

      {/* Main Sidebar (RTL Right side) */}
      <aside
        className={`fixed right-0 top-0 bottom-0 z-50 flex flex-col bg-white border-l border-slate-200 shadow-xl transition-all duration-300 ${
          collapsed ? 'w-20' : 'w-72'
        } ${
          mobileOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
        }`}
      >
        
        {/* Sleek Floating Collapse/Expand Button on the Border (Never overlaps top icon!) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex absolute -left-3.5 top-5.5 w-7 h-7 rounded-full bg-white border border-slate-300 shadow-sm items-center justify-center text-slate-500 hover:text-indigo-600 hover:border-indigo-400 hover:scale-105 transition cursor-pointer z-50"
          title={collapsed ? 'گسترش منوی سایدبار' : 'کوچک کردن عرض سایدبار'}
        >
          {collapsed ? (
            <ChevronLeft className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        {/* Brand / Header */}
        <div className={`h-18 flex items-center border-b border-slate-100 bg-slate-50/80 shrink-0 ${
          collapsed ? 'justify-center px-2' : 'justify-between px-4'
        }`}>
          <div className={`flex items-center gap-3 overflow-hidden ${collapsed ? 'justify-center' : ''}`}>
            {branding?.login_logo_url && !logoLoadError ? (
              <div
                onClick={() => collapsed && setCollapsed(false)}
                className={`w-10 h-10 rounded-2xl bg-white border border-slate-200/90 shadow-md flex items-center justify-center p-1.5 shrink-0 overflow-hidden ${
                  collapsed ? 'cursor-pointer hover:scale-105 transition' : ''
                }`}
                title={collapsed ? `${branding.login_title || 'شورای تولید و ارزیابی'} (کلیک جهت باز شدن)` : (branding.login_title || 'لوگو')}
              >
                <img
                  src={branding.login_logo_url}
                  alt={branding.login_title || 'لوگو'}
                  className="max-w-full max-h-full object-contain"
                  onError={() => setLogoLoadError(true)}
                />
              </div>
            ) : (
              <div
                onClick={() => collapsed && setCollapsed(false)}
                className={`w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/25 shrink-0 ${
                  collapsed ? 'cursor-pointer hover:scale-105 transition' : ''
                }`}
                title={collapsed ? `${branding?.login_title || 'شورای تولید و ارزیابی'} (کلیک جهت باز شدن)` : (branding?.login_title || 'شورای تولید و ارزیابی')}
              >
                <Building2 className="w-5 h-5" />
              </div>
            )}

            {!collapsed && (
              <div className="overflow-hidden">
                <span className="font-extrabold text-sm text-slate-900 tracking-tight block truncate" title={branding?.login_title || 'شورای تولید و ارزیابی'}>
                  {branding?.login_title || 'شورای تولید و ارزیابی'}
                </span>
                <span className="text-[10px] text-indigo-600 font-semibold block truncate" title={branding?.login_subtitle || 'سامانه کارتابل و مصوبات'}>
                  {branding?.login_subtitle || 'سامانه کارتابل و مصوبات'}
                </span>
              </div>
            )}
          </div>

          {/* Mobile close button only */}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current User Status Bar (Clean enterprise view, no test switchers) */}
        <div className={`p-3 border-b border-slate-100 bg-slate-50/40 ${collapsed ? 'text-center' : ''}`}>
          {!collapsed ? (
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 font-extrabold text-xs flex items-center justify-center border border-indigo-200 shrink-0">
                {currentUser.name.charAt(0)}
              </div>
              <div className="overflow-hidden min-w-0">
                <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                  <span className="truncate">{currentUser.name}</span>
                  {currentUser.role === 'ADMIN' ? (
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 border border-amber-300 font-bold shrink-0">
                      مدیر
                    </span>
                  ) : (
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold shrink-0">
                      شورا
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 truncate mt-0.5 font-medium">
                  {currentUser.positionTitle || 'عضو کارتابل شورا'}
                </div>
              </div>
            </div>
          ) : (
            <div
              onClick={() => setCollapsed(false)}
              className="w-10 h-10 mx-auto rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs border border-indigo-200 cursor-pointer hover:bg-indigo-200 transition"
              title={`${currentUser.name} (${currentUser.positionTitle || 'کاربر'})`}
            >
              {currentUser.name.charAt(0)}
            </div>
          )}
        </div>

        {/* Navigation Menu List */}
        <div className="flex-1 overflow-y-auto py-3 px-2 sm:px-3 space-y-4">
          {menuGroups.map((group, groupIdx) => {
            const visibleItems = group.items.filter((item) => hasAccess(item.permission));
            if (visibleItems.length === 0) return null;

            return (
              <div key={groupIdx} className="space-y-1">
                {!collapsed && (
                  <div className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                    {group.groupTitle}
                  </div>
                )}

                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectTab(item.id)}
                      className={`w-full text-right flex items-center justify-between p-2.5 rounded-2xl transition duration-150 cursor-pointer group ${
                        isActive
                          ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-500/25'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 font-medium'
                      }`}
                      title={collapsed ? item.title : undefined}
                    >
                      <div className={`flex items-center gap-3 overflow-hidden ${collapsed ? 'mx-auto justify-center' : ''}`}>
                        <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-indigo-600 group-hover:text-indigo-700'}`} />
                        {!collapsed && (
                          <span className="text-xs truncate">
                            {item.title}
                          </span>
                        )}
                      </div>

                      {!collapsed && item.badge && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                          isActive ? 'bg-white/20 text-white border-white/30' : item.badgeColor
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Bottom Actions: PWA Install + Logout */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/60 space-y-2 shrink-0">
          {!collapsed && (
            <div className="flex justify-center">
              <PWAInstallButton />
            </div>
          )}

          <button
            onClick={onLogout}
            className={`w-full flex items-center justify-center gap-2 p-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
              collapsed
                ? 'text-rose-600 hover:bg-rose-50'
                : 'bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-600 hover:text-rose-700 shadow-xs'
            }`}
            title="خروج از حساب کاربری"
          >
            <LogOut className="w-4 h-4" />
            {!collapsed && <span>خروج از کارتابل</span>}
          </button>
        </div>

      </aside>
    </>
  );
};
