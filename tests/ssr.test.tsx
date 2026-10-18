// @vitest-environment node
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('server rendering', () => {
  it('imports without browser globals', async () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    const core = await import('../src/core');
    expect(core.computeDiff('a', 'b').changes).toHaveLength(1);
    await import('../src/react');
    await import('../src/highlight-js');
    await import('../src/shiki');
  });

  it('renders complete markup for the viewers', async () => {
    const { DiffViewer, JsonDiffViewer, CsvDiffViewer, DiffStats, computeDiff } = await import('../src/react');
    const html = renderToString(
      createElement(DiffViewer, {
        original: 'header\nconst value = 1;\n',
        modified: 'header\nconst value = 2;\n',
        originalName: 'x.ts',
        modifiedName: 'x.ts',
      }),
    );
    expect(html).toContain('m2d-pane-old');
    expect(html).toContain('1 difference');
    expect(html).toMatch(/class="m2d-row m2d-modified m2d-mod-new".*?<span class="m2d-chg">2<\/span>/);

    expect(renderToString(createElement(DiffViewer, { original: 'a', modified: 'b', defaultView: 'inline' }))).toContain('m2d-pane-inline');
    expect(renderToString(createElement(DiffViewer, { original: 'a', modified: 'b', defaultView: 'unified' }))).toContain('@@ -1 +1 @@');
    expect(renderToString(createElement(JsonDiffViewer, { original: '{"a":1}', modified: '{"a":2}' }))).toContain('data-path="$.a"');
    expect(renderToString(createElement(CsvDiffViewer, { original: 'id,v\n1,a\n', modified: 'id,v\n1,b\n' }))).toContain(
      'm2d-cell-changed',
    );
    expect(renderToString(createElement(DiffStats, { result: computeDiff('a', 'b') }))).toContain('+1');
  });

  it('renders highlighted markup when the grammar is already loaded', async () => {
    const { DiffViewer } = await import('../src/react');
    const { createHighlightJsAdapter } = await import('../src/highlight-js');
    const hl = createHighlightJsAdapter();
    await hl.load('typescript');
    const html = renderToString(
      createElement(DiffViewer, { original: 'const a = 1;\n', modified: 'const a = 2;\n', language: 'typescript', highlighter: hl }),
    );
    expect(html).toContain('hljs-keyword');
  });
});
