import React, { useState } from 'react';
import { User } from '../types';
import { PWAInstallButton } from '../pwa/PWAComponents';
import { 
  Building2, 
  Layers, 
  Sliders, 
  Users, 
  MessageSquare, 
  BarChart3, 
  LogOut, 
  ChevronDown, 
  Sparkles, 
  Network, 
  GitBranch, 
  ChevronRight, 
  ChevronLeft,
  X,
  Shield,
  Briefcase
} from 'lucide-react';

interface SidebarProps {
  currentUser: User;
  activeTab: 'projects' | 'fields' | 'users' | 'org' | 'workflow' | 'chat' | 'stats';
  setActiveTab: (tab: 'projects' | 'fields' | 'users' | 'org' | 'workflow' | 'chat' | 'stats') => void;
  onLogout: () => void;
  onSwitchUser: (username: string) => void;
  allUsers: User[];
  pendingVotesCount?: number;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  activeTab,
  setActiveTab,
  onLogout,
  onSwitchUser,
  allUsers,
  pendingVotesCount = 0,
  mobileOpen,
  setMobileOpen,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [showSwitchMenu, setShowSwitchMenu] = useState(false);

  // Check if current user has permission
  const hasAccess = (permissionCode?: string): boolean => {
    if (!permissionCode) return true;
    if (currentUser.role === 'ADMIN') return true;
    return Array.isArray(currentUser.permissions) && currentUser.permissions.includes(permissionCode);
  };

  // Structured menu items with permission gating
  const menuGroups = [
    {
      groupTitle: 'مصوبات و فرآیندها',
      items: [
        {
          id: 'projects' as const,
          title: 'کارتابل مصوبات و پروژه‌ها',
          shortTitle: 'کارتابل',
          icon: Layers,
          badge: pendingVotesCount > 0 ? `${pendingVotesCount} در انتظار` : null,
          badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          permission: undefined, // Available to all council members
        },
        {
          id: 'workflow' as const,
          title: 'گردش کار سازمانی',
          shortTitle: 'گردش کار',
          icon: GitBranch,
          badge: 'فرآیندها',
          badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
          permission: 'workflow.forward',
        },
      ],
    },
    {
      groupTitle: 'ساختار و پرسنل شورا',
      items: [
        {
          id: 'org' as const,
          title: 'چارت و ساختار درختی شورا',
          shortTitle: 'چارت درختی',
          icon: Network,
          badge: 'درختی',
          badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
          permission: 'org.positions.view',
        },
        {
          id: 'users' as const,
          title: 'کاربران و انتصاب سمت‌ها',
          shortTitle: 'کاربران',
          icon: Users,
          badge: null,
          badgeColor: '',
          permission: 'system.users.view',
        },
      ],
    },
    {
      groupTitle: 'تنظیمات و فیلدهای پویا',
      items: [
        {
          id: 'fields' as const,
          title: 'تعریف فیلدهای پویای پروژه',
          shortTitle: 'فیلدها',
          icon: Sliders,
          badge: 'داینامیک',
          badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
          permission: 'projects.fields.manage', // STRICTLY HIDDEN IF NOT AUTHORIZED!
        },
      ],
    },
    {
      groupTitle: 'ارتباطات و گزارشات',
      items: [
        {
          id: 'chat' as const,
          title: 'گفتگوی شورا (گروهی و پی‌وی)',
          shortTitle: 'چت شورا',
          icon: MessageSquare,
          badge: null,
          badgeColor: '',
          permission: 'chat.group.send',
        },
        {
          id: 'stats' as const,
          title: 'داشبورد و آمار تحلیلی',
          shortTitle: 'آمار',
          icon: BarChart3,
          badge: null,
          badgeColor: '',
          permission: undefined,
        },
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
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden animate-in fade-in duration-200"
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
        
        {/* Brand / Header */}
        <div className="h-18 flex items-center justify-between px-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/25 shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            {!collapsed && (
              <div className="overflow-hidden">
                <span className="font-extrabold text-sm text-slate-900 tracking-tight block truncate">
                  شورای تولید و ارزیابی
                </span>
                <span className="text-[10px] text-indigo-600 font-semibold block truncate">
                  سامانه کارتابل و مصوبات
                </span>
              </div>
            )}
          </div>

          {/* Desktop collapse toggle / Mobile close */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="hidden md:flex p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              title={collapsed ? 'گسترش منو' : 'جمع‌کردن منو'}
            >
              {collapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setMobileOpen(false)}
              className="md:hidden p-1.5 rounded-xl text-slate-400 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* User Status Bar */}
        <div className={`p-3 border-b border-slate-100 bg-slate-50/40 ${collapsed ? 'text-center' : ''}`}>
          {!collapsed ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 font-extrabold text-xs flex items-center justify-center border border-indigo-200 shrink-0">
                  {currentUser.name.charAt(0)}
                </div>
                <div className="overflow-hidden">
                  <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                    <span>{currentUser.name}</span>
                    {currentUser.role === 'ADMIN' ? (
                      <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 border border-amber-300 font-bold">
                        مدیر
                      </span>
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold">
                        شورا
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate mt-0.5 font-medium">
                    {currentUser.positionTitle || 'بدون سمت اختصاصی'}
                  </div>
                </div>
              </div>

              {/* Fast switch toggle button */}
              <button
                onClick={() => setShowSwitchMenu(!showSwitchMenu)}
                className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition cursor-pointer"
                title="تغییر سریع کاربر برای تست دسترسی‌ها"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              </button>
            </div>
          ) : (
            <div
              onClick={() => setCollapsed(false)}
              className="w-10 h-10 mx-auto rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs border border-indigo-200 cursor-pointer"
              title={`${currentUser.name} (${currentUser.positionTitle || 'کاربر'})`}
            >
              {currentUser.name.charAt(0)}
            </div>
          )}

          {/* Quick User Switcher Dropdown */}
          {showSwitchMenu && !collapsed && (
            <div className="mt-2 p-2 rounded-2xl bg-white border border-slate-200 shadow-2xl z-50 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="text-[10px] font-bold text-slate-500 px-2 py-1 border-b border-slate-100 mb-1 flex items-center justify-between">
                <span>تغییر حساب جهت تست دسترسی‌ها</span>
                <X
                  className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  onClick={() => setShowSwitchMenu(false)}
                />
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {allUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      onSwitchUser(u.username);
                      setShowSwitchMenu(false);
                    }}
                    className={`w-full text-right p-1.5 rounded-xl text-xs transition flex items-center justify-between cursor-pointer ${
                      u.id === currentUser.id
                        ? 'bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-slate-800 flex items-center gap-1">
                        <span>{u.name}</span>
                        {u.role === 'ADMIN' && (
                          <span className="text-[8px] px-1 bg-amber-100 text-amber-800 rounded font-bold">ادمین</span>
                        )}
                      </div>
                      <div className="text-[9px] text-slate-400">{u.positionTitle || 'بدون سمت'}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Navigation Menu List */}
        <div className="flex-1 overflow-y-auto py-3 px-2 sm:px-3 space-y-4">
          {menuGroups.map((group, groupIdx) => {
            // Filter group items according to user's permissions!
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
                      <div className="flex items-center gap-3 overflow-hidden">
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
