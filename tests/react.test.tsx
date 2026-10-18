import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  CsvDiffViewer,
  DiffStats,
  DiffViewer,
  JsonDiffViewer,
  computeDiff,
  type DiffViewerHandle,
  type SyntaxHighlighter,
} from '../src/react';
import { createHighlightJsAdapter } from '../src/highlight-js';

const lines = (n: number, f = (i: number) => `line ${i + 1}`) => Array.from({ length: n }, (_, i) => f(i)).join('\n') + '\n';

const OLD = `function greet(name) {
  return "Hello, " + name;
}

const unused = 1;
export default greet;
`;
const NEW = `// greeting helper
function greet(name, punctuation = "!") {
  return "Hello, " + name + punctuation;
}

export default greet;
`;

async function expectNoAxeViolations(container: HTMLElement) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

const rowsOf = (container: HTMLElement, pane: string) => [...container.querySelectorAll(`${pane} .m2d-row`)] as HTMLElement[];

describe('<DiffViewer> split view', () => {
  it('renders aligned rows with line numbers, signs and change classes', () => {
    const { container } = render(<DiffViewer original={OLD} modified={NEW} collapseUnchanged={false} />);
    const left = rowsOf(container, '.m2d-pane-old');
    const right = rowsOf(container, '.m2d-pane-new');
    expect(left).toHaveLength(right.length);
    // First row: an insertion on the right, filler on the left.
    expect(left[0]).toHaveClass('m2d-filler');
    expect(right[0]).toHaveClass('m2d-added');
    expect(right[0].querySelector('.m2d-gutter')).toHaveAttribute('data-sign', '+');
    // Edited signature line is paired with word-level highlights.
    expect(left[1]).toHaveClass('m2d-modified');
    expect(left[1].querySelector('.m2d-gutter')).toHaveAttribute('data-n', '1');
    expect(right[1].querySelector('.m2d-gutter')).toHaveAttribute('data-n', '2');
    expect(right[1].querySelectorAll('.m2d-chg').length).toBeGreaterThan(0);
    // Removed line.
    const removed = left.find((r) => r.textContent?.includes('const unused'));
    expect(removed).toHaveClass('m2d-removed');
    expect(removed?.querySelector('.m2d-sr-only')).toHaveTextContent('Removed:');
  });

  it('shows statistics taken from the comparison result', () => {
    const result = computeDiff(OLD, NEW);
    const { container } = render(<DiffViewer original={OLD} modified={NEW} />);
    const status = container.querySelector('.m2d-status')!;
    expect(status).toHaveTextContent(`+${result.stats.additions}`);
    expect(status).toHaveTextContent(`−${result.stats.deletions}`);
    expect(screen.getByRole('toolbar')).toHaveTextContent(`${result.changes.length} differences`);
  });

  it('reports identical input and missing files', () => {
    const { rerender, container } = render(<DiffViewer original="same\n" modified="same\n" />);
    expect(screen.getByRole('toolbar')).toHaveTextContent('No differences');
    rerender(<DiffViewer original={null} modified={'new file\n'} modifiedName="new.txt" />);
    expect(container.querySelector('.m2d-header')).toHaveTextContent('(does not exist)');
    expect(container.querySelector('.m2d-pane-new .m2d-added')).toHaveTextContent('new file');
  });
});

