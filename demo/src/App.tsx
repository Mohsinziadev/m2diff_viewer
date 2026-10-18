import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { setTheme, useHydrated, useTheme } from './client';
import { FILES, highlight } from './code';
import {
  installCommand,
  M2TOOLKIT,
  NPM_URL,
  PACKAGE_MANAGERS,
  PACKAGES_URL,
  PKG,
  RELATED,
  SIZES,
  type PackageManager,
  PLAYGROUND_TABS,
  type PlaygroundTab,
} from './meta';
import { Playground } from './Playground';

/** Section index, Warp-style: press the letter to jump to the section. */
const SECTIONS = [
  { key: 'P', id: 'playground', label: 'playground' },
  { key: 'F', id: 'features', label: 'features' },
  { key: 'C', id: 'code', label: 'code' },
  { key: 'E', id: 'engine', label: 'engine' },
  { key: 'L', id: 'layers', label: 'layers' },
  { key: 'A', id: 'api', label: 'api' },
  { key: 'K', id: 'keyboard', label: 'keyboard' },
  { key: 'N', id: 'packages', label: 'packages' },
  { key: 'Q', id: 'faq', label: 'faq' },
] as const;

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied((c) => (c === text ? null : c)), 1400);
    });
  };
  return { copied, copy };
}

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 20 20" aria-hidden="true">
      <rect width="20" height="20" rx="4" />
      <path className="logo-del" d="M5 6.5h4M5 10h3" />
      <path className="logo-add" d="M11 10h4M11 13.5h4M13 11.5v4" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path d="M4 12L12 4M5.5 4H12v6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function SectionHead({ k, eyebrow, title, children }: { k: string; eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="section-head">
      <p className="eyebrow mono">
        <span className="key">[{k}]</span> {eyebrow}
      </p>
      <h2>{title}</h2>
      {children && <p className="lede">{children}</p>}
    </header>
  );
}

function Fig({ n, caption, children, className = '' }: { n: string; caption: string; children: ReactNode; className?: string }) {
  return (
    <figure className={`fig ${className}`}>
      {children}
      <figcaption className="mono">
        <span className="prompt">&gt;_</span> fig. {n} — {caption}
      </figcaption>
    </figure>
  );
}

function InstallBox({ large = false }: { large?: boolean }) {
  const [pm, setPm] = useState<PackageManager>('npm');
  const { copied, copy } = useCopy();
  const cmd = installCommand(pm);
  return (
    <div className={`install${large ? ' install-lg' : ''}`}>
      <div className="install-tabs" role="tablist" aria-label="Package manager">
        {PACKAGE_MANAGERS.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={pm === p} onClick={() => setPm(p)}>
            {p}
          </button>
        ))}
      </div>
      <div className="install-cmd">
        <code>
          <span className="prompt">&gt;_</span> {cmd}
        </code>
        <button type="button" className="btn btn-ghost" onClick={() => copy(cmd)}>
          {copied === cmd ? 'copied' : 'copy'}
        </button>
      </div>
    </div>
  );
}

