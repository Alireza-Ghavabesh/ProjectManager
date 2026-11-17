import React, { useState, useRef, useEffect } from 'react';
import { User, UserNotification } from '../types';
import { ChangePasswordModal } from './ChangePasswordModal';
import {
  Menu,
  Layers,
  Sliders,
  Users,
  MessageSquare,
  BarChart3,
  Network,
  GitBranch,
  FolderTree,
  Settings,
  Key,
  Bell,
  BellRing,
  FolderKanban,
  CheckCheck,
  X,
  ExternalLink,
  Info,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react';

interface HeaderProps {
  currentUser: User;
  activeTab: 'projects' | 'project_list' | 'fields' | 'structures' | 'workflows' | 'users' | 'org' | 'chat' | 'stats' | 'settings' | 'smstest';
  onOpenMobileMenu: () => void;
  notifications?: UserNotification[];
  pushPermission?: NotificationPermission | 'unsupported';
  onRequestPushPermission?: () => void;
  onMarkNotificationRead?: (id: string) => void;
  onMarkAllNotificationsRead?: () => void;
  onDismissNotification?: (id: string) => void;
  onOpenNotificationProject?: (notif: UserNotification) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  activeTab,
  onOpenMobileMenu,
  notifications = [],
  pushPermission = 'unsupported',
  onRequestPushPermission,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onDismissNotification,
  onOpenNotificationProject,
}) => {
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const notifContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showNotifMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (notifContainerRef.current && !notifContainerRef.current.contains(e.target as Node)) {
        setShowNotifMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotifMenu]);

  const pushNotifications = notifications.filter((n) => n.channel === 'PUSH' && !n.isDismissed);
  const unreadCount = pushNotifications.filter((n) => !n.isRead).length;

  const getTabInfo = () => {
    switch (activeTab) {
      case 'projects':
        return { title: 'کارتابل پروژه‌های من', icon: Layers, desc: 'فقط پروژه‌هایی که در گردش کار یا رای‌گیری به شما ارجاع شده و نیازمند اقدام شما هستند' };
      case 'project_list':
        return { title: 'فهرست جامع پروژه‌ها', icon: FolderKanban, desc: 'مشاهده کل پروژه‌های ثبت‌شده در سامانه، جستجو، فیلتر وضعیت و مدیریت پرونده‌ها' };
      case 'structures':
        return { title: 'مدیریت ساختار سازمانی', icon: FolderTree, desc: 'تعریف ساختارها (مانند ماموریت، مرخصی، مالی)، چیدمان درختی سمت‌ها و انتصاب پرسنل' };
      case 'workflows':
        return { title: 'طراحی گردش کار پروژه‌ها', icon: GitBranch, desc: 'تعیین ارجاع مرحله‌ای طرح‌ها به سمت‌های مشخص از هر ساختار سازمانی' };
      case 'org':
        return { title: 'چارت و سمت‌های سازمانی', icon: Network, desc: 'کتابخانه سمت‌های سازمان، سطوح سلسله‌مراتب و ماتریس دسترسی‌ها' };
      case 'users':
        return { title: 'کاربران و سطوح دسترسی', icon: Users, desc: 'مدیریت حساب اعضا، نام کاربری، انتصاب سمت و ماتریس دسترسی‌ها' };
      case 'fields':
        return { title: 'تعریف فیلدهای پویای پروژه', icon: Sliders, desc: 'مدیریت و افزودن فیلدهای دلخواه بدون نیاز به تغییر کد' };
      case 'chat':
        return { title: 'تالار گفتگوی شورا', icon: MessageSquare, desc: 'چت گروهی و پیام‌رسانی خصوصی (پی‌وی) بین اعضا' };
      case 'settings':
        return { title: 'تنظیمات سامانه و مهلت ارزیابی', icon: Settings, desc: 'سیاست‌های مهلت بررسی، قفل خودکار رای‌گیری و ضوابط تمدید توسط ثبت‌کننده طرح' };
      case 'smstest':
        return { title: 'آزمایشگاه تست ارسال پیامک', icon: Settings, desc: 'ابزار زنده تست مستقیم وب‌سرویس‌های پیامک و خطایابی بدون واسطه' };
      case 'stats':
        return { title: 'داشبورد و آمار تحلیلی مصوبات', icon: BarChart3, desc: 'گزارش تجمیعی آرا، مشارکت و شاخص‌های شورا' };
      default:
        return { title: 'کارتابل شورا', icon: Layers, desc: '' };
    }
  };

  const getSeverityBadge = (severity?: UserNotification['severity']) => {
    switch (severity) {
      case 'success':
        return { icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' };
      case 'warning':
        return { icon: AlertTriangle, cls: 'bg-amber-50 text-amber-600 border-amber-200' };
      case 'danger':
        return { icon: AlertCircle, cls: 'bg-rose-50 text-rose-600 border-rose-200' };
      default:
        return { icon: Info, cls: 'bg-sky-50 text-sky-600 border-sky-200' };
    }
  };

  const currentInfo = getTabInfo();
  const Icon = currentInfo.icon;

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b border-slate-200/90 shadow-xs">
        <div className="px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 flex items-center justify-between gap-2">
          
          {/* Left / Center: Current Active View Title & Breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile hamburger button to open right sidebar */}
            <button
              onClick={onOpenMobileMenu}
              className="md:hidden p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer shrink-0"
              title="باز کردن منوی ناوبری"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200/60 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-extrabold text-slate-900 leading-tight truncate">
                  {currentInfo.title}
                </h1>
                <p className="text-[11px] text-slate-500 hidden sm:block truncate">
                  {currentInfo.desc}
                </p>
              </div>
            </div>
          </div>

          {/* Right side: Notification Bell + Change Password + Quick Profile */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Notification Bell & Dropdown */}
            <div className="relative" ref={notifContainerRef}>
              <button
                type="button"
                onClick={() => setShowNotifMenu((prev) => !prev)}
                className={`relative p-2 rounded-xl border transition flex items-center justify-center cursor-pointer shadow-2xs ${
                  showNotifMenu || unreadCount > 0
                    ? 'border-sky-300 bg-sky-50/70 text-sky-700 hover:bg-sky-100'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                }`}
                title="اعلان‌ها و پوش نوتیفیکیشن"
              >
                {unreadCount > 0 ? (
                  <BellRing className="w-4 h-4 text-sky-600 animate-pulse" />
                ) : (
                  <Bell className="w-4 h-4" />
                )}
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-extrabold flex items-center justify-center tabular-nums shadow-xs ring-2 ring-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {showNotifMenu && (
                <div className="absolute left-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white border border-slate-200 shadow-xl z-50 overflow-hidden">
                  {/* Dropdown Header */}
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-sky-600" />
                      <span className="text-xs font-extrabold text-slate-900">اعلان‌ها و پوش نوتیفیکیشن</span>
                      {unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700 text-[10px] font-bold tabular-nums">
                          {unreadCount} خوانده‌نشده
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && onMarkAllNotificationsRead && (
                      <button
                        type="button"
                        onClick={onMarkAllNotificationsRead}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>خواندن همه</span>
                      </button>
                    )}
                  </div>

                  {/* Browser Push Permission Prompt */}
                  {pushPermission === 'default' && onRequestPushPermission && (
                    <div className="px-4 py-2.5 bg-sky-50 border-b border-sky-100 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-sky-800 font-medium">
                        اعلان مرورگر غیرفعال است. برای دریافت پوش زنده فعال کنید:
                      </span>
                      <button
                        type="button"
                        onClick={onRequestPushPermission}
                        className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-bold shrink-0 transition cursor-pointer"
                      >
                        فعال‌سازی
                      </button>
                    </div>
                  )}
                  {pushPermission === 'denied' && (
                    <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-[10px] text-amber-800">
                      دسترسی اعلان مرورگر مسدود است؛ می‌توانید از تنظیمات سایت در مرورگر آن را مجاز کنید.
                    </div>
                  )}

                  {/* Notifications List */}
                  <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                    {pushNotifications.length === 0 ? (
                      <div className="py-10 px-4 text-center text-slate-400">
                        <Bell className="w-7 h-7 mx-auto mb-2 text-slate-300" />
                        <p className="text-xs font-semibold text-slate-500">هیچ اعلان جدیدی وجود ندارد</p>
                      </div>
                    ) : (
                      pushNotifications.map((notif) => {
                        const sev = getSeverityBadge(notif.severity);
                        const SevIcon = sev.icon;
                        return (
                          <div
                            key={notif.id}
                            onClick={() => {
                              if (!notif.isRead && onMarkNotificationRead) {
                                onMarkNotificationRead(notif.id);
                              }
                              if (notif.projectId && onOpenNotificationProject) {
                                onOpenNotificationProject(notif);
                                setShowNotifMenu(false);
                              }
                            }}
                            className={`p-3.5 transition flex items-start gap-2.5 ${
                              notif.projectId ? 'cursor-pointer' : ''
                            } ${
                              notif.isRead
                                ? 'bg-white hover:bg-slate-50/80'
                                : 'bg-sky-50/40 hover:bg-sky-50/80'
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${sev.cls}`}>
                              <SevIcon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className={`text-xs leading-snug ${notif.isRead ? 'font-bold text-slate-800' : 'font-extrabold text-slate-900'}`}>
                                  {notif.title}
                                </p>
                                <div className="flex items-center gap-1 shrink-0">
                                  {!notif.isRead && (
                                    <span className="w-2 h-2 rounded-full bg-sky-500" title="خوانده‌نشده" />
                                  )}
                                  {onDismissNotification && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onDismissNotification(notif.id);
                                      }}
                                      className="p-0.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                      title="حذف اعلان"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <p className="text-[11px] text-slate-600 mt-1 leading-relaxed whitespace-pre-line">
                                {notif.message}
                              </p>
                              <div className="flex items-center justify-between gap-2 mt-2 text-[10px] text-slate-400">
                                <span className="truncate">
                                  {notif.projectTitle ? `پرونده: ${notif.projectTitle}` : ''}
                                  {notif.workflowTrackingCode || notif.projectCode
                                    ? ` (${notif.workflowTrackingCode || notif.projectCode})`
                                    : ''}
                                </span>
                                <div className="flex items-center gap-2 shrink-0">
                                  {notif.projectId && (
                                    <span className="text-indigo-600 font-bold flex items-center gap-0.5">
                                      <span>مشاهده</span>
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </span>
                                  )}
                                  <span className="tabular-nums">
                                    {new Date(notif.createdAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Change Password Button for current user */}
            <button
              type="button"
              onClick={() => setShowPasswordModal(true)}
              className="p-2 sm:px-2.5 sm:py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-indigo-50 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 transition flex items-center gap-1 cursor-pointer text-xs font-semibold shadow-2xs"
              title="تغییر رمز عبور حساب کاربری من"
            >
              <Key className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden lg:inline">تغییر رمز</span>
            </button>

            {/* User Profile Badge */}
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

      {/* Change Password Modal */}
      {showPasswordModal && (
        <ChangePasswordModal
          currentUser={currentUser}
          onClose={() => setShowPasswordModal(false)}
        />
      )}
    </>
  );
};