describe('<DiffViewer> change connectors', () => {
  it('draws a band and both arrows for every change', () => {
    const { container } = render(<DiffViewer original={OLD} modified={NEW} collapseUnchanged={false} />);
    const changes = computeDiff(OLD, NEW).changes;
    expect(container.querySelectorAll('.m2d-links-svg g')).toHaveLength(changes.length);
    expect(container.querySelectorAll('span.m2d-arrow-old')).toHaveLength(changes.length);
    expect(container.querySelectorAll('span.m2d-arrow-new')).toHaveLength(changes.length);
    // Decorative only without a handler.
    expect(container.querySelector('button.m2d-arrow')).toBeNull();
  });

  it('can be turned off', () => {
    const { container } = render(<DiffViewer original={OLD} modified={NEW} connectors={false} />);
    expect(container.querySelector('.m2d-links')).toBeNull();
    expect(screen.getByRole('separator', { name: 'Resize panes' })).toBeInTheDocument();
  });

  it('links a hovered block across both panes and its band', () => {
    const { container } = render(<DiffViewer original={'a\nb\nc\n'} modified={'a\nB\nc\nd\n'} collapseUnchanged={false} />);
    const [left] = rowsOf(container, '.m2d-pane-old').filter((r) => r.dataset.change === '0');
    fireEvent.mouseOver(left);
    const linked = [...container.querySelectorAll('.m2d-linked')];
    expect(linked.map((r) => r.closest('.m2d-pane')?.classList.contains('m2d-pane-old'))).toEqual([true, false]);
    expect(linked.every((r) => r.classList.contains('m2d-linked-start') && r.classList.contains('m2d-linked-end'))).toBe(true);
    expect(container.querySelector('g[data-change="0"]')).toHaveClass('m2d-link-hover');
    expect(container.querySelector('g[data-change="1"]')).not.toHaveClass('m2d-link-hover');
    fireEvent.mouseLeave(container.querySelector('.m2d-split')!);
    expect(container.querySelector('.m2d-linked')).toBeNull();
  });

  it('selects and flashes a change when its band is clicked', () => {
    const onNavigate = vi.fn();
    const { container } = render(
      <DiffViewer original={'a\nb\nc\n'} modified={'a\nB\nc\nd\n'} collapseUnchanged={false} onNavigate={onNavigate} />,
    );
    const band = container.querySelector('g[data-change="1"] .m2d-link-fill')!;
    fireEvent.pointerDown(band, { button: 0, clientX: 10 });
    fireEvent.pointerUp(window, { clientX: 10 });
    expect(onNavigate).toHaveBeenLastCalledWith(expect.objectContaining({ changeIndex: 1 }));
    expect(container.querySelector('.m2d-pane-new [data-change="1"]')).toHaveClass('m2d-current', 'm2d-flash');
    expect(container.querySelector('g[data-change="1"]')).toHaveClass('m2d-link-current', 'm2d-link-flash');
  });

  it('applies a change in either direction through onApplyChange', async () => {
    const onApplyChange = vi.fn();
    const { container } = render(
      <DiffViewer original={'a\nb\nc\n'} modified={'a\nB\nc\n'} collapseUnchanged={false} onApplyChange={onApplyChange} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /replace modified line 2 with original line 2/ }));
    expect(onApplyChange).toHaveBeenLastCalledWith(expect.objectContaining({ changeIndex: 0, target: 'modified', text: 'a\nb\nc\n' }));
    await userEvent.click(screen.getByRole('button', { name: /replace original line 2 with modified line 2/ }));
    expect(onApplyChange).toHaveBeenLastCalledWith(expect.objectContaining({ changeIndex: 0, target: 'original', text: 'a\nB\nc\n' }));
    await expectNoAxeViolations(container);
  });
});

describe('<DiffViewer> inline and unified views', () => {
  it('lists removed lines before added lines in inline view', () => {
    const { container } = render(
      <DiffViewer original={'a\nb\nc\n'} modified={'a\nB\nc\n'} defaultView="inline" collapseUnchanged={false} />,
    );
    const rows = rowsOf(container, '.m2d-pane-inline');
    expect(rows.map((r) => r.className.match(/m2d-(equal|removed|added)/)?.[1])).toEqual(['equal', 'removed', 'added', 'equal']);
    const gutter = rows[1].querySelector('.m2d-gutter')!;
    expect(gutter).toHaveAttribute('data-n', '2');
    expect(gutter).not.toHaveAttribute('data-n2');
  });

  it('renders the unified patch', () => {
    const { container } = render(
      <DiffViewer original={'a\nb\n'} modified={'a\nc\n'} originalName="a/x.txt" modifiedName="b/x.txt" defaultView="unified" />,
    );
    const text = [...container.querySelectorAll('.m2d-patch-line')].map((r) => r.textContent);
    expect(text).toEqual(['--- a/x.txt', '+++ b/x.txt', '@@ -1,2 +1,2 @@', ' a', '-b', '+c']);
  });

  it('switches view from the toolbar when uncontrolled and hides the switch when controlled read-only', async () => {
    const user = userEvent.setup();
    const onViewChange = vi.fn();
    const { container, rerender } = render(<DiffViewer original="a\n" modified="b\n" onViewChange={onViewChange} />);
    await user.selectOptions(screen.getByLabelText('View mode'), 'inline');
    expect(onViewChange).toHaveBeenCalledWith('inline');
    expect(container.querySelector('.m2d-pane-inline')).toBeInTheDocument();
    rerender(<DiffViewer original="a\n" modified="b\n" view="split" />);
    expect(screen.queryByLabelText('View mode')).not.toBeInTheDocument();
  });
});

