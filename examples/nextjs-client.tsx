'use client';
// Next.js App Router: the viewers are client components. Render them from a client component like this
// one (functions such as `highlighter` cannot be passed from a Server Component); plain string props can
// be passed from the server, and the initial markup is server-rendered.
import { DiffViewer } from 'm2diff-viewer';
import { createHighlightJsAdapter } from 'm2diff-viewer/highlight-js';

const highlighter = createHighlightJsAdapter();

export default function PullRequestFile({ path, before, after }: { path: string; before: string; after: string }) {
  return <DiffViewer original={before} modified={after} originalName={path} modifiedName={path} highlighter={highlighter} theme="auto" />;
}
// In app/layout.tsx: import 'm2diff-viewer/styles.css';
