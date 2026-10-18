// End-to-end check of the *published* artefact: packs the package, installs the tarball into a fresh
// project, type-checks every file in examples/ against it, server-renders the components through both
// the ESM and CommonJS entry points, runs the engine and the highlight.js adapter in plain Node, and
// verifies the core entry never loads React.
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const work = resolve(root, '.smoke');
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });

await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });

const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', work], root))[0];
console.log(`• packed ${packed.filename} (${(packed.size / 1024).toFixed(1)} kB, ${packed.files.length} files)`);
const paths = packed.files.map((f) => f.path);
const leaked = paths.filter((p) => !/^(dist\/|README\.md|CHANGELOG\.md|LICENSE|package\.json)/.test(p));
if (leaked.length) throw new Error(`Unexpected files in tarball: ${leaked.join(', ')}`);
for (const entry of ['react', 'core', 'highlight-js', 'shiki']) {
  for (const ext of ['js', 'cjs', 'd.ts', 'd.cts']) {
    if (!paths.includes(`dist/${entry}/index.${ext}`)) throw new Error(`Missing from tarball: dist/${entry}/index.${ext}`);
  }
}
for (const required of ['dist/styles.css', 'README.md', 'CHANGELOG.md', 'LICENSE']) {
  if (!paths.includes(required)) throw new Error(`Missing from tarball: ${required}`);
}
console.log('• tarball contains dist (ESM, CJS, types, source maps, CSS), README, CHANGELOG and LICENSE only');

const app = resolve(work, 'app');
await mkdir(resolve(app, 'src'), { recursive: true });
await writeFile(resolve(app, 'package.json'), JSON.stringify({ name: 'smoke-app', private: true, type: 'module' }, null, 2));
run(
  'npm',
  [
    'install',
    '--no-audit',
    '--no-fund',
    '--loglevel=error',
    resolve(work, packed.filename),
    'react@19',
    'react-dom@19',
    '@types/react@19',
    '@types/react-dom@19',
    'highlight.js@11',
    'shiki@4',
    'typescript@5',
  ],
  app,
);
console.log('• installed tarball into a fresh project');

await cp(resolve(root, 'examples'), resolve(app, 'src'), { recursive: true });
// Apps declare CSS modules through their bundler's types (vite/client, next-env.d.ts...).
await writeFile(resolve(app, 'src/env.d.ts'), "declare module '*.css';\n");
await writeFile(
  resolve(app, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      strict: true,
      skipLibCheck: false,
      outDir: 'out',
      rootDir: 'src',
      // esnext.disposable is required by Shiki's own declarations (used by examples/shiki.tsx).
      lib: ['ES2022', 'ESNext.Disposable', 'DOM', 'DOM.Iterable'],
      types: [],
    },
    include: ['src'],
  }),
);
run('npx', ['tsc', '-p', 'tsconfig.json'], app);
// Also check strict Node16 resolution of the subpath exports.
await writeFile(
  resolve(app, 'tsconfig.node16.json'),
  JSON.stringify({
    extends: './tsconfig.json',
    compilerOptions: { module: 'Node16', moduleResolution: 'Node16', noEmit: true },
    include: ['src/headless.ts'],
  }),
);
run('npx', ['tsc', '-p', 'tsconfig.node16.json'], app);
console.log('• examples type-check against the published types (bundler + Node16 resolution, skipLibCheck: false)');

// Node cannot import CSS, so strip the stylesheet imports from the compiled examples.
const outFiles = (await readdir(resolve(app, 'out'), { recursive: true })).filter((f) => f.endsWith('.js'));
for (const f of outFiles) {
  const p = resolve(app, 'out', f);
  await writeFile(p, (await readFile(p, 'utf8')).replace(/^import ['"]m2diff-viewer\/styles\.css['"];?$/m, ''));
}

const ssr = `
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const checks = [
  ['./out/quickstart.js', 'default', {}, 'm2d-pane-old'],
  ['./out/highlighting.js', 'HighlightedDiff', { before: 'let a = 1;\\n', after: 'let a = 2;\\n', fileName: 'a.rs' }, 'm2d-modified'],
  ['./out/structured-data.js', 'ApiResponseDiff', {}, 'data-path="$.status"'],
  ['./out/structured-data.js', 'PriceListDiff', {}, 'm2d-cell-changed'],
  ['./out/custom-toolbar.js', 'ReviewPanel', { before: 'a\\n', after: 'b\\n' }, 'm2d-pane-inline'],
  ['./out/nextjs-client.js', 'default', { path: 'x.ts', before: 'a\\n', after: 'b\\n' }, 'x.ts'],
  ['./out/shiki.js', 'ShikiDiff', { before: 'a\\n', after: 'b\\n' }, 'm2d-root'],
];
for (const [file, name, props, marker] of checks) {
  const mod = await import(file);
  const html = renderToString(createElement(mod[name], props));
  if (!html.includes(marker)) throw new Error(file + ' did not render ' + marker);
}
console.log('• ESM: ' + checks.length + ' examples server-render');

const headless = await import('./out/headless.js');
if (headless.result.changes.length !== 2 || !headless.patch.includes('@@ -1,3 +1,4 @@')) throw new Error('headless diff failed');
if (headless.changedPaths.join() !== 'changed $.retries') throw new Error('headless JSON diff failed: ' + headless.changedPaths);
if (headless.csv.stats.modified !== 1) throw new Error('headless CSV diff failed');
console.log('• ESM: engine works in plain Node (text, JSON, CSV, patch)');

const cjs = require('m2diff-viewer');
const html = renderToString(createElement(cjs.DiffViewer, { original: 'x\\n', modified: 'y\\n', originalName: 'cjs-works.txt' }));
if (!html.includes('cjs-works.txt')) throw new Error('CJS render failed');
const core = require('m2diff-viewer/core');
if (core.computeDiff('a', 'b').stats.changes !== 1) throw new Error('CJS core failed');
console.log('• CJS: require("m2diff-viewer") renders and require("m2diff-viewer/core") compares');

const { createHighlightJsAdapter } = await import('m2diff-viewer/highlight-js');
const hl = createHighlightJsAdapter();
await hl.load(hl.resolve('rust'));
if (!hl.tokenize('fn main() {}', 'rust')[0].some((t) => t.className === 'hljs-keyword')) throw new Error('highlight.js adapter failed');
const { createHighlightJsAdapter: cjsAdapter } = require('m2diff-viewer/highlight-js');
const hl2 = cjsAdapter();
await hl2.load('python');
if (!hl2.isLoaded('python')) throw new Error('CJS highlight.js adapter failed to load a grammar');
console.log('• highlight.js adapter loads grammars on demand (ESM and CJS)');

const css = require.resolve('m2diff-viewer/styles.css');
if (!css.endsWith('styles.css')) throw new Error('styles.css export missing');
console.log('• styles.css export resolves');
`;
await writeFile(resolve(app, 'ssr.mjs'), ssr);
process.stdout.write(run('node', ['ssr.mjs'], app));

// The core entry must stay framework-free.
const coreFiles = (await readdir(resolve(app, 'node_modules/m2diff-viewer/dist/core'), { recursive: true })).filter((f) =>
  /\.(c?js)$/.test(f),
);
for (const f of coreFiles) {
  const code = await readFile(resolve(app, 'node_modules/m2diff-viewer/dist/core', f), 'utf8');
  if (/from\s*["']react|require\(["']react/.test(code)) throw new Error(`dist/core/${f} imports React`);
}
console.log(`• dist/core (${coreFiles.length} files) has no React imports`);

await rm(work, { recursive: true, force: true });
console.log('✓ smoke test passed');