describe('<DiffViewer> folding', () => {
  const a = lines(100);
  const b = a.replace('line 50\n', 'line fifty\n');

  it('collapses unchanged regions and expands them from an accessible button', async () => {
    const user = userEvent.setup();
    const { container } = render(<DiffViewer original={a} modified={b} contextLines={2} virtualize={false} />);
    const buttons = screen.getAllByRole('button', { name: /^Expand \d+ unchanged lines/ });
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAccessibleName('Expand 47 unchanged lines (lines 1–47)');
    expect(rowsOf(container, '.m2d-pane-old').filter((r) => !r.classList.contains('m2d-fold'))).toHaveLength(5);
    buttons[0].focus();
    await user.keyboard('{Enter}');
    expect(rowsOf(container, '.m2d-pane-old').filter((r) => !r.classList.contains('m2d-fold'))).toHaveLength(52);
  });

  it('can be disabled and never hides changed lines', () => {
    const { container } = render(<DiffViewer original={a} modified={b} collapseUnchanged={false} virtualize={false} />);
    expect(container.querySelectorAll('.m2d-fold')).toHaveLength(0);
    expect(container.querySelector('.m2d-pane-new .m2d-modified')).toHaveTextContent('line fifty');
  });

  it('expands and collapses all from the toolbar', async () => {
    const user = userEvent.setup();
    const { container } = render(<DiffViewer original={a} modified={b} virtualize={false} />);
    await user.click(screen.getByRole('button', { name: 'Expand all unchanged lines' }));
    expect(container.querySelectorAll('.m2d-fold')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Collapse unchanged lines' }));
    expect(container.querySelectorAll('.m2d-pane-old .m2d-fold')).toHaveLength(2);
  });
});

describe('<DiffViewer> navigation and keyboard', () => {
  const a = lines(60);
  const b = a.replace('line 5\n', 'line five\n').replace('line 30\n', '').replace('line 55\n', 'line 55\nextra\n');

  it('moves between differences with buttons and announces them', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const { container } = render(<DiffViewer original={a} modified={b} onNavigate={onNavigate} virtualize={false} />);
    await user.click(screen.getByRole('button', { name: /Next difference/ }));
    expect(onNavigate).toHaveBeenLastCalledWith(expect.objectContaining({ changeIndex: 0 }));
    expect(screen.getByRole('status')).toHaveTextContent('Difference 1 of 3: lines 5–5 changed');
    expect(container.querySelectorAll('.m2d-pane-old .m2d-current').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /Next difference/ }));
    expect(screen.getByRole('status')).toHaveTextContent('Difference 2 of 3: 1 removed line at line 30');
  });

  it('supports F7 / Shift+F7 and custom bindings while focus is inside', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const { container, rerender } = render(<DiffViewer original={a} modified={b} onNavigate={onNavigate} virtualize={false} />);
    (container.querySelector('.m2d-pane-old') as HTMLElement).focus();
    await user.keyboard('{F7}{F7}{Shift>}{F7}{/Shift}');
    expect(onNavigate.mock.calls.map((c) => c[0].changeIndex)).toEqual([0, 1, 0]);
    rerender(<DiffViewer original={a} modified={b} onNavigate={onNavigate} keyBindings={{ nextChange: ['n'] }} virtualize={false} />);
    (container.querySelector('.m2d-pane-old') as HTMLElement).focus();
    await user.keyboard('n');
    expect(onNavigate).toHaveBeenLastCalledWith(expect.objectContaining({ changeIndex: 1 }));
  });

  it('exposes an imperative handle', () => {
    const ref = createRef<DiffViewerHandle>();
    render(<DiffViewer ref={ref} original={a} modified={b} toolbar={false} statusBar={false} />);
    expect(ref.current!.result!.changes).toHaveLength(3);
    expect(ref.current!.getUnifiedPatch()).toContain('@@ -2,7 +2,7 @@');
    expect(ref.current!.getReport()!.stats.changes).toBe(3);
    act(() => ref.current!.goToChange(2));
    expect(screen.getByRole('status')).toHaveTextContent('Difference 3 of 3');
  });

  it('renders a minimal viewer without chrome', () => {
    const { container } = render(
      <DiffViewer original="a\n" modified="b\n" toolbar={false} statusBar={false} renderHeader={() => null} overview={false} />,
    );
    expect(container.querySelector('.m2d-toolbar, .m2d-status, .m2d-header, .m2d-overview')).toBeNull();
  });
});

