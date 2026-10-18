/**
 * Builds the package landing page as static, prerendered HTML.
 *
 * This file is shared verbatim by every package listed on m2toolkit.com/npm-packages;
 * per-package settings live in site.config.json. See "Landing page" in CONTRIBUTING.md.
 *
 * Contract (what m2toolkit's `npm run sync:packages` relies on):
 *   SITE_BASE=/npm-packages/<slug>/ npm run build:site
 *   → site-dist/index.html          prerendered page with canonical, Open Graph and JSON-LD tags
 *   → site-dist/assets/*            hashed JS/CSS/images, referenced from SITE_BASE
 *   → site-dist/package-info.json   listing data generated from package.json + site.config.json
 * Without SITE_BASE the page is built for the site root (e.g. a Vercel preview).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

process.env.NODE_ENV = 'production';

const root = fileURLToPath(new URL('..', import.meta.url));
const site = JSON.parse(await readFile(join(root, 'site.config.json'), 'utf8'));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

const base = process.env.SITE_BASE || '/';
if (!base.startsWith('/') || !base.endsWith('/')) throw new Error(`SITE_BASE must start and end with "/" (got "${base}")`);

const outDir = join(root, 'site-dist');
const ssrDir = join(root, 'node_modules', '.site-ssr');
const configFile = join(root, site.build.viteConfig);
const viteRoot = join(root, site.build.root);

// 1. Client bundle
await build({ configFile, root: viteRoot, base, logLevel: 'warn', build: { outDir, emptyOutDir: true } });

// 2. Server bundle (same base, so asset URLs match the client and hydration lines up)
await build({
  configFile,
  root: viteRoot,
  base,
  logLevel: 'warn',
  build: {
    ssr: join(root, site.build.serverEntry),
    outDir: ssrDir,
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'entry-server.mjs' } },
  },
});

// 3. Prerender into the client HTML
const { render } = await import(pathToFileURL(join(ssrDir, 'entry-server.mjs')).href);
const appHtml = render();
let html = await readFile(join(outDir, 'index.html'), 'utf8');
if (!html.includes('<div id="root"></div>')) throw new Error('index.html must contain an empty <div id="root"></div>');
html = html.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`);

const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
const escape = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const pageTitle = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? pkg.name);
const pageDescription = decode(html.match(/<meta\s+name="description"\s+content="([^"]*)"/)?.[1] ?? pkg.description);
const repository = String(pkg.repository?.url ?? pkg.repository ?? '')
  .replace(/^git\+/, '')
  .replace(/\.git$/, '');
const npmUrl = `https://www.npmjs.com/package/${pkg.name}`;

// 4. SEO tags. The canonical always points at m2toolkit.com so mirrors (e.g. Vercel) don't compete with it.
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareSourceCode',
  name: pkg.name,
  description: pkg.description,
  url: site.url,
  codeRepository: repository,
  programmingLanguage: 'TypeScript',
  runtimePlatform: 'React',
  license: `https://spdx.org/licenses/${pkg.license}.html`,
  version: pkg.version,
  keywords: (pkg.keywords ?? []).join(', '),
  author: { '@type': 'Person', name: String(pkg.author ?? '').replace(/\s*<.*>$/, '') },
};
const head = [
  `<link rel="canonical" href="${site.url}" />`,
  `<meta property="og:type" content="website" />`,
  `<meta property="og:site_name" content="${escape(site.siteName)}" />`,
  `<meta property="og:title" content="${escape(pageTitle)}" />`,
  `<meta property="og:description" content="${escape(pageDescription)}" />`,
  `<meta property="og:url" content="${site.url}" />`,
  `<meta property="og:image" content="${site.ogImage}" />`,
  `<meta name="twitter:card" content="summary_large_image" />`,
  `<meta name="twitter:title" content="${escape(pageTitle)}" />`,
  `<meta name="twitter:description" content="${escape(pageDescription)}" />`,
  `<meta name="twitter:image" content="${site.ogImage}" />`,
  `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`,
];
if (html.includes('rel="canonical"')) throw new Error('index.html already has a canonical tag; build-site adds it');
html = html.replace(/\s*<\/head>/, `\n    ${head.join('\n    ')}\n  </head>`);
await writeFile(join(outDir, 'index.html'), html);

// 5. Listing data for m2toolkit
let updated = new Date().toISOString().slice(0, 10);
try {
  updated = execFileSync('git', ['log', '-1', '--format=%cs'], { cwd: root, encoding: 'utf8' }).trim() || updated;
} catch {
  /* not a git checkout */
}
const info = {
  slug: site.slug,
  url: site.url,
  name: pkg.name,
  title: site.title,
  tagline: site.tagline,
  accent: site.accent,
  highlights: site.highlights,
  version: pkg.version,
  description: pkg.description,
  keywords: pkg.keywords ?? [],
  license: pkg.license,
  repository,
  issues: pkg.bugs?.url ?? (repository ? `${repository}/issues` : undefined),
  npm: npmUrl,
  install: `npm install ${pkg.name}`,
  pageTitle,
  pageDescription,
  updated,
};
await writeFile(join(outDir, 'package-info.json'), `${JSON.stringify(info, null, 2)}\n`);
await rm(ssrDir, { recursive: true, force: true });

if (!existsSync(join(outDir, 'index.html'))) throw new Error('site-dist/index.html was not written');
console.log(`Built ${pkg.name}@${pkg.version} landing page → site-dist/ (base ${base})`);