/** A static, annotated miniature of the viewer for the hero (the real one runs in fig. 1). */
function Anatomy() {
  const rows: Array<[string, string, string, string, string]> = [
    // [kind, old no, old text, new no, new text]
    ['eq', '7', 'export function total(', '9', 'export function total('],
    ['mod', '8', '  items: LineItem[]', '10', '  items: LineItem[], taxRate = 0'],
    ['del', '9', '  let sum = 0;', '11', ''],
    ['del', '10', '  for (const i of items)', '', ''],
    ['add', '', '', '12', '  const net = items.reduce(…);'],
    ['eq', '11', '}', '13', '}'],
  ];
  return (
    <div className="anatomy mono" aria-hidden="true">
      <div className="anat-bar">
        <span>src/cart.ts</span>
        <span className="anat-chip">⌘K</span>
      </div>
      <div className="anat-grid">
        <div className="anat-pane">
          {rows.map(([k, n, t], i) => (
            <div key={i} className={`anat-row anat-${k === 'add' ? 'fill' : k}`}>
              <span className="anat-n">{n}</span>
              <span className="anat-t">{k === 'mod' ? <>{t.slice(0, 19)}</> : t}</span>
            </div>
          ))}
        </div>
        <svg className="anat-links" viewBox="0 0 40 132" preserveAspectRatio="none">
          <path className="band-mod" d="M0 22H40V44C20 44 20 44 0 44Z" />
          <path className="band-del" d="M0 44H40C20 44 20 88 0 88Z" />
          <path className="band-add" d="M0 88H40V110C20 110 20 88 0 88Z" />
        </svg>
        <div className="anat-pane">
          {rows.map(([k, , , n, t], i) => (
            <div key={i} className={`anat-row anat-${k === 'del' ? 'fill' : k === 'mod' ? 'mod-new' : k}`}>
              <span className="anat-n">{n}</span>
              <span className="anat-t">
                {k === 'mod' ? (
                  <>
                    {t.slice(0, 19)}
                    <mark>, taxRate = 0</mark>
                  </>
                ) : (
                  t
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="anat-status">
        <span className="anat-plus">+2</span> <span className="anat-minus">−3</span> <span>Diff 2 / 3</span>
        <span className="anat-sp" />
        <span className="anat-wide">R Ln 10</span> <span className="anat-wide">Spaces: 2</span> <span>TypeScript</span>{' '}
        <span className="anat-wide">⏱ 1 ms</span>
      </div>
      <ol className="anat-notes">
        <li>
          <b>01</b> word-level highlights
        </li>
        <li>
          <b>02</b> connectors with » « merge arrows
        </li>
        <li>
          <b>03</b> IDE-style status bar
        </li>
      </ol>
    </div>
  );
}

const FEATURES = [
  {
    title: 'three views',
    body: 'Side-by-side, inline and unified patch. Synchronized scrolling, resizable panes, and automatic inline layout on narrow screens.',
    fig: 'views',
    visual: (
      <div className="vis-views mono">
        <span>
          <i className="v-split" /> split
        </span>
        <span>
          <i className="v-inline" /> inline
        </span>
        <span>
          <i className="v-patch" /> unified
        </span>
      </div>
    ),
  },
  {
    title: 'edit-aware highlighting',
    body: 'Edited lines are paired by similarity, then highlighted at word or character level. Unequal line counts never break alignment.',
    fig: 'word diff',
    visual: (
      <div className="vis-words mono">
        <div className="w-del">
          − return <del>sum</del>;
        </div>
        <div className="w-add">
          + return <ins>Math.round(net * 100) / 100</ins>;
        </div>
      </div>
    ),
  },
  {
    title: 'connectors & merge arrows',
    body: 'IDE-style bands link every change to its counterpart. Hover to light up both sides; click » or « to copy a change across.',
    fig: 'connectors',
    visual: (
      <div className="vis-links mono">
        <span className="l-a">−−−</span>
        <span className="l-band">
          <b>»</b>
          <b>«</b>
        </span>
        <span className="l-b">+++</span>
      </div>
    ),
  },
  {
    title: 'command palette',
    body: 'Every action in one fuzzy list. Type : to go to a line, # to jump to a difference. Click line numbers for #R10-R20 links.',
    fig: '⌘K',
    visual: (
      <ul className="vis-palette mono">
        <li className="on">
          <span>
            <b>Go:</b> Next difference
          </span>
          <kbd>F7</kbd>
        </li>
        <li>
          <span>
            <b>Go to:</b> Modified line 42
          </span>
          <span className="muted">:R42</span>
        </li>
        <li>
          <span>
            <b>Whitespace:</b> Ignore all
          </span>
          <span className="ok">✓</span>
        </li>
      </ul>
    ),
  },
  {
    title: 'JSON & CSV structural diffs',
    body: 'JSON is compared as a tree of paths, with ignorable paths and keyed arrays. CSV is compared by rows and cells, matched by key columns.',
    fig: 'paths',
    visual: (
      <ul className="vis-paths mono">
        <li>
          <b className="p-mod">~</b> items[sku=A1].qty <span className="muted">2 → 3</span>
        </li>
        <li>
          <b className="p-add">+</b> metadata.tags[2] <span className="muted">&quot;gift&quot;</span>
        </li>
        <li>
          <b className="p-del">−</b> request.legacyId
        </li>
        <li className="muted">≈ meta.timestamp (ignored)</li>
      </ul>
    ),
  },
  {
    title: 'built for large inputs',
    body: 'Virtualized rendering, highlighting of visible lines only, time and size limits, and Web Worker comparison with real cancellation.',
    fig: '100,000 lines',
    visual: (
      <div className="vis-big mono">
        <div className="big-row">
          <span>rendered</span>
          <i style={{ width: '7%' }} />
          <span>~60 rows</span>
        </div>
        <div className="big-row">
          <span>highlighted</span>
          <i style={{ width: '7%' }} />
          <span>visible only</span>
        </div>
        <div className="big-row">
          <span>compared</span>
          <i style={{ width: '100%' }} />
          <span>in a worker</span>
        </div>
      </div>
    ),
  },
];

const LAYERS = [
  {
    title: 'engine',
    api: "import … from 'm2diff-viewer/core'",
    body: 'computeDiff, createUnifiedPatch, searchDiff, folding and reports. No React or DOM dependency.',
    size: `${SIZES.engine} gzip`,
  },
  {
    title: 'structured data',
    api: 'diffJson() diffCsv()',
    body: 'Path-level JSON, JSONC and .env diffs, and key-matched CSV row and cell diffs, in the same engine.',
    size: `${SIZES.json} / ${SIZES.csv} gzip`,
  },
  {
    title: 'react components',
    api: '<DiffViewer /> <JsonDiffViewer /> <CsvDiffViewer />',
    body: 'The full review UI: toolbar, search, folding, connectors, command palette, status bar. Plus the headless useDiff hook.',
    size: `${SIZES.viewer} gzip`,
  },
  {
    title: 'highlighting adapters',
    api: "'m2diff-viewer/highlight-js' '/shiki'",
    body: 'Pluggable syntax highlighting. highlight.js grammars load on demand; Shiki brings VS Code themes.',
    size: `${SIZES.hljs} / ${SIZES.shiki} gzip`,
  },
];

const REQUIREMENTS: Array<[string, ReactNode, string]> = [
  ['react, react-dom', <code key="r">{PKG.reactRange}</code>, 'Optional peer. Engine-only users skip it.'],
  ['highlight.js', <code key="h">{PKG.hljsRange}</code>, 'Optional peer, for m2diff-viewer/highlight-js.'],
  ['shiki', <code key="s">any recent</code>, 'Optional, for m2diff-viewer/shiki (bring your own).'],
  ['diff', <code key="d">{PKG.diffRange}</code>, 'The only runtime dependency (Myers line diff).'],
  ['node', <code key="n">{PKG.node}</code>, 'For the engine on servers, CLIs and tests.'],
  ['browsers', <span key="b">Chrome/Edge 111+, Safari 16.4+, Firefox 113+</span>, 'Container queries and :focus-visible.'],
  ['typescript', <span key="t">types included</span>, 'ESM + CJS builds with .d.ts and .d.cts.'],
  ['license', <code key="l">{PKG.license}</code>, 'Free for commercial use.'],
];

const ENTRY_POINTS: Array<[string, string]> = [
  ['m2diff-viewer', 'React components, hooks, and every core export'],
  ['m2diff-viewer/core', 'The framework-free engine: computeDiff, diffJson, diffCsv, patches, search'],
  ['m2diff-viewer/highlight-js', 'createHighlightJsAdapter(): lazy grammars, one chunk per language'],
  ['m2diff-viewer/shiki', 'createShikiAdapter(): VS Code themes and grammars via Shiki'],
  ['m2diff-viewer/styles.css', `The stylesheet (${SIZES.css} gzip), every class scoped under .m2d-`],
];

const PROPS: Array<[string, string, string, string]> = [
  ['original, modified', 'string | null', '—', 'The texts. null means the file does not exist (added / deleted).'],
  ['originalName, modifiedName', 'string', '—', 'Shown in headers and patches; also infer the language.'],
  ['language', 'string', 'inferred', "Language id or alias ('ts', 'py'), or 'auto' to detect."],
  ['highlighter', 'SyntaxHighlighter', '—', 'From createHighlightJsAdapter() or createShikiAdapter().'],
  ['view, defaultView', "'split' | 'inline' | 'unified' | 'auto'", "'auto'", 'Side-by-side from 720px, inline below.'],
  ['options', 'DiffOptions', '{}', 'ignoreWhitespace, ignoreCase, lineEndings, intraline, limits.'],
  ['collapseUnchanged', 'boolean', 'true', 'Fold unchanged regions, keeping contextLines around changes.'],
  ['connectors', 'boolean', 'true', 'Bands and » « arrows between the panes.'],
  ['onApplyChange', '(e) => void', '—', 'Makes the arrows copy a change; e.target and e.text say what to update.'],
  ['selection, onSelectionChange', 'LineSelection | null', '—', 'Lines selected from the line numbers.'],
  ['syncHash', 'boolean | string', 'false', 'Mirror the selection in the URL: #L12, #R10-R20.'],
  ['theme', "'light' | 'dark' | 'auto'", "'auto'", 'auto follows prefers-color-scheme.'],
  ['height', 'number | string', '560px', "'auto' grows with content."],
  ['virtualize', "boolean | 'auto'", "'auto'", 'Render only visible rows above 400 rows.'],
  ['toolbar, statusBar', 'boolean | ToolbarOptions', 'true', 'Show, hide or pick individual controls.'],
  ['keyBindings', 'Partial<KeyBindings> | false', 'see [K]', 'Override or disable shortcuts.'],
  ['differ', 'Differ', '—', 'Compare off the main thread, e.g. createWorkerDiffer().'],
  ['onDiff, onNavigate, onExport', 'callbacks', '—', 'Result, navigation and copy/download events.'],
];

const HANDLE = [
  'nextChange()',
  'previousChange()',
  'goToChange(i)',
  'expandAll()',
  'collapseAll()',
  'openSearch(query?)',
  'openCommandPalette(query?)',
  'getUnifiedPatch(options?)',
  'getReport()',
];

const THEMING = `.my-review .m2d-root {
  --m2d-font-mono: 'JetBrains Mono', monospace;
  --m2d-code-size: 12.5px;
  --m2d-row-h: 19px;          /* keep rowHeight={19} in sync */
  --m2d-accent: #0b8f6a;
  --m2d-add-bg: #e6f6ee;
  --m2d-del-bg: #fdecec;
}`;

const KEYS: Array<[string[], string]> = [
  [['⌘/Ctrl', 'K'], 'Command palette (also ⌘/Ctrl + Shift + P)'],
  [['F7', 'Shift + F7'], 'Next / previous difference (also Alt + ↓ / ↑)'],
  [['⌘/Ctrl', 'F'], 'Search either or both sides'],
  [['F3', 'Shift + F3'], 'Next / previous match'],
  [[':', '#'], 'In the palette: go to a line, jump to a difference'],
  [['click', 'shift + click'], 'Select and extend lines from the line numbers'],
  [['Esc'], 'Clear the line selection, close search or the palette'],
  [['←', '→', 'Enter'], 'Resize the panes from the divider, reset with Enter'],
];

const FAQ: Array<[string, ReactNode]> = [
  [
    'Is my code uploaded anywhere?',
    <>
      No. Everything runs in the browser (or Node). Nothing is uploaded, and no grammar or code is fetched from a CDN: highlight.js grammars
      are lazy chunks of your own bundle.
    </>,
  ],
  [
    'Can I use it with Next.js?',
    <>
      Yes. Components carry <code>&apos;use client&apos;</code>, so you can render them from a Server Component page with plain string
      props. Import <code>m2diff-viewer/styles.css</code> once in <code>app/layout.tsx</code>. Server rendering produces complete markup.
    </>,
  ],
  [
    'Can users merge changes, like in an IDE?',
    <>
      Yes. Pass <code>onApplyChange</code> and the » « arrows become buttons: the event carries the side to update and its new text. The
      viewer stays controlled, so you decide what happens next (save, undo, review).
    </>,
  ],
  [
    'How big a file can it handle?',
    <>
      The demo above includes 20,000 and 100,000 line samples. Rows are virtualized, only visible lines are highlighted, and with{' '}
      <code>createWorkerDiffer()</code> the comparison runs in a Web Worker with real cancellation. Size and time limits fall back to a
      simplified diff with a warning instead of freezing the page.
    </>,
  ],
  [
    'Can I use the engine without React?',
    <>
      Yes. <code>m2diff-viewer/core</code> has no React or DOM dependency, so it runs in Node 18+, workers, CLIs and tests. Vue or Svelte
      views can be built on it and share <code>styles.css</code>.
    </>,
  ],
  [
    'Is it accessible?',
    <>
      Every control is a native button, select or input with a visible focus ring. Changes never rely on color alone (signs and
      screen-reader prefixes), navigation is announced, colors meet WCAG AA in both themes, and the test suite runs axe-core on every view.
    </>,
  ],
];

export function App() {
  const theme = useTheme();
  const hydrated = useHydrated();
  const [file, setFile] = useState(0);
  const [tab, setTab] = useState<PlaygroundTab>('code');
  const { copied, copy } = useCopy();

  // Press a section letter to jump there, unless typing or working inside the live viewer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable], .m2d-root, [role="tab"]')) return;
      const s = SECTIONS.find((x) => x.key === e.key.toUpperCase());
      if (!s) return;
      document
        .getElementById(s.id)
        ?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const current = FILES[file];
  const install = `npm install ${PKG.name}`;

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <a className="brand" href="#top" aria-label={`${PKG.name} home`}>
            <Logo />
            <span>{PKG.name}</span>
            <span className="chip mono">v{PKG.version}</span>
          </a>
          <nav className="topnav" aria-label="Page">
            <a href="#features">features</a>
            <a href="#code">docs</a>
            <a href="#api">api</a>
            <a href={PACKAGES_URL}>npm packages</a>
          </nav>
          <div className="topbar-actions">
            <a className="btn btn-icon" href={PKG.repository} target="_blank" rel="noreferrer" aria-label="Source on GitHub">
              <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
                />
              </svg>
            </a>
            <button
              type="button"
              className="btn btn-icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <a className="btn btn-primary" href={NPM_URL} target="_blank" rel="noreferrer">
              view on npm <Arrow />
            </a>
          </div>
        </div>
        <div className="wrap index-row mono" aria-label="Sections">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              <span className="key">[{s.key}]</span> {s.label}
            </a>
          ))}
        </div>
      </header>

      <main id="main">
        <section className="hero wrap" id="top">
          <div className="hero-copy">
            <p className="eyebrow mono">
              <span className="dot" /> open source · {PKG.license} · react 18 &amp; 19 · v{PKG.version}
            </p>
            <h1>
              Review diffs like an IDE, <em>inside your React app.</em>
            </h1>
            <p className="hero-sub">
              a code and data diff viewer for React. side-by-side, inline and unified views, word-level highlighting, change connectors, a
              command palette, and JSON &amp; CSV structural diffs, on an engine with no React or DOM dependency.
            </p>
            <div className="hero-ctas">
              <a className="btn btn-primary btn-lg" href="#playground">
                try it live ↓
              </a>
              <button type="button" className="btn btn-lg btn-code" onClick={() => copy(install)}>
                <span className="prompt">&gt;_</span> {install}
                <span className="btn-hint">{copied === install ? 'copied' : 'copy'}</span>
              </button>
            </div>
          </div>
          <Fig n="0" caption="anatomy of a review" className="hero-fig">
            <Anatomy />
          </Fig>
        </section>

        <section className="wrap" id="playground" aria-label="Live playground">
          <Fig n="1" caption="the real components, running live. edit the inputs, press ⌘K, click » or «." className="fig-hero">
            <div className="window">
              <div className="window-bar">
                <span className="lights" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <div className="seg mono" role="tablist" aria-label="Playground">
                  {PLAYGROUND_TABS.map((t) => (
                    <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <span className="window-title mono">
                  &lt;{tab === 'code' ? 'DiffViewer' : tab === 'json' ? 'JsonDiffViewer' : 'CsvDiffViewer'} /&gt;
                </span>
              </div>
              <div className="window-body" role="tabpanel">
                {hydrated ? (
                  <Playground tab={tab} theme={theme} />
                ) : (
                  <div className="live-placeholder" aria-hidden="true">
                    <span className="mono">loading playground…</span>
                  </div>
                )}
              </div>
            </div>
          </Fig>
          <dl className="stats">
            <div>
              <dt className="mono">views</dt>
              <dd>
                3 <small>split · inline · unified, + json &amp; csv</small>
              </dd>
            </div>
            <div>
              <dt className="mono">engine only</dt>
              <dd>
                {SIZES.engine} <small>gzip</small>
              </dd>
            </div>
            <div>
              <dt className="mono">complete viewer</dt>
              <dd>
                {SIZES.viewer} <small>gzip</small>
              </dd>
            </div>
            <div>
              <dt className="mono">largest demo file</dt>
              <dd>
                100,000 <small>lines</small>
              </dd>
            </div>
          </dl>
        </section>

        <section className="wrap built-for" aria-label="Works with">
          <p className="mono">built for</p>
          <ul>
            {['React 18', 'React 19', 'Next.js App Router', 'Vite', 'Node 18+', 'Web Workers', 'ESM + CJS', 'TypeScript'].map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>

        <section className="section wrap" id="features">
          <SectionHead
            k="F"
            eyebrow="features"
            title={
              <>
                Everything a review needs. <em>Nothing it doesn&apos;t.</em>
              </>
            }
          >
            The tools you expect from an IDE diff, as one React component: views, highlighting, connectors, a command palette, search,
            folding and exports.
          </SectionHead>
          <ol className="cards">
            {FEATURES.map((f, i) => (
              <li key={f.title} className="card">
                <span className="num mono">{String(i + 1).padStart(2, '0')}</span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
                <Fig n={`2.${i + 1}`} caption={f.fig}>
                  <div className="vis">{f.visual}</div>
                </Fig>
              </li>
            ))}
          </ol>
        </section>

        <section className="section wrap" id="code">
          <SectionHead
            k="C"
            eyebrow="quick start"
            title={
              <>
                One import. <em>One stylesheet.</em>
              </>
            }
          >
            Install the package, import the component and <code>m2diff-viewer/styles.css</code>. Every class is prefixed with{' '}
            <code>.m2d-</code>, so nothing leaks into the rest of your page.
          </SectionHead>
          <InstallBox />
          <div className="editor">
            <div className="tree mono" role="tablist" aria-label="Example files" aria-orientation="vertical">
              <p className="tree-root">▾ your-app</p>
              {FILES.map((f, i) => (
                <button key={f.path} type="button" role="tab" aria-selected={file === i} onClick={() => setFile(i)}>
                  <span className="tree-path">{f.path}</span>
                  <span className="tree-label">{f.label}</span>
                </button>
              ))}
            </div>
            <div className="codepane" role="tabpanel" aria-label={current.path}>
              <div className="codepane-bar mono">
                <span>{current.path}</span>
                <button type="button" className="btn btn-ghost" onClick={() => copy(current.code)}>
                  {copied === current.code ? 'copied' : 'copy'}
                </button>
              </div>
              <pre className="code mono">
                {current.code.split('\n').map((line, i) => (
                  <span key={`${file}-${i}`} className="line">
                    <span className="ln" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span>{highlight(line)}</span>
                    {'\n'}
                  </span>
                ))}
              </pre>
            </div>
          </div>
        </section>

        <section className="section wrap" id="engine">
          <div className="split">
            <SectionHead
              k="E"
              eyebrow="engine"
              title={
                <>
                  One engine. <em>No UI required.</em>
                </>
              }
            >
              <code>m2diff-viewer/core</code> has no React or DOM dependency. Use it in Node, CLIs, servers, workers and tests, or build
              your own view on it. Server rendering produces complete markup.
            </SectionHead>
            <Fig n="3" caption="what computeDiff does">
              <div className="run mono">
                <div className="run-row">
                  <span className="run-k">normalize</span>
                  <span>whitespace · case · line endings → keys</span>
                  <span className="run-ok">text untouched</span>
                </div>
                <div className="run-row">
                  <span className="run-k">diff</span>
                  <span>Myers on interned lines, prefix/suffix trimmed</span>
                  <span className="run-ok">deterministic</span>
                </div>
                <div className="run-row">
                  <span className="run-k">align</span>
                  <span>pair edited lines by bigram similarity</span>
                  <span className="run-ok">rows</span>
                </div>
                <div className="run-row">
                  <span className="run-k">intraline</span>
                  <span>word or character ranges inside edits</span>
                  <span className="run-ok">ranges</span>
                </div>
                <div className="run-row">
                  <span className="run-k">output</span>
                  <span>rows · changes · stats · patch · report</span>
                  <span className="run-ok">DiffResult</span>
                </div>
                <div className="run-row run-err">
                  <span className="run-k">limits</span>
                  <span>maxLines · maxChars · timeoutMs</span>
                  <span className="run-bad">warns, never hangs</span>
                </div>
              </div>
            </Fig>
          </div>
        </section>

        <section className="section wrap" id="layers">
          <SectionHead
            k="L"
            eyebrow="architecture"
            title={
              <>
                Open at <em>every layer.</em>
              </>
            }
          >
            Use the complete viewer, compose the headless useDiff hook with your own UI, or call the engine directly. Sizes are minified and
            gzipped with React external.
          </SectionHead>
          <ol className="layers">
            {LAYERS.map((l, i) => (
              <li key={l.title} className="layer">
                <span className="num mono">{String(i + 1).padStart(2, '0')}</span>
                <h3>{l.title}</h3>
                <code className="layer-api">{l.api}</code>
                <p>{l.body}</p>
                <span className="layer-size mono">{l.size}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="section wrap" id="api">
          <SectionHead
            k="A"
            eyebrow="api reference"
            title={
              <>
                Everything you need <em>before you install.</em>
              </>
            }
          >
            Requirements, entry points, the main props and the imperative handle. The full reference with every option is in the{' '}
            <a href={`${NPM_URL}#readme`}>README</a>.
          </SectionHead>

          <div className="api-grid">
            <div className="api-block">
              <h3 className="api-title mono">requirements</h3>
              <table className="table">
                <tbody>
                  {REQUIREMENTS.map(([name, value, note]) => (
                    <tr key={name}>
                      <th scope="row" className="mono">
                        {name}
                      </th>
                      <td>{value}</td>
                      <td className="muted">{note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="api-block">
              <h3 className="api-title mono">entry points</h3>
              <table className="table">
                <tbody>
                  {ENTRY_POINTS.map(([path, what]) => (
                    <tr key={path}>
                      <th scope="row">
                        <code>{path}</code>
                      </th>
                      <td className="muted">{what}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3 className="api-title mono">ref handle</h3>
              <ul className="handle mono">
                {HANDLE.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="api-block">
            <h3 className="api-title mono">&lt;DiffViewer /&gt; props</h3>
            <div className="table-scroll">
              <table className="table table-props">
                <thead>
                  <tr>
                    <th scope="col">prop</th>
                    <th scope="col">type</th>
                    <th scope="col">default</th>
                    <th scope="col">description</th>
                  </tr>
                </thead>
                <tbody>
                  {PROPS.map(([name, type, def, desc]) => (
                    <tr key={name}>
                      <th scope="row">
                        <code>{name}</code>
                      </th>
                      <td>
                        <code className="type">{type}</code>
                      </td>
                      <td>
                        <code>{def}</code>
                      </td>
                      <td className="muted">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="api-grid">
            <div className="api-block">
              <h3 className="api-title mono">theming</h3>
              <p className="api-note">
                Colors, fonts and sizes are CSS custom properties on <code>.m2d-root</code>, with light, dark and auto themes and a
                forced-colors mode. Override them on any wrapper.
              </p>
            </div>
            <pre className="code code-block mono">
              {THEMING.split('\n').map((line, i) => (
                <span key={i} className="line">
                  <span className="ln" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>{line}</span>
                  {'\n'}
                </span>
              ))}
            </pre>
          </div>
        </section>

        <section className="section wrap" id="keyboard">
          <SectionHead
            k="K"
            eyebrow="accessibility"
            title={
              <>
                Built for <em>the keyboard.</em>
              </>
            }
          >
            Every control is a native button, select or input with a visible focus ring. Shortcuts are active while focus is inside the
            viewer, and you can override them with keyBindings.
          </SectionHead>
          <ul className="keys">
            {KEYS.map(([keys, action]) => (
              <li key={action}>
                <span className="kbds">
                  {keys.map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}
                </span>
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="section wrap" id="packages">
          <SectionHead
            k="N"
            eyebrow="m2toolkit"
            title={
              <>
                More open-source packages <em>from M2Toolkit.</em>
              </>
            }
          />
          <ul className="related">
            {RELATED.map((p) => (
              <li key={p.slug}>
                <a href={p.url} style={{ '--accent': p.accent } as CSSProperties}>
                  <span className="related-dot" aria-hidden="true" />
                  <span className="related-title">{p.title}</span>
                  <span className="related-tag">{p.tagline}</span>
                  <span className="related-go mono">
                    /npm-packages/{p.slug} <Arrow />
                  </span>
                </a>
              </li>
            ))}
            <li>
              <a href={PACKAGES_URL} className="related-all">
                <span className="related-title">All npm packages</span>
                <span className="related-tag">Every React package we publish, with live previews.</span>
                <span className="related-go mono">
                  browse all <Arrow />
                </span>
              </a>
            </li>
          </ul>
        </section>

        <section className="section wrap" id="faq">
          <SectionHead k="Q" eyebrow="faq" title="Questions, answered." />
          <div className="faq">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>
                  <span>{q}</span>
                  <span className="mono plus" aria-hidden="true" />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="cta wrap">
          <h2>
            Ship a review experience <em>your developers will love.</em>
          </h2>
          <InstallBox large />
          <div className="hero-ctas">
            <a className="btn btn-primary btn-lg" href={`${NPM_URL}#readme`} target="_blank" rel="noreferrer">
              read the docs <Arrow />
            </a>
            <a className="btn btn-lg" href="#playground">
              open the playground
            </a>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap footer-cols">
          <div className="footer-brand">
            <a className="brand" href="#top">
              <Logo />
              <span>{PKG.name}</span>
            </a>
            <p>A code and data diff viewer for React, on a comparison engine you can use without the UI.</p>
          </div>
          <div>
            <p className="mono">package</p>
            <a href={NPM_URL}>npm</a>
            <a href={`${NPM_URL}#readme`}>readme</a>
            <a href={PKG.repository}>github</a>
            <a href="#api">api reference</a>
            <a href="#faq">faq</a>
          </div>
          <div>
            <p className="mono">packages</p>
            {RELATED.map((p) => (
              <a key={p.slug} href={p.url}>
                {p.title}
              </a>
            ))}
            <a href={PACKAGES_URL}>All packages</a>
          </div>
          <div>
            <p className="mono">m2toolkit</p>
            <a href={M2TOOLKIT}>Home</a>
            <a href={`${M2TOOLKIT}/tools`}>Free tools</a>
            <a href={`${M2TOOLKIT}/about`}>About</a>
          </div>
        </div>
        <div className="wrap footer-base mono">
          <span>
            {PKG.name} v{PKG.version} · {PKG.license} license
          </span>
          <span>
            hosted on <a href={PACKAGES_URL}>m2toolkit.com/npm-packages</a>
          </span>
        </div>
      </footer>
    </>
  );
}
