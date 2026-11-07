import React, { useState } from 'react';
import { usePWAInstall } from './usePWAInstall';
import { Download, Smartphone, X, Monitor, CheckCircle2 } from 'lucide-react';

export const PWAInstallButton: React.FC<{ className?: string; label?: string }> = ({ 
  className,
  label = 'نصب نسخه برنامه (PWA)'
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const res = await install();
      if (!res) {
        setShowGuide(true);
      }
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={className || "flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition duration-150 cursor-pointer"}
        title="نصب اپلیکیشن روی کامپیوتر یا گوشی موبایل"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{label}</span>
      </button>

      {/* Installation Guide Modal (for desktop Chrome/Edge or Android or iOS) */}
      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl bg-white border border-slate-200 p-6 shadow-2xl text-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Download className="w-5 h-5 text-indigo-600" />
                <span>راهنمای نصب اپلیکیشن سامانه (PWA)</span>
              </h3>
              <button
                onClick={() => setShowGuide(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Monitor className="w-4 h-4 text-indigo-600" />
                  <span>در کامپیوتر (Chrome / Edge / Brave):</span>
                </div>
                <p className="text-[11px] text-slate-600">
                  در نوار آدرس بالای مرورگر، روی آیکون <strong>نصب (Install / دکمه دانلود)</strong> کلیک کنید، یا از منوی سه‌نقطه گزینه <strong>«نصب برنامه...»</strong> را انتخاب فرمایید.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-emerald-600" />
                  <span>در گوشی‌های اندروید (Android):</span>
                </div>
                <p className="text-[11px] text-slate-600">
                  در مرورگر کروم روی منوی ۳ نقطه در بالا کلیک کرده و گزینه <strong>«نصب برنامه»</strong> یا <strong>«افزودن به صفحه اصلی (Add to Home screen)»</strong> را لمس نمایید.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-800 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-slate-600" />
                  <span>در گوشی‌های آیفون (iOS Safari):</span>
                </div>
                <p className="text-[11px] text-slate-600">
                  روی دکمه اشتراک‌گذاری <strong>(Share)</strong> در پایین سافاری بزنید و گزینه <strong>«Add to Home Screen»</strong> را انتخاب کنید.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowGuide(false)}
              className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 py-2.5 text-xs font-bold text-white transition cursor-pointer shadow-md shadow-indigo-500/20"
            >
              متوجه شدم
            </button>
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