describe('<DiffViewer> search', () => {
  it('opens with Mod+F, finds matches on both sides and steps through them', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DiffViewer original={'alpha beta\nzeta\n'} modified={'alpha BETA\nzeta beta\n'} collapseUnchanged={false} />,
    );
    (container.querySelector('.m2d-pane-old') as HTMLElement).focus();
    await user.keyboard('{Control>}f{/Control}');
    const input = await screen.findByRole('searchbox', { name: 'Search text' });
    await waitFor(() => expect(input).toHaveFocus());
    await user.type(input, 'beta');
    expect(container.querySelector('.m2d-search-count')).toHaveTextContent('1 of 3');
    expect(container.querySelectorAll('.m2d-match')).toHaveLength(3);
    expect(container.querySelectorAll('.m2d-match-active')).toHaveLength(1);
    await user.keyboard('{Enter}');
    expect(container.querySelector('.m2d-search-count')).toHaveTextContent('2 of 3');
    await user.click(screen.getByRole('button', { name: 'Match case' }));
    expect(container.querySelector('.m2d-search-count')).toHaveTextContent('1 of 2');
    await user.selectOptions(screen.getByLabelText('Search in'), 'original');
    expect(container.querySelector('.m2d-search-count')).toHaveTextContent('1 of 1');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('reports invalid regular expressions', async () => {
    const user = userEvent.setup();
    const { container } = render(<DiffViewer original="a\n" modified="b\n" />);
    await user.click(screen.getByRole('button', { name: /^Search/ }));
    await user.click(screen.getByRole('button', { name: 'Use regular expression' }));
    await user.type(screen.getByRole('searchbox'), '(');
    expect(container.querySelector('.m2d-search-count')).toHaveTextContent('Invalid pattern');
  });

  it('expands a fold to reveal a match inside it', async () => {
    const user = userEvent.setup();
    const a = lines(100);
    const b = a.replace('line 90\n', 'line ninety\n');
    const { container } = render(<DiffViewer original={a} modified={b} virtualize={false} />);
    await user.click(screen.getByRole('button', { name: /^Search/ }));
    await user.type(screen.getByRole('searchbox'), 'line 10');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(container.querySelector('.m2d-match-active')).toBeInTheDocument());
  });
});

