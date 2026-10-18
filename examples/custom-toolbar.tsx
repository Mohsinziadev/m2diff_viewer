import { useRef, useState, type CSSProperties } from 'react';
import { DiffStats, DiffViewer, type DiffResult, type DiffViewerHandle } from 'm2diff-viewer';
import 'm2diff-viewer/styles.css';

// A minimal, read-only viewer driven by your own controls through the imperative handle.
export function ReviewPanel({ before, after }: { before: string; after: string }) {
  const viewer = useRef<DiffViewerHandle>(null);
  const [result, setResult] = useState<DiffResult | null>(null);
  return (
    <section>
      <header style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {result && <DiffStats result={result} />}
        <button onClick={() => viewer.current?.previousChange()}>Previous</button>
        <button onClick={() => viewer.current?.nextChange()}>Next</button>
        <button onClick={() => viewer.current?.openSearch()}>Find</button>
        <button onClick={() => navigator.clipboard.writeText(viewer.current?.getUnifiedPatch() ?? '')}>Copy patch</button>
      </header>
      <DiffViewer
        ref={viewer}
        original={before}
        modified={after}
        toolbar={false}
        statusBar={false}
        defaultView="inline"
        height={360}
        onDiff={setResult}
        classNames={{ root: 'my-diff' }}
        style={{ '--m2d-accent': '#7c3aed' } as CSSProperties}
      />
    </section>
  );
}
