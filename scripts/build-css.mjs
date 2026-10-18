// Bundles and minifies the stylesheet with Lightning CSS, targeting evergreen browsers.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { browserslistToTargets, bundle } from 'lightningcss';

const root = resolve(import.meta.dirname, '..');
// Chrome 111+, Edge 111+, Safari 16.4+, Firefox 113+ (container queries, :focus-visible, inset)
const targets = browserslistToTargets(['chrome >= 111', 'edge >= 111', 'safari >= 16.4', 'firefox >= 113', 'ios_saf >= 16.4']);

const { code, warnings } = bundle({
  filename: resolve(root, 'src/styles/index.css'),
  minify: true,
  targets,
});
for (const w of warnings) console.warn('[css]', w.message, w.loc ?? '');
await mkdir(resolve(root, 'dist'), { recursive: true });
await writeFile(resolve(root, 'dist/styles.css'), code);
console.log(`✓ built dist/styles.css (${(code.length / 1024).toFixed(1)} kB)`);