describe('<DiffViewer> options', () => {
  it('ignores whitespace from the toolbar and reports the outcome', async () => {
    const user = userEvent.setup();
    const onOptionsChange = vi.fn();
    render(<DiffViewer original={'a  b\n'} modified={'a b\n'} onOptionsChange={onOptionsChange} />);
    expect(screen.getByRole('toolbar')).toHaveTextContent('1 difference');
    await user.selectOptions(screen.getByLabelText('Whitespace'), 'collapse');
    expect(onOptionsChange).toHaveBeenCalledWith({ ignoreWhitespace: 'collapse' });
    expect(screen.getByRole('toolbar')).toHaveTextContent('Only ignored differences');
  });

  it('offers case and line-ending settings in an accessible popover', async () => {
    const user = userEvent.setup();
    render(<DiffViewer original={'A\r\n'} modified={'a\n'} />);
    const trigger = screen.getByRole('button', { name: 'Comparison settings' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Comparison settings' });
    await user.click(within(dialog).getByLabelText('Ignore case'));
    expect(screen.getByRole('toolbar')).toHaveTextContent('Only ignored differences');
    await user.selectOptions(within(dialog).getByLabelText('Line endings'), 'preserve');
    expect(screen.getByRole('toolbar')).toHaveTextContent('1 difference');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe('<DiffViewer> export', () => {
  it('copies the unified diff to the clipboard', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<DiffViewer original={'a\n'} modified={'b\n'} />);
    await user.click(screen.getByRole('button', { name: 'Copy and export' }));
    await user.click(screen.getByRole('button', { name: 'Copy unified diff' }));
    expect(writeText).toHaveBeenCalledWith('--- original\n+++ modified\n@@ -1 +1 @@\n-a\n+b\n');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Copied unified diff'));
  });

  it('downloads patches and reports locally, and lets onExport take over', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const onExport = vi.fn((e: { action: string }) => (e.action === 'download-report' ? false : undefined));
    render(<DiffViewer original={'a\n'} modified={'b\n'} modifiedName="src/app.ts" onExport={onExport} />);
    await user.click(screen.getByRole('button', { name: 'Copy and export' }));
    await user.click(screen.getByRole('button', { name: 'Download .patch' }));
    expect(onExport).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'download-patch', filename: 'app.patch' }));
    expect(click).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Copy and export' }));
    await user.click(screen.getByRole('button', { name: 'Export statistics (JSON)' }));
    const event = onExport.mock.calls.at(-1)![0] as unknown as { content: string };
    expect(JSON.parse(event.content)).toMatchObject({ format: 'm2diff-report', stats: { changes: 1 } });
    expect(click).toHaveBeenCalledTimes(1); // prevented by onExport
  });
});

describe('<DiffViewer> syntax highlighting', () => {
  const fake: SyntaxHighlighter = {
    name: 'fake',
    resolve: (l) => (l === 'typescript' ? 'ts' : null),
    isLoaded: () => true,
    load: async () => {},
    tokenize: (code) =>
      code.split('\n').map((line) =>
        line
          .split(/(\bconst\b)/)
          .filter(Boolean)
          .map((text) => (text === 'const' ? { text, className: 'hljs-keyword' } : { text })),
      ),
  };

  it('merges syntax tokens with word-level change highlights without altering text', () => {
    const { container } = render(<DiffViewer original={'const a = 1;\n'} modified={'const a = 2;\n'} language="ts" highlighter={fake} />);
    const row = container.querySelector('.m2d-pane-new .m2d-modified')!;
    expect(row.querySelector('.hljs-keyword')).toHaveTextContent('const');
    expect(row.querySelector('.m2d-chg')).toHaveTextContent('2');
    expect(row.querySelector('.m2d-code')!.textContent).toBe('Modified: const a = 2;');
  });

  it('falls back to plain text for unsupported languages', () => {
    const { container } = render(<DiffViewer original={'const a\n'} modified={'const b\n'} language="cobol" highlighter={fake} />);
    expect(container.querySelector('.hljs-keyword')).toBeNull();
    expect(container.querySelector('.m2d-status')).toHaveTextContent('cobol');
  });

  it('lazily loads a highlight.js grammar and infers the language from the file name', async () => {
    const hl = createHighlightJsAdapter();
    const { container } = render(
      <DiffViewer original={'const x: number = 1;\n'} modified={'const x: number = 2;\n'} modifiedName="src/x.ts" highlighter={hl} />,
    );
    expect(container.querySelector('.hljs-keyword')).toBeNull();
    await waitFor(() => expect(container.querySelector('.m2d-pane-new .hljs-keyword')).toHaveTextContent('const'));
    expect(container.querySelector('.m2d-status')).toHaveTextContent('TypeScript');
  });
});

