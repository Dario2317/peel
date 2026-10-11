import { useEffect, useState } from 'react';
import { setSetting, useSetting } from '../db/settings.js';
import { isIOS, isStandalone } from '../utils/platform.js';
import { ShareIcon } from '../ui/icons.jsx';

// A one-time tip to add Peel to the Home Screen. Installed web apps keep
// their data more reliably than a browser tab.
export function InstallHint() {
  const dismissed = useSetting('installHintDismissed', false, true); // hidden until loaded
  const [installEvent, setInstallEvent] = useState(null);

  // Chrome/Edge/Android offer their own install prompt; we show a button for it.
  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (dismissed || isStandalone()) return null;
  const dismiss = () => setSetting('installHintDismissed', true);

  if (isIOS()) {
    return (
      <div className="hint">
        <div>
          <strong>Add Peel to your Home Screen</strong>
          <p>
            Tap <ShareIcon size={16} className="inline-icon" /> Share, then <b>Add to Home Screen</b>.
            Do this <b>before</b> importing: the Home Screen app has its own storage, separate from
            Safari, and iPadOS keeps it more reliably.
          </p>
        </div>
        <button className="button small" onClick={dismiss}>Got it</button>
      </div>
    );
  }
  if (installEvent) {
    return (
      <div className="hint">
        <div>
          <strong>Install Peel as an app</strong>
          <p>It works offline and the browser keeps its data more reliably.</p>
        </div>
        <div className="hint-buttons">
          <button className="button small" onClick={dismiss}>Not now</button>
          <button
            className="button small primary"
            onClick={async () => {
              installEvent.prompt();
              await installEvent.userChoice;
              setInstallEvent(null);
            }}
          >
            Install
          </button>
        </div>
      </div>
    );
  }
  return null;
}
