import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register service worker immediately for full PWA installability & offline caching
registerSW({
  immediate: true,
  onNeedRefresh() {
    // Automatically activates on updates
  },
  onOfflineReady() {
    console.log('App ready to work offline');
  },
});

createRoot(document.getElementById('root')!).render(<App />);
