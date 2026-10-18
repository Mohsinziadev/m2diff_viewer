import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// By default the demo consumes the library from source for instant HMR. `npm run build:demo:dist`
// (M2DIFF_DEMO_DIST=1) builds it against the compiled package in ../dist instead, exactly as an app
// installing it from npm would.
const fromDist = process.env.M2DIFF_DEMO_DIST === '1';

export default defineConfig({
  root: r('.'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      { find: 'm2diff-viewer/styles.css', replacement: fromDist ? r('../dist/styles.css') : r('../src/styles/index.css') },
      { find: /^m2diff-viewer\/core$/, replacement: fromDist ? r('../dist/core/index.js') : r('../src/core/index.ts') },
      {
        find: /^m2diff-viewer\/highlight-js$/,
        replacement: fromDist ? r('../dist/highlight-js/index.js') : r('../src/highlight-js/index.ts'),
      },
      { find: /^m2diff-viewer$/, replacement: fromDist ? r('../dist/react/index.js') : r('../src/react/index.ts') },
    ],
  },
  server: { fs: { allow: [r('..')] } },
  build: { outDir: r('dist'), emptyOutDir: true },
});
