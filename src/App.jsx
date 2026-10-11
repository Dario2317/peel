import { useEffect, useState } from 'react';
import { db } from './db/db.js';
import { getSetting, setSetting } from './db/settings.js';
import { Library } from './library/Library.jsx';
import { NotebookScreen } from './viewer/NotebookScreen.jsx';
import { DialogHost } from './ui/dialogs.jsx';
import { ToastHost } from './ui/toast.jsx';
import { UpdatePrompt } from './ui/UpdatePrompt.jsx';

// Which screen to show is kept in the address after "#", e.g. #/nb/nb_123.
// That way reloading the page keeps you where you were.
function readRoute() {
  const match = location.hash.match(/^#\/nb\/(.+)$/);
  return { notebookId: match ? decodeURIComponent(match[1]) : null };
}

export function App() {
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    const onChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', onChange);

    // Opened from the Home Screen with no address: reopen your last notebook.
    if (!location.hash) {
      getSetting('lastNotebook', null).then(async (id) => {
        if (id && (await db.notebooks.get(id))) location.hash = `#/nb/${id}`;
      });
    }
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const openNotebook = (id) => {
    location.hash = `#/nb/${id}`;
  };
  const backToLibrary = () => {
    setSetting('lastNotebook', null);
    location.hash = '#/';
  };

  return (
    <>
      {route.notebookId ? (
        <NotebookScreen key={route.notebookId} notebookId={route.notebookId} onBack={backToLibrary} />
      ) : (
        <Library onOpen={openNotebook} />
      )}
      <DialogHost />
      <ToastHost />
      <UpdatePrompt />
    </>
  );
}
