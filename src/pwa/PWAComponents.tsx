import React, { useState } from 'react';
import { usePWAInstall } from './usePWAInstall';
import {
  Download,
  Smartphone,
  X,
  Monitor,
  CheckCircle2,
  ShieldAlert,
  Copy,
  Check,
  ShieldCheck,
  ExternalLink,
  Layers,
  Sparkles,
} from 'lucide-react';

export const PWAInstallButton: React.FC<{
  className?: string;
  label?: string;
  showIcon?: boolean;
}> = ({
  className,
  label = 'نصب نسخه برنامه (PWA)',
  showIcon = true,
}) => {
  const {
    isInstallable,
    isInstalled,
    isIOS,
    isInsecureIP,
    insecureAllowed,
    currentHost,
    currentOrigin,
    install,
    allowInsecureIP,
    resetInsecurePermission,
    downloadDesktopShortcut,
  } = usePWAInstall();

  const [showModal, setShowModal] = useState(false);
  const [modalTab, setModalTab] = useState<'PERMISSION' | 'ACTIVATED'>('PERMISSION');
  const [copiedFlag, setCopiedFlag] = useState(false);
  const [copiedOrigin, setCopiedOrigin] = useState(false);
  const [downloadedShortcut, setDownloadedShortcut] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    // If browser supports native install prompt right away
    if (isInstallable) {
      const res = await install();
      if (!res) {
        setModalTab('ACTIVATED');
        setShowModal(true);
      }
      return;
    }

    // If running on an insecure IP (HTTP non-localhost)
    if (isInsecureIP) {
      if (insecureAllowed) {
        setModalTab('ACTIVATED');
      } else {
        setModalTab('PERMISSION');
      }
      setShowModal(true);
      return;
    }

    // Default flow
    setModalTab('ACTIVATED');
    setShowModal(true);
  };

  const handleConfirmPermission = async () => {
    await allowInsecureIP();
    setModalTab('ACTIVATED');

    // Try native prompt if available
    if (isInstallable) {
      await install();
    }
  };

  const copyToClipboard = (text: string, type: 'flag' | 'origin') => {
    navigator.clipboard.writeText(text);
    if (type === 'flag') {
      setCopiedFlag(true);
      setTimeout(() => setCopiedFlag(false), 2500);
    } else {
      setCopiedOrigin(true);
      setTimeout(() => setCopiedOrigin(false), 2500);
    }
  };

  const handleDownloadShortcut = () => {
    downloadDesktopShortcut();
    setDownloadedShortcut(true);
    setTimeout(() => setDownloadedShortcut(false), 4000);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          className ||
          'flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition duration-150 cursor-pointer'
        }
        title="نصب اپلیکیشن روی کامپیوتر یا گوشی موبایل"
      >
        {showIcon && <Download className="w-3.5 h-3.5" />}
        <span>{label}</span>
      </button>

      {/* PWA Insecure IP & Installation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl bg-white border border-slate-200 p-6 shadow-2xl text-slate-800 space-y-5 max-h-[92vh] overflow-y-auto">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    نصب و راه‌اندازی اپلیکیشن سامانه (PWA)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    اجرای مستقل و پرسرعت شبیه به نرم‌افزار بدون کادر مرورگر
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* STEP 1: PERMISSION REQUEST (for Insecure IP without SSL) */}
            {modalTab === 'PERMISSION' && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/90 text-amber-950 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-xs text-amber-900">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>آدرس سامانه بر روی آی‌پی شبکه یا اینترنت بدون گواهینامه SSL است</span>
                  </div>
                  <p className="text-xs text-amber-800/90 leading-relaxed">
                    شما در حال استفاده از سامانه بر روی آدرس زیر می‌باشید:
                  </p>
                  <div className="px-3 py-1.5 rounded-xl bg-white/90 border border-amber-300 font-mono text-xs font-bold text-slate-800 text-left" dir="ltr">
                    {currentOrigin || `http://${currentHost}`}
                  </div>
                  <p className="text-[11px] text-amber-700 leading-relaxed pt-1">
                    مرورگرها (کروم، اج و اندروید) به دلایل امنیتی، نصب مستقیم برنامه‌های وب روی پروتکل بدون SSL (HTTP) را نیازمند تایید و اجازه مستقیم کاربر می‌دانند.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
                    <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>درخواست اجازه نصب و فعال‌سازی PWA:</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    آیا مایلید مجوز نصب وب‌اپلیکیشن، ایجاد میانبر اختصاصی دسکتاپ و اجرای مستقل برای این آدرس صادر و فعال گردد؟
                  </p>

                  <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={handleConfirmPermission}
                      className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-sm shadow-indigo-600/20"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>بله، تایید و فعال‌سازی نصب اپلیکیشن</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                    >
                      انصراف
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: ACTIVATED - INSTALLATION WAYS (Desktop Shortcut, Chrome Window, Flag) */}
            {modalTab === 'ACTIVATED' && (
              <div className="space-y-4">
                {/* Active confirmation badge if insecure IP */}
                {isInsecureIP && (
                  <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>مجوز نصب نسخه PWA برای این آی‌پی فعال شد!</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalTab('PERMISSION')}
                      className="text-[10px] text-emerald-700 hover:text-emerald-900 underline cursor-pointer"
                    >
                      تغییر مجوز
                    </button>
                  </div>
                )}

                {/* Option 1: Instant Desktop Shortcut (.url file) */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                      <Monitor className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span>روش ۱: دریافت فوری میانبر دسکتاپ (بدون هیچ تنظیمی)</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                      سریع‌ترین روش
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    با کلیک روی دکمه زیر، فایل میانبر دسکتاپ برای سیستم‌عامل ویندوز/مک را دریافت کنید. سپس آن را روی دسکتاپ خود قرار دهید تا همیشه با یک کلیک سامانه باز شود.
                  </p>
                  <button
                    type="button"
                    onClick={handleDownloadShortcut}
                    className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-indigo-50 border border-indigo-200 hover:border-indigo-300 text-indigo-700 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-2xs"
                  >
                    {downloadedShortcut ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span className="text-emerald-700">میانبر دسکتاپ دانلود شد! (آن را روی صفحه دسکتاپ بگذارید)</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        <span>دانلود آیکون سامانه روی دسکتاپ (Desktop Shortcut)</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Option 2: Chrome / Edge Standalone App Window */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                    <Layers className="w-4 h-4 text-slate-700 shrink-0" />
                    <span>روش ۲: ساخت پنجره اختصاصی در کروم و اج (بدون کادر مرورگر)</span>
                  </div>
                  <div className="text-[11px] text-slate-600 leading-relaxed space-y-1 bg-white p-3 rounded-xl border border-slate-200">
                    <p className="font-semibold text-slate-800">در مرورگر Google Chrome یا Microsoft Edge کامپیوتر:</p>
                    <ol className="list-decimal list-inside space-y-1 pr-1 text-slate-600">
                      <li>روی منوی ۳ نقطه در گوشه بالای مرورگر (⋮) کلیک کنید.</li>
                      <li>به بخش <strong>ذخیره و اشتراک‌گذاری (Save and share)</strong> بروید.</li>
                      <li>روی گزینه <strong>ایجاد میانبر (Create shortcut...)</strong> کلیک کنید.</li>
                      <li>
                        تیک گزینه <strong className="text-indigo-600">«باز شدن به عنوان پنجره (Open as window)»</strong> را بزنید و روی <strong>Create</strong> کلیک نمایید.
                      </li>
                    </ol>
                    <p className="text-[10px] text-emerald-700 pt-1 font-medium">
                      ✓ پس از آن، آیکون شورای پروژه روی تسک‌بار و دسکتاپ قرار گرفته و دقیقاً مثل یک نرم‌افزار نیتیو بدون نوار آدرس مرورگر اجرا می‌شود.
                    </p>
                  </div>
                </div>

                {/* Option 3: Android & iOS Mobile */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                    <Smartphone className="w-4 h-4 text-slate-700 shrink-0" />
                    <span>روش ۳: نصب در گوشی‌های موبایل (اندروید و آیفون)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-1">
                      <p className="font-bold text-slate-800">اندروید (Chrome):</p>
                      <p className="text-slate-500">
                        منوی ۳ نقطه بالای مرورگر را بزنید و گزینه <strong>«افزودن به صفحه اصلی (Add to Home screen)»</strong> را انتخاب کنید.
                      </p>
                    </div>

                    <div className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-1">
                      <p className="font-bold text-slate-800">آیفون (Safari):</p>
                      <p className="text-slate-500">
                        دکمه اشتراک‌گذاری <strong>(Share)</strong> در پایین سافاری را بزنید و گزینه <strong>«Add to Home Screen»</strong> را لمس کنید.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Option 4: Chrome Flags for 100% Native PWA install button on IP */}
                {isInsecureIP && (
                  <details className="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-100 group">
                    <summary className="text-xs font-bold text-indigo-900 flex items-center justify-between cursor-pointer">
                      <span>روش پیشرفته: فعال‌سازی دائمی دکمه نصب PWA در کروم با فلگ اختصاصی</span>
                      <span className="text-[10px] text-indigo-600 group-open:rotate-180 transition-transform">▼</span>
                    </summary>

                    <div className="pt-3 space-y-2.5 text-[11px] text-slate-600 leading-relaxed">
                      <p>
                        اگر می‌خواهید مرورگر کروم این آی‌پی را معادل HTTPS تشخیص دهد و آیکون دانلود PWA مستقیماً در نوار آدرس ظاهر شود:
                      </p>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-700">۱. آدرس فلگ زیر را در یک تب جدید کروم باز کنید:</label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            readOnly
                            value="chrome://flags/#unsafely-treat-insecure-origin-as-secure"
                            className="w-full text-[10px] font-mono px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700"
                            dir="ltr"
                          />
                          <button
                            type="button"
                            onClick={() => copyToClipboard('chrome://flags/#unsafely-treat-insecure-origin-as-secure', 'flag')}
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] shrink-0 cursor-pointer flex items-center gap-1"
                          >
                            {copiedFlag ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedFlag ? 'کپی شد' : 'کپی'}</span>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-700">۲. آدرس این سرور را در کادر متنی وارد کرده و وضعیت را روی Enabled بگذارید:</label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            readOnly
                            value={currentOrigin || `http://${currentHost}`}
                            className="w-full text-[10px] font-mono px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700"
                            dir="ltr"
                          />
                          <button
                            type="button"
                            onClick={() => copyToClipboard(currentOrigin || `http://${currentHost}`, 'origin')}
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] shrink-0 cursor-pointer flex items-center gap-1"
                          >
                            {copiedOrigin ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedOrigin ? 'کپی شد' : 'کپی'}</span>
                          </button>
                        </div>
                      </div>

                      <p className="text-[10px] text-indigo-700 font-semibold pt-1">
                        ۳. سپس روی دکمه <strong>Relaunch</strong> در پایین کروم بزنید؛ از این پس قابلیت نصب خودکار بدون هیچ هشداری کار خواهد کرد.
                      </p>
                    </div>
                  </details>
                )}

                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer"
                >
                  بستن پنجره
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2.5 rounded-xl bg-amber-600 border border-amber-700 px-4 py-2 text-xs font-semibold text-white shadow-lg">
      <span className="h-2.5 w-2.5 rounded-full bg-white animate-ping" />
      <span>حالت آفلاین — از حافظه محلی ذخیره شده استفاده می‌شود</span>
    </div>
  );
};
