import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs';

// pdf.js needs some extra files at runtime (fonts that PDFs don't embed,
// character maps for Asian text, image decoders). We copy them into public/
// so they get published with the app and cached for offline use.
const PDFJS_DIR = 'node_modules/pdfjs-dist';
for (const folder of ['cmaps', 'standard_fonts', 'iccs']) {
  fs.cpSync(`${PDFJS_DIR}/${folder}`, `public/pdfjs/${folder}`, { recursive: true });
}
fs.mkdirSync('public/pdfjs/wasm', { recursive: true });
for (const file of fs.readdirSync(`${PDFJS_DIR}/wasm`)) {
  // quickjs is only for PDF forms with scripts; we don't need it.
  if (!file.startsWith('quickjs')) fs.copyFileSync(`${PDFJS_DIR}/wasm/${file}`, `public/pdfjs/wasm/${file}`);
}

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages serves the app at https://dario2317.github.io/peel/
  // (the dev server uses plain "/" so the Wi-Fi address stays short).
  base: command === 'build' || isPreview ? '/peel/' : '/',
  plugins: [
    react(),
    VitePWA({
      // 'prompt' = show a "new version, reload?" message instead of
      // reloading by itself while you are in the middle of something.
      registerType: 'prompt',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Peel',
        short_name: 'Peel',
        description: 'Study on top of the pages of your own books.',
        lang: 'en',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        scope: '.',
        theme_color: '#f4efe6',
        background_color: '#f4efe6',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Cache everything the app needs so it works with no connection.
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,woff2,bcmap,pfb,ttf,wasm,icc}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
  },
}));
