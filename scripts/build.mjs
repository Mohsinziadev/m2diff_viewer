// Builds the library: ESM + CJS (one file per source module, so bundlers can tree-shake), source maps,
// one self-contained type declaration file per entry point (for both module systems), and a check that
// every React component keeps its 'use client' directive.
import { copyFile, readdir, readFile, rm } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { rolldown } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const external = [/^react($|\/)/, /^diff($|\/)/, /^highlight\.js($|\/)/];
const entries = {
  'react/index': 'src/react/index.ts',
  'core/index': 'src/core/index.ts',
  'highlight-js/index': 'src/highlight-js/index.ts',
  'shiki/index': 'src/shiki/index.ts',
};

await rm(dist, { recursive: true, force: true });

const input = Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, resolve(root, v)]));
const bundle = await rolldown({
  input,
  external,
  platform: 'neutral',
  treeshake: true,
  transform: { target: 'es2020', jsx: 'react-jsx' },
  onLog(level, log, handler) {
    if (log.code === 'MODULE_LEVEL_DIRECTIVE') return; // verified below
    handler(level, log);
  },
});
const shared = { dir: dist, preserveModules: true, preserveModulesRoot: 'src', sourcemap: true, exports: 'named' };
await bundle.write({ ...shared, format: 'esm', entryFileNames: '[name].js' });
await bundle.write({ ...shared, format: 'cjs', entryFileNames: '[name].cjs' });
await bundle.close();

// Declarations: each entry gets a self-contained file, duplicated as .d.cts for `require` consumers.
for (const [name, file] of Object.entries(entries)) {
  const types = await rolldown({
    input: { [name]: resolve(root, file) },
    external,
    plugins: [dts({ emitDtsOnly: true, tsconfig: resolve(root, 'tsconfig.build.json') })],
  });
  await types.write({ dir: dist, format: 'esm', entryFileNames: '[name].js' });
  await types.close();
  await copyFile(resolve(dist, `${name}.d.ts`), resolve(dist, `${name}.d.cts`));
}

// Guard: every source module marked 'use client' must keep the directive in both formats.
const sources = (await readdir(resolve(root, 'src'), { recursive: true })).filter((f) => /\.tsx?$/.test(f));
let checked = 0;
for (const file of sources) {
  const code = await readFile(resolve(root, 'src', file), 'utf8');
  if (!/^\s*['"]use client['"]/.test(code)) continue;
  for (const ext of ['.js', '.cjs']) {
    const out = resolve(dist, file.replace(/\.tsx?$/, ext));
    const built = await readFile(out, 'utf8');
    if (!/^\s*['"]use client['"]/.test(built)) throw new Error(`'use client' missing in ${relative(root, out)}`);
    checked++;
  }
}

console.log(
  `✓ built dist (esm, cjs, source maps, d.ts, d.cts for ${Object.keys(entries).length} entries) — ${checked} client boundaries verified`,
);
