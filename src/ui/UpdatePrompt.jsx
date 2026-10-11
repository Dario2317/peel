import { useEffect } from 'react';
// vite-plugin-pwa creates this module: it registers the service worker, the
// background script that keeps a copy of the app so it works offline.
import { useRegisterSW } from 'virtual:pwa-register/react';
import { showToast } from './toast.jsx';

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(url, registration) {
      // Look for a new version every hour while the app is open.
      if (registration) setInterval(() => registration.update(), 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    if (needRefresh) {
      showToast('A new version of Peel is ready.', {
        actionLabel: 'Reload',
        onAction: () => updateServiceWorker(true),
        duration: 0,
      });
    }
  }, [needRefresh]);

  useEffect(() => {
    if (offlineReady) {
      showToast('Peel is ready to work offline.');
      setOfflineReady(false);
    }
  }, [offlineReady]);

  return null;
}
