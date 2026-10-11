import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { cleanUpOrphans } from './db/cleanup.js';
import { markPlatform } from './utils/platform.js';
import './styles/base.css';

markPlatform();

// Safari's own pinch-zoom would zoom the whole app (toolbar included).
// We have our own zoom for the pages, so switch Safari's off.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

// Remove leftovers of deleted pages from the database.
cleanUpOrphans().catch((error) => console.warn('Cleanup failed', error));

createRoot(document.getElementById('root')).render(<App />);

// Only in development (npm run dev): handy hooks for testing in the console.
if (import.meta.env.DEV) {
  Promise.all([import('./db/db.js'), import('./import/importFiles.js')]).then(([dbModule, importModule]) => {
    window.__peel = { db: dbModule.db, importFiles: importModule.importFiles };
  });
}
