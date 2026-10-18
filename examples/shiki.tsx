'use client';
import { useEffect, useState } from 'react';
import { createHighlighter } from 'shiki';
import { DiffViewer, type SyntaxHighlighter } from 'm2diff-viewer';
import { createShikiAdapter } from 'm2diff-viewer/shiki';
import 'm2diff-viewer/styles.css';

// Shiki gives VS Code-accurate colours. Create the highlighter once; languages load on demand.
let shared: Promise<SyntaxHighlighter> | undefined;
function getHighlighter() {
  shared ??= createHighlighter({ themes: ['github-light', 'github-dark'], langs: [] }).then((h) =>
    createShikiAdapter(h, { themes: { light: 'github-light', dark: 'github-dark' } }),
  );
  return shared;
}

export function ShikiDiff({ before, after }: { before: string; after: string }) {
  const [highlighter, setHighlighter] = useState<SyntaxHighlighter | null>(null);
  useEffect(() => {
    getHighlighter().then(setHighlighter);
  }, []);
  // Until the highlighter is ready the diff renders as plain text — nothing blocks.
  return <DiffViewer original={before} modified={after} language="svelte" highlighter={highlighter} theme="auto" />;
}
