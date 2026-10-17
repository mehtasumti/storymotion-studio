import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import sitePlugin from './build/sitePlugin.js';
import siteConfig from './site.config.js';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const root = (p) => resolve(import.meta.dirname, p);

export default defineConfig({
  // Static multi-page site: real HTML for every public page, no SPA fallback needed.
  appType: 'mpa',
  plugins: [react(), sitePlugin({ config: siteConfig, version: pkg.version })],
  build: {
    // jsPDF is lazy-loaded into its own chunk; raise the warning threshold for it.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        home: root('index.html'),
        app: root('app/index.html'),
        privacy: root('privacy/index.html'),
        terms: root('terms/index.html'),
        notFound: root('404.html'),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'build/**/*.test.js'],
  },
});
