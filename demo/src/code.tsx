import type { ReactNode } from 'react';

/** The snippets shown on the page. Each mirrors a README example or a file in examples/. */
export const FILES = [
  {
    path: 'src/App.tsx',
    label: 'drop in the viewer',
    code: `import { DiffViewer } from 'm2diff-viewer';
import 'm2diff-viewer/styles.css';

export default function Review({ oldCode, newCode }: Props) {
  return (
    <DiffViewer
      original={oldCode}
      modified={newCode}
      originalName="src/cart.ts"
      modifiedName="src/cart.ts"
      defaultView="split"
      collapseUnchanged
      contextLines={3}
    />
  );
}`,
  },
  {
    path: 'src/highlighting.tsx',
    label: 'syntax highlighting',
    code: `import { DiffViewer } from 'm2diff-viewer';
import { createHighlightJsAdapter } from 'm2diff-viewer/highlight-js';

// Create once. Grammars load the first time a language is shown.
const highlighter = createHighlightJsAdapter();

export function Review({ a, b }: { a: string; b: string }) {
  return <DiffViewer original={a} modified={b} modifiedName="main.rs" highlighter={highlighter} />;
}`,
  },
  {
    path: 'src/merge.tsx',
    label: 'merge with » « arrows',
    code: `import { useState } from 'react';
import { DiffViewer } from 'm2diff-viewer';

export function Merge({ base, incoming }: { base: string; incoming: string }) {
  const [left, setLeft] = useState(base);
  const [right, setRight] = useState(incoming);
  return (
    <DiffViewer
      original={left}
      modified={right}
      // » copies a change to the right, « to the left
      onApplyChange={(e) => (e.target === 'original' ? setLeft(e.text) : setRight(e.text))}
      syncHash // #L12 / #R10-R20 links select and reveal lines
    />
  );
}`,
  },
  {
    path: 'src/api-check.tsx',
    label: 'json & csv',
    code: `import { CsvDiffViewer, JsonDiffViewer } from 'm2diff-viewer';

<JsonDiffViewer
  original={before}
  modified={after}
  ignorePaths={['**.requestId', 'meta.timestamp']}
  arrayKeys={{ items: 'sku' }}
/>;

<CsvDiffViewer original={oldCsv} modified={newCsv} keyColumns={['sku']} />;`,
  },
  {
    path: 'app/review/page.tsx',
    label: 'next.js app router',
    code: `// app/review/page.tsx (a Server Component)
import { DiffViewer } from 'm2diff-viewer';
import 'm2diff-viewer/styles.css';

export default async function Page() {
  const [a, b] = await Promise.all([load('v1'), load('v2')]);
  return <DiffViewer original={a} modified={b} height="80vh" />;
}`,
  },
  {
    path: 'scripts/report.ts',
    label: 'engine, no react',
    code: `import { computeDiff, createUnifiedPatch, diffJson } from 'm2diff-viewer/core';

const result = computeDiff(oldText, newText, { ignoreWhitespace: 'trim', intraline: 'word' });
result.stats;   // { additions, deletions, changes, modifiedLines, ... }
result.changes; // [{ kind, oldStart, oldCount, newStart, newCount }, ...]

const patch = createUnifiedPatch(result, { oldName: 'a/cart.ts', newName: 'b/cart.ts' });

const json = diffJson(before, after, { ignorePaths: ['$.ts'] });
json.structure?.changes.map((c) => \`\${c.kind} \${c.pathString}\`);`,
  },
] as const;

const TOKENS =
  /(?<comment>\/\/[^\n]*)|(?<string>'[^'\n]*'|"[^"\n]*"|`[^`]*`)|(?<tag><\/?[A-Za-z][\w.]*)|(?<keyword>\b(?:import|from|export|default|function|const|async|await|return|try|catch|if|interface|type|new)\b)|(?<attr>\b[a-zA-Z]+(?==))|(?<number>\b\d[\d_]*\b)/g;

/** A tiny, deterministic TSX highlighter (same output on the server and in the browser). */
export function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of code.matchAll(TOKENS)) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const kind = Object.entries(m.groups ?? {}).find(([, v]) => v !== undefined)?.[0] ?? 'plain';
    if (kind === 'tag') {
      const slash = m[0].startsWith('</') ? 2 : 1;
      out.push(
        m[0].slice(0, slash),
        <span key={i++} className="tok-tag">
          {m[0].slice(slash)}
        </span>,
      );
    } else
      out.push(
        <span key={i++} className={`tok-${kind}`}>
          {m[0]}
        </span>,
      );
    last = m.index + m[0].length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}
