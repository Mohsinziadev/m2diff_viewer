import pkg from '../../package.json';

/** Real package facts, read from package.json at build time. */
export const PKG = {
  name: pkg.name,
  version: pkg.version,
  license: pkg.license,
  repository: pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, ''),
  diffRange: pkg.dependencies.diff,
  reactRange: pkg.peerDependencies.react,
  hljsRange: pkg.peerDependencies['highlight.js'],
  node: pkg.engines.node,
} as const;

export const NPM_URL = `https://www.npmjs.com/package/${PKG.name}`;

export const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];
export const installCommand = (pm: PackageManager) => (pm === 'npm' ? `npm install ${PKG.name}` : `${pm} add ${PKG.name}`);

/** M2Toolkit hosts this page at /npm-packages/<slug>; links use absolute URLs like the other package pages. */
export const M2TOOLKIT = 'https://www.m2toolkit.com';
export const PACKAGES_URL = `${M2TOOLKIT}/npm-packages`;

/** Other packages in the M2Toolkit registry (titles and taglines from their own site.config.json). */
export const RELATED = [
  {
    slug: 'm2api-client',
    title: 'API Client',
    tagline: 'A Postman-style API testing workspace you can drop into any React app.',
    accent: '#2a1eff',
  },
  {
    slug: 'm2timeline-motion',
    title: 'Timelines',
    tagline: 'Production-ready timeline and progress components for React.',
    accent: '#6550d6',
  },
  {
    slug: 'upload-motion',
    title: 'Upload Motion',
    tagline: 'Animated, accessible file uploads for React, on a real upload engine.',
    accent: '#7357ff',
  },
  {
    slug: 'smooth-tabs',
    title: 'Smooth Tabs',
    tagline: 'Accessible, scrollable React tabs with an animated indicator.',
    accent: '#4f46e5',
  },
  {
    slug: 'react-advanced-rating',
    title: 'React Advanced Rating',
    tagline: 'Accessible, animated rating components for React.',
    accent: '#f5a524',
  },
].map((p) => ({ ...p, url: `${PACKAGES_URL}/${p.slug}` }));

/** Measured with `npm run size` (minified + gzip, React external). */
export const SIZES = {
  engine: '5.06 kB',
  patch: '5.66 kB',
  json: '5.33 kB',
  csv: '3.44 kB',
  viewer: '26.54 kB',
  jsonViewer: '32.26 kB',
  csvViewer: '6.06 kB',
  hljs: '10.58 kB',
  shiki: '1.56 kB',
  css: '6.15 kB',
};

export type PlaygroundTab = 'code' | 'json' | 'csv';
export const PLAYGROUND_TABS: Array<{ id: PlaygroundTab; label: string }> = [
  { id: 'code', label: 'code' },
  { id: 'json', label: 'json' },
  { id: 'csv', label: 'csv' },
];
