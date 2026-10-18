import { useMemo, useState } from 'react';
import { CsvDiffViewer, DiffStats, DiffViewer, JsonDiffViewer, type DiffResult, type ThemeSetting } from 'm2diff-viewer';
import { createHighlightJsAdapter } from 'm2diff-viewer/highlight-js';
import { CODE_SAMPLES, CSV_SAMPLE, JSON_SAMPLE, largeSample, type CodeSample } from './samples';

// Grammars load lazily (one chunk per language) from this app's own bundle.
const highlighter = createHighlightJsAdapter();

type Tab = 'code' | 'json' | 'csv';

export function App() {
  const [tab, setTab] = useState<Tab>('code');
  const [theme, setTheme] = useState<ThemeSetting>('auto');
  return (
    <div className="demo" data-theme={theme}>
      <header className="demo-header">
        <div className="demo-brand">
          <span className="demo-logo" aria-hidden="true">
            <span />
            <span />
          </span>
          <span>
            <strong>m2diff-viewer</strong>
            <span className="demo-tagline">Code &amp; data diffs for React</span>
          </span>
        </div>
        <nav className="demo-tabs" aria-label="Demo">
          {(['code', 'json', 'csv'] as const).map((t) => (
            <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t === 'code' ? 'Code' : t.toUpperCase()}
            </button>
          ))}
        </nav>
        <label className="demo-theme">
          <span>Theme</span>
          <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeSetting)}>
            <option value="auto">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </header>
      <main className="demo-main">
        {tab === 'code' && <CodeDemo theme={theme} />}
        {tab === 'json' && <JsonDemo theme={theme} />}
        {tab === 'csv' && <CsvDemo theme={theme} />}
      </main>
      <footer className="demo-footer">Everything on this page runs in your browser — no content is uploaded anywhere.</footer>
    </div>
  );
}

function Inputs({
  original,
  modified,
  onOriginal,
  onModified,
}: {
  original: string;
  modified: string;
  onOriginal: (v: string) => void;
  onModified: (v: string) => void;
}) {
  return (
    <details className="demo-inputs">
      <summary>Edit inputs</summary>
      <div className="demo-inputs-grid">
        <label>
          <span>Original</span>
          <textarea value={original} onChange={(e) => onOriginal(e.target.value)} spellCheck={false} />
        </label>
        <label>
          <span>Modified</span>
          <textarea value={modified} onChange={(e) => onModified(e.target.value)} spellCheck={false} />
        </label>
      </div>
    </details>
  );
}

function CodeDemo({ theme }: { theme: ThemeSetting }) {
  const [sample, setSample] = useState<CodeSample>(CODE_SAMPLES[0]);
  const [original, setOriginal] = useState(sample.original);
  const [modified, setModified] = useState(sample.modified);
  const [language, setLanguage] = useState(sample.language);
  const [result, setResult] = useState<DiffResult | null>(null);

  const pick = (s: CodeSample) => {
    setSample(s);
    setOriginal(s.original);
    setModified(s.modified);
    setLanguage(s.language);
  };

  return (
    <section className="demo-section" aria-label="Code comparison">
      <div className="demo-controls">
        <label>
          <span>Sample</span>
          <select
            value={sample.id}
            onChange={(e) => {
              const id = e.target.value;
              pick(id.startsWith('large') ? largeSample(Number(id.slice(6))) : CODE_SAMPLES.find((s) => s.id === id)!);
            }}
          >
            {CODE_SAMPLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
            <option value="large-20000">Large file (20,000 lines)</option>
            <option value="large-100000">Large file (100,000 lines)</option>
          </select>
        </label>
        {result && <DiffStats result={result} />}
        <span className="demo-hint">
          Press <kbd>Ctrl/⌘</kbd>+<kbd>K</kbd> for commands, <kbd>F7</kbd> / <kbd>Shift</kbd>+<kbd>F7</kbd> to move between differences, and
          click line numbers to link to lines.
        </span>
      </div>
      <Inputs original={original} modified={modified} onOriginal={setOriginal} onModified={setModified} />
      <DiffViewer
        key={sample.id}
        original={original}
        modified={modified}
        originalName={sample.originalName}
        modifiedName={sample.modifiedName}
        language={language}
        onLanguageChange={setLanguage}
        highlighter={highlighter}
        theme={theme}
        height="min(72vh, 760px)"
        onDiff={setResult}
        onApplyChange={(e) => (e.target === 'original' ? setOriginal(e.text) : setModified(e.text))}
        syncHash
      />
    </section>
  );
}

function JsonDemo({ theme }: { theme: ThemeSetting }) {
  const [original, setOriginal] = useState(JSON_SAMPLE.original);
  const [modified, setModified] = useState(JSON_SAMPLE.modified);
  const [ignore, setIgnore] = useState('metadata.updatedAt, request.*');
  const [arrays, setArrays] = useState<'ordered' | 'unordered' | 'keyed'>('keyed');
  const ignorePaths = useMemo(
    () =>
      ignore
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [ignore],
  );
  return (
    <section className="demo-section" aria-label="JSON comparison">
      <div className="demo-controls">
        <label className="demo-grow">
          <span>Ignore paths</span>
          <input
            value={ignore}
            onChange={(e) => setIgnore(e.target.value)}
            placeholder="e.g. metadata.updatedAt, users[*].lastSeen, **.etag"
            spellCheck={false}
          />
        </label>
        <label>
          <span>Arrays</span>
          <select value={arrays} onChange={(e) => setArrays(e.target.value as typeof arrays)}>
            <option value="keyed">Match items by "sku"</option>
            <option value="ordered">Order matters</option>
            <option value="unordered">Ignore order</option>
          </select>
        </label>
      </div>
      <Inputs original={original} modified={modified} onOriginal={setOriginal} onModified={setModified} />
      <JsonDiffViewer
        original={original}
        modified={modified}
        originalName="order-v3.json"
        modifiedName="order-v4.json"
        ignorePaths={ignorePaths}
        arrays={arrays === 'unordered' ? 'unordered' : 'ordered'}
        arrayKeys={arrays === 'keyed' ? { items: 'sku' } : undefined}
        theme={theme}
        height="min(72vh, 760px)"
        textViewProps={{ highlighter }}
      />
    </section>
  );
}

function CsvDemo({ theme }: { theme: ThemeSetting }) {
  const [original, setOriginal] = useState(CSV_SAMPLE.original);
  const [modified, setModified] = useState(CSV_SAMPLE.modified);
  return (
    <section className="demo-section" aria-label="CSV comparison">
      <Inputs original={original} modified={modified} onOriginal={setOriginal} onModified={setModified} />
      <CsvDiffViewer original={original} modified={modified} keyColumns={['sku']} theme={theme} height="min(60vh, 560px)" />
    </section>
  );
}
