import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Purge any stale PWA cache that might hold old conflicting Vite chunks
if (typeof window !== 'undefined' && 'caches' in window) {
  caches.keys().then((keys) => {
    keys.forEach((key) => {
      if (key === 'council-flow-pwa-v1') {
        caches.delete(key);
      }
    });
  }).catch(() => {});
}

// Register service worker for PWA installability & offline capabilities
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        reg.update().catch(() => {});
      })
      .catch((err) => {
        console.warn('Service Worker registration skipped:', err);
      });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
