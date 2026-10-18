import { useEffect, useMemo } from 'react';
import { DiffViewer } from 'm2diff-viewer';
import { createWorkerDiffer } from 'm2diff-viewer/core';
import 'm2diff-viewer/styles.css';

// For multi-megabyte inputs: the UI stays responsive, and superseded comparisons are cancelled
// (the worker is terminated and replaced).
export function LargeFileDiff({ before, after }: { before: string; after: string }) {
  const differ = useMemo(() => createWorkerDiffer(() => new Worker(new URL('./diff.worker.ts', import.meta.url), { type: 'module' })), []);
  useEffect(() => () => differ.dispose(), [differ]);
  return <DiffViewer original={before} modified={after} differ={differ} height="80vh" />;
}