describe('<DiffViewer> large input', () => {
  it('virtualises rows so only the visible window is in the DOM', () => {
    const a = lines(20_000, (i) => `value ${i}`);
    const b = a.replace('value 10000\n', 'value ten thousand\n');
    const { container } = render(<DiffViewer original={a} modified={b} collapseUnchanged={false} />);
    const rendered = container.querySelectorAll('.m2d-pane-old .m2d-row').length;
    expect(rendered).toBeGreaterThan(10);
    expect(rendered).toBeLessThan(120);
    const content = container.querySelector('.m2d-pane-old .m2d-content') as HTMLElement;
    expect(content.style.height).toBe(`${20_000 * 20}px`);
  });

  it('shows a truncation warning instead of freezing', () => {
    render(<DiffViewer original={lines(300)} modified={lines(310)} options={{ limits: { maxLines: 100 } }} />);
    expect(screen.getByTitle(/exceeds the comparison limit/)).toHaveTextContent('Truncated');
  });
});

describe('accessibility', () => {
  it('split view has no axe violations', async () => {
    const { container } = render(<DiffViewer original={OLD} modified={NEW} />);
    await expectNoAxeViolations(container);
  });

  it('inline view with search open has no axe violations', async () => {
    const user = userEvent.setup();
    const { container } = render(<DiffViewer original={OLD} modified={NEW} defaultView="inline" />);
    await user.click(screen.getByRole('button', { name: /^Search/ }));
    await expectNoAxeViolations(container);
  });

  it('JSON and CSV viewers have no axe violations', async () => {
    const { container } = render(
      <>
        <JsonDiffViewer original={'{"a":1,"b":[1,2]}'} modified={'{"a":2,"b":[1,2,3]}'} />
        <CsvDiffViewer original={'id,name\n1,a\n'} modified={'id,name\n1,b\n2,c\n'} />
      </>,
    );
    await expectNoAxeViolations(container);
  });

  it('the pane divider is keyboard resizable', async () => {
    const user = userEvent.setup();
    render(<DiffViewer original="a\n" modified="b\n" />);
    const sep = screen.getByRole('separator', { name: 'Resize panes' });
    sep.focus();
    await user.keyboard('{ArrowRight}');
    expect(sep).toHaveAttribute('aria-valuenow', '55');
  });
});

