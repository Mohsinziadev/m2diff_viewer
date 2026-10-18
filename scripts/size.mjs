// Measures what consumers actually ship: each entry is bundled from the built package (React external,
// `diff` and highlight.js core included), minified and gzipped. Fails when a budget is exceeded.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { rolldown } from 'rolldown';

const root = resolve(import.meta.dirname, '..');
const tmp = resolve(root, '.size');
await rm(tmp, { recursive: true, force: true });
await mkdir(tmp, { recursive: true });

const cases = [
  { name: 'computeDiff (engine)', code: `export { computeDiff } from '../dist/core/index.js';`, budget: 5.5 },
  { name: 'computeDiff + createUnifiedPatch', code: `export { computeDiff, createUnifiedPatch } from '../dist/core/index.js';`, budget: 6 },
  { name: 'diffJson', code: `export { diffJson } from '../dist/core/index.js';`, budget: 6 },
  { name: 'diffCsv', code: `export { diffCsv } from '../dist/core/index.js';`, budget: 4 },
  // Raised for the connectors, command palette, line links and IDE status bar (+4.5 kB).
  { name: '<DiffViewer>', code: `export { DiffViewer } from '../dist/react/index.js';`, budget: 27.5 },
  { name: '<JsonDiffViewer>', code: `export { JsonDiffViewer } from '../dist/react/index.js';`, budget: 33.5 },
  { name: '<CsvDiffViewer>', code: `export { CsvDiffViewer } from '../dist/react/index.js';`, budget: 7 },
  {
    name: 'createHighlightJsAdapter (+ hljs core)',
    code: `export { createHighlightJsAdapter } from '../dist/highlight-js/index.js';`,
    budget: 11.5,
  },
  { name: 'createShikiAdapter (Shiki not included)', code: `export { createShikiAdapter } from '../dist/shiki/index.js';`, budget: 2 },
];

const kb = (n) => (n / 1024).toFixed(2);
const rows = [];
let failed = false;
for (const c of cases) {
  const entry = resolve(tmp, `${rows.length}.js`);
  await writeFile(entry, c.code);
  const bundle = await rolldown({
    input: entry,
    external: [/^react/],
    platform: 'browser',
    // mirror package.json "sideEffects": only CSS has side effects
    treeshake: { moduleSideEffects: (id) => id.endsWith('.css') },
    transform: { define: { 'process.env.NODE_ENV': '"production"' } },
    onLog(level, log, handler) {
      if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log);
    },
  });
  const { output } = await bundle.generate({ format: 'esm', minify: true });
  await bundle.close();
  // Only the entry chunk counts: lazily imported grammars become separate chunks.
  const code = output.find((o) => o.type === 'chunk' && o.isEntry).code;
  const gz = gzipSync(code).length;
  const ok = gz / 1024 <= c.budget;
  failed ||= !ok;
  rows.push(
    `${ok ? '✓' : '✗'} ${c.name.padEnd(42)} ${kb(code.length).padStart(7)} kB min  ${kb(gz).padStart(6)} kB gzip  (budget ${c.budget} kB)`,
  );
}
const css = await readFile(resolve(root, 'dist/styles.css'));
const cssGz = gzipSync(css).length;
const cssBudget = 6.75;
const cssOk = cssGz / 1024 <= cssBudget;
failed ||= !cssOk;
rows.push(
  `${cssOk ? '✓' : '✗'} ${'styles.css'.padEnd(42)} ${kb(css.length).padStart(7)} kB min  ${kb(cssGz).padStart(6)} kB gzip  (budget ${cssBudget} kB)`,
);
await rm(tmp, { recursive: true, force: true });
console.log(rows.join('\n'));
if (failed) {
  console.error('\nSize budget exceeded.');
  process.exit(1);
}
