import { useMemo } from 'react';
import { DiffViewer } from 'm2diff-viewer';
import { createHighlightJsAdapter } from 'm2diff-viewer/highlight-js';
import 'm2diff-viewer/styles.css';

// One adapter for the whole app: grammars are loaded on first use, from your own bundle.
const highlighter = createHighlightJsAdapter();

export function HighlightedDiff({ before, after, fileName }: { before: string; after: string; fileName: string }) {
  // The language is inferred from the file name; pass `language="rust"` (or `"auto"`) to override it.
  const options = useMemo(() => ({ ignoreWhitespace: 'trim' as const }), []);
  return <DiffViewer original={before} modified={after} modifiedName={fileName} highlighter={highlighter} defaultOptions={options} />;
}