describe('<JsonDiffViewer>', () => {
  const a = JSON.stringify({ name: 'svc', version: 1, owner: { email: 'a@x.io' }, metadata: { updatedAt: '2024' }, tags: ['a'] });
  const b = JSON.stringify({ name: 'svc', version: 2, owner: {}, metadata: { updatedAt: '2025' }, tags: ['a', 'b'] });

  it('shows changed paths in a tree with old and new values', () => {
    const { container } = render(<JsonDiffViewer original={a} modified={b} />);
    const version = container.querySelector('[data-path="$.version"]')!;
    expect(version).toHaveClass('m2d-j-changed');
    expect(version.querySelector('.m2d-j-old')).toHaveTextContent('1');
    expect(version.querySelector('.m2d-j-new')).toHaveTextContent('2');
    expect(container.querySelector('[data-path="$.owner.email"]')).toHaveClass('m2d-j-removed');
    expect(container.querySelector('[data-path="$.tags[1]"]')).toHaveClass('m2d-j-added');
    expect(screen.getByRole('toolbar')).toHaveTextContent('+1 −1 ~2');
  });

  it('marks ignored paths without counting them', () => {
    const { container } = render(<JsonDiffViewer original={a} modified={b} ignorePaths={['metadata.updatedAt']} />);
    expect(container.querySelector('[data-path="$.metadata.updatedAt"]')).toHaveClass('m2d-j-ignored');
    expect(screen.getByRole('toolbar')).toHaveTextContent('~1 · 1 ignored');
  });

  it('switches to a normalised text diff', async () => {
    const user = userEvent.setup();
    const { container } = render(<JsonDiffViewer original={a} modified={b} />);
    await user.click(screen.getByRole('button', { name: 'Text' }));
    expect(container.querySelector('.m2d-pane-new')).toHaveTextContent('"version": 2');
  });

  it('handles invalid JSON with a located error and a raw text comparison', () => {
    const { container } = render(<JsonDiffViewer original={'{"a": 1}'} modified={'{"a": }'} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Modified: invalid JSON');
    expect(screen.getByRole('alert')).toHaveTextContent('line 1, column 7');
    expect(container.querySelector('.m2d-pane-new')).toHaveTextContent('{"a": }');
  });

  it('collapses unchanged branches by default and toggles them', async () => {
    const user = userEvent.setup();
    const { container } = render(<JsonDiffViewer original={'{"same":{"x":1},"d":1}'} modified={'{"same":{"x":1},"d":2}'} />);
    expect(container.querySelector('[data-path="$.same.x"]')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Expand $.same' }));
    expect(container.querySelector('[data-path="$.same.x"]')).toBeInTheDocument();
  });
});

describe('<CsvDiffViewer>', () => {
  const a = 'id,name,price\n1,Apple,1.00\n2,Banana,0.50\n';
  const b = 'id,name,price\n2,Banana,0.55\n3,Cherry,3.00\n';

  it('shows added, removed and modified rows with changed cells', () => {
    const { container } = render(<CsvDiffViewer original={a} modified={b} keyColumns={['id']} />);
    const rows = [...container.querySelectorAll('.m2d-tr:not(.m2d-th)')];
    expect(rows.map((r) => r.className.match(/m2d-tr-(\w+)/)?.[1])).toEqual(['removed', 'modified', 'added']);
    const changed = rows[1].querySelector('.m2d-cell-changed')!;
    expect(changed.querySelector('.m2d-cell-old')).toHaveTextContent('0.50');
    expect(changed.querySelector('.m2d-cell-new')).toHaveTextContent('0.55');
  });

  it('lets the user choose the key column and hide unchanged rows', async () => {
    const user = userEvent.setup();
    const { container } = render(<CsvDiffViewer original={'id,v\n1,a\n2,b\n'} modified={'id,v\n2,b\n1,a\n'} />);
    expect(container.querySelectorAll('.m2d-tr-unchanged, .m2d-tr-added, .m2d-tr-removed').length).toBeGreaterThan(0);
    await user.selectOptions(screen.getByLabelText('Match rows by'), 'id');
    expect(container.querySelectorAll('.m2d-tr-unchanged')).toHaveLength(2);
    await user.click(screen.getByLabelText('Changes only'));
    expect(screen.getByText('No changed rows.')).toBeInTheDocument();
  });

  it('reports parse errors', () => {
    render(<CsvDiffViewer original={'a,b\n1,"open\n'} modified={'a,b\n1,2\n'} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Original: Quoted field opened on line 2 is never closed');
  });
});

describe('<DiffStats>', () => {
  it('summarises additions and deletions accessibly', () => {
    render(<DiffStats result={computeDiff('a\nb\n', 'a\nc\nd\n')} />);
    expect(screen.getByRole('img', { name: '2 additions and 1 deletion' })).toBeInTheDocument();
  });
});

describe('async comparison', () => {
  it('uses a custom differ and only commits the latest result', async () => {
    const resolvers: Array<() => void> = [];
    const differ = vi.fn(
      (o: string | null | undefined, m: string | null | undefined) =>
        new Promise<ReturnType<typeof computeDiff>>((resolve) => resolvers.push(() => resolve(computeDiff(o, m)))),
    );
    const { rerender } = render(<DiffViewer original="a\n" modified="b\n" differ={differ} />);
    expect(screen.getByRole('region', { name: 'Comparison' })).toHaveAttribute('aria-busy', 'true');
    rerender(<DiffViewer original="a\n" modified="a\n" differ={differ} />);
    await act(async () => {
      resolvers[1]();
      resolvers[0]();
    });
    expect(screen.getByRole('toolbar')).toHaveTextContent('No differences');
    expect(differ).toHaveBeenCalledTimes(2);
  });
});

it('fires onDiff with each result', () => {
  const onDiff = vi.fn();
  const { rerender } = render(<DiffViewer original="a\n" modified="b\n" onDiff={onDiff} />);
  rerender(<DiffViewer original="a\n" modified="c\n" onDiff={onDiff} />);
  expect(onDiff).toHaveBeenCalledTimes(2);
  fireEvent.scroll(document.querySelector('.m2d-pane-old')!);
});
