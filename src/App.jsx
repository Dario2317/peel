import { useEffect, useState } from 'react';
import { db } from './db/db.js';
import { getSetting, setSetting } from './db/settings.js';
import { Library } from './library/Library.jsx';
import { NotebookScreen } from './viewer/NotebookScreen.jsx';
import { DialogHost } from './ui/dialogs.jsx';
import { ToastHost } from './ui/toast.jsx';
import { UpdatePrompt } from './ui/UpdatePrompt.jsx';

// Which screen to show is kept in the address after "#": #/nb/<id> for a
// notebook, #/f/<id> for a folder in the library. That way reloading the
// page keeps you where you were.
function readRoute() {
  const notebook = location.hash.match(/^#\/nb\/(.+)$/);
  const folder = location.hash.match(/^#\/f\/(.+)$/);
  return {
    notebookId: notebook ? decodeURIComponent(notebook[1]) : null,
    folderId: folder ? decodeURIComponent(folder[1]) : null,
  };
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
  const openFolder = (id) => {
    location.hash = id ? `#/f/${id}` : '#/';
  };
  // Back from a notebook goes to the folder it's in.
  const backToLibrary = async () => {
    setSetting('lastNotebook', null);
    const notebook = await db.notebooks.get(route.notebookId);
    openFolder(notebook?.folderId ?? null);
  };

  return (
    <>
      {route.notebookId ? (
        <NotebookScreen key={route.notebookId} notebookId={route.notebookId} onBack={backToLibrary} />
      ) : (
        <Library key={route.folderId ?? 'top'} folderId={route.folderId} onOpen={openNotebook} onOpenFolder={openFolder} />
      )}
      <DialogHost />
      <ToastHost />
      <UpdatePrompt />
    </>
  );
}
