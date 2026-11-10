import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
  });
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => globalDeferredPrompt);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  // Insecure Origin (IP address without SSL/HTTPS) detection
  const isSecure = typeof window !== 'undefined' && (
    window.isSecureContext ||
    window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  );
  const isInsecureIP = !isSecure;

  const [insecureAllowed, setInsecureAllowed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('pwa_insecure_ip_allowed') === 'true';
  });

  useEffect(() => {
    if (globalDeferredPrompt && !deferredPrompt) {
      setDeferredPrompt(globalDeferredPrompt);
    }
    // Detect standalone mode (already running as installed PWA)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    // Detect iOS devices
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      globalDeferredPrompt = e as BeforeInstallPromptEvent;
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      globalDeferredPrompt = null;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [deferredPrompt]);

  const install = async () => {
    const promptEvent = deferredPrompt || globalDeferredPrompt;
    if (!promptEvent) return false;
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
        globalDeferredPrompt = null;
        return true;
      }
    } catch (e) {
      console.warn('PWA install prompt error:', e);
    }
    return false;
  };

  const allowInsecureIP = async () => {
    try {
      localStorage.setItem('pwa_insecure_ip_allowed', 'true');
      setInsecureAllowed(true);

      // Attempt service worker registration gracefully
      if ('serviceWorker' in navigator) {
        try {
          await navigator.serviceWorker.register('/sw.js');
        } catch (e) {
          // Expected on insecure IP without chrome flag
        }
      }
    } catch (e) {}
    return true;
  };

  const resetInsecurePermission = () => {
    try {
      localStorage.removeItem('pwa_insecure_ip_allowed');
      setInsecureAllowed(false);
    } catch (e) {}
  };

  const downloadDesktopShortcut = () => {
    if (typeof window === 'undefined') return;
    const currentUrl = window.location.origin;
    const content = `[InternetShortcut]\r\nURL=${currentUrl}\r\nIconIndex=0\r\n`;
    const blob = new Blob([content], { type: 'application/x-mswinurl;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'سامانه شورای پروژه.url';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const currentHost = typeof window !== 'undefined' ? window.location.host : '';

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    isInsecureIP,
    insecureAllowed,
    currentOrigin,
    currentHost,
    install,
    allowInsecureIP,
    resetInsecurePermission,
    downloadDesktopShortcut,
  };
}
