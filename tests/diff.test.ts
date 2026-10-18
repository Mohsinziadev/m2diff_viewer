import { applyPatch, diffArrays } from 'diff';
import { describe, expect, it } from 'vitest';
import {
  applyChange,
  buildDisplayItems,
  buildInlineItems,
  computeDiff,
  computeFolds,
  createDiffReport,
  createUnifiedPatch,
  detectIndent,
  foldContaining,
  intralineRanges,
  searchDiff,
  splitLines,
  type DiffResult,
} from '../src/core';

const lines = (n: number, f = (i: number) => `line ${i + 1}`) => Array.from({ length: n }, (_, i) => f(i)).join('\n') + '\n';

/** Every original and modified line appears exactly once, in order — the invariant all views rely on. */
function expectConsistent(r: DiffResult) {
  const olds = r.rows.filter((x) => x.old).map((x) => x.old!.number);
  const news = r.rows.filter((x) => x.new).map((x) => x.new!.number);
  expect(olds).toEqual(r.original.lines.map((_, i) => i + 1));
  expect(news).toEqual(r.modified.lines.map((_, i) => i + 1));
  for (const row of r.rows) {
    if (row.old) expect(row.old.text).toBe(r.original.lines[row.old.number - 1]);
    if (row.new) expect(row.new.text).toBe(r.modified.lines[row.new.number - 1]);
  }
  for (const c of r.changes) {
    for (let i = c.rowStart; i < c.rowEnd; i++) expect(r.rows[i].change).toBe(c.index);
    expect(r.rows.slice(c.rowStart, c.rowEnd).filter((x) => x.old).length).toBe(c.oldCount);
    expect(r.rows.slice(c.rowStart, c.rowEnd).filter((x) => x.new).length).toBe(c.newCount);
  }
}

describe('splitLines', () => {
  it('handles empty input, trailing newlines and mixed terminators', () => {
    expect(splitLines('').lines).toEqual([]);
    expect(splitLines('a').lines).toEqual(['a']);
    expect(splitLines('a\n')).toMatchObject({ lines: ['a'], finalNewline: true, eol: '\n' });
    expect(splitLines('\n').lines).toEqual(['']);
    expect(splitLines('a\r\nb\rc\nd')).toMatchObject({
      lines: ['a', 'b', 'c', 'd'],
      eols: ['\r\n', '\r', '\n', ''],
      eol: 'mixed',
      finalNewline: false,
    });
    expect(splitLines(null).present).toBe(false);
  });

  it('truncates at the line limit and reports the real total', () => {
    const info = splitLines(lines(10), 4);
    expect(info.lines).toHaveLength(4);
    expect(info).toMatchObject({ truncated: true, totalLines: 10 });
  });
});

describe('computeDiff', () => {
  it('reports identical content without changes', () => {
    const r = computeDiff('a\nb\n', 'a\nb\n');
    expect(r.status).toBe('identical');
    expect(r.changes).toEqual([]);
    expect(r.rows).toHaveLength(2);
    expect(r.stats).toMatchObject({ additions: 0, deletions: 0, changes: 0, unchangedLines: 2 });
    expectConsistent(r);
  });

  it('handles empty and missing inputs', () => {
    expect(computeDiff('', '').status).toBe('identical');
    expect(computeDiff(null, undefined).rows).toEqual([]);

    const added = computeDiff(null, 'x\ny\n');
    expect(added.status).toBe('added');
    expect(added.changes).toEqual([
      { index: 0, kind: 'added', rowStart: 0, rowEnd: 2, oldStart: 0, oldCount: 0, newStart: 1, newCount: 2 },
    ]);
    expect(added.stats.additions).toBe(2);

    const deleted = computeDiff('x\n', undefined);
    expect(deleted.status).toBe('deleted');
    expect(deleted.changes[0]).toMatchObject({ kind: 'removed', oldCount: 1, newCount: 0 });

    const fromEmpty = computeDiff('', 'a\n');
    expect(fromEmpty.status).toBe('modified');
    expect(fromEmpty.stats.additions).toBe(1);
  });

  it('finds multiple separated changes with correct line numbers', () => {
    const a = lines(30);
    const b = a.replace('line 3\n', 'line three\n').replace('line 20\n', '').replace('line 28\n', 'line 28\nextra\n');
    const r = computeDiff(a, b);
    expect(r.status).toBe('modified');
    expect(r.changes.map((c) => [c.kind, c.oldStart, c.oldCount, c.newStart, c.newCount])).toEqual([
      ['modified', 3, 1, 3, 1],
      ['removed', 20, 1, 19, 0],
      ['added', 28, 0, 28, 1],
    ]);
    expect(r.stats).toMatchObject({ additions: 2, deletions: 2, changes: 3, modifiedLines: 1 });
    expectConsistent(r);
  });

  it('aligns similar lines inside a change block and keeps unequal line counts aligned', () => {
    const a = 'start\nfunction add(a, b) {\n  return a + b;\n}\nend\n';
    const b = 'start\n// helper\nfunction add(a, b, c) {\n  return a + b + c;\n}\nend\n';
    const r = computeDiff(a, b);
    const block = r.rows.slice(r.changes[0].rowStart, r.changes[0].rowEnd);
    expect(block.map((x) => x.kind)).toEqual(['added', 'modified', 'modified']);
    expect(block[1].old!.text).toBe('function add(a, b) {');
    expect(block[1].new!.text).toBe('function add(a, b, c) {');
    expectConsistent(r);
  });

  it('shows dissimilar lines side by side as replacements rather than edits', () => {
    const r = computeDiff('alpha\n', 'zzzzzz\n');
    expect(r.rows[0]).toMatchObject({ kind: 'replaced', old: { text: 'alpha' }, new: { text: 'zzzzzz' } });
    expect(r.rows[0].oldRanges).toBeUndefined();
    expect(r.stats.modifiedLines).toBe(0);
  });

  it('computes word- and character-level ranges inside modified lines', () => {
    const word = computeDiff('const total = price * qty;\n', 'const total = price * quantity;\n');
    expect(word.rows[0].kind).toBe('modified');
    expect(word.rows[0].oldRanges).toEqual([{ start: 22, end: 25 }]);
    expect(word.rows[0].newRanges).toEqual([{ start: 22, end: 30 }]);

    const char = computeDiff('colour = 1\n', 'color = 1\n', { intraline: 'char' });
    expect(char.rows[0].oldRanges).toEqual([{ start: 4, end: 5 }]);
    expect(char.rows[0].newRanges).toEqual([]);

    const none = computeDiff('a b c\n', 'a x c\n', { intraline: 'none' });
    expect(none.rows[0].oldRanges).toBeUndefined();
  });

  it('handles Unicode and multilingual text without splitting characters', () => {
    const r = computeDiff('こんにちは世界 👋\nПривет мир\n', 'こんにちは世界 🌍\nПривет, мир!\n', { intraline: 'char' });
    expect(r.changes).toHaveLength(1);
    const row = r.rows[0];
    expect(row.kind).toBe('modified');
    const removed = row.oldRanges!.map((x) => row.old!.text.slice(x.start, x.end));
    const added = row.newRanges!.map((x) => row.new!.text.slice(x.start, x.end));
    expect(removed).toEqual(['👋']);
    expect(added).toEqual(['🌍']);
    expectConsistent(r);
  });

  describe('whitespace and case options', () => {
    const a = 'if (x) {\n  call( a,b );\n}\n';
    const b = 'if (x) {\n    call( a, b );   \n}\n';

    it('reports whitespace changes by default', () => {
      expect(computeDiff(a, b).changes).toHaveLength(1);
    });

    it('trim ignores only leading/trailing whitespace', () => {
      const r = computeDiff('  a b\n', 'a b  \n', { ignoreWhitespace: 'trim' });
      expect(r.status).toBe('equivalent');
      expect(r.rows[0]).toMatchObject({ kind: 'equal', ignored: true });
      expect(computeDiff('a b\n', 'a  b\n', { ignoreWhitespace: 'trim' }).changes).toHaveLength(1);
    });

    it('collapse ignores changes in the amount of whitespace', () => {
      expect(computeDiff('a b\n', 'a   b\n', { ignoreWhitespace: 'collapse' }).status).toBe('equivalent');
      expect(computeDiff('ab\n', 'a b\n', { ignoreWhitespace: 'collapse' }).status).toBe('modified');
    });

    it('all ignores every whitespace difference', () => {
      const r = computeDiff(a, b, { ignoreWhitespace: 'all' });
      expect(r.status).toBe('equivalent');
      expect(r.stats.ignoredLines).toBe(1);
    });

    it('does not highlight whitespace-only ranges when whitespace is ignored', () => {
      const r = computeDiff('  foo(a,b)\n', 'foo(a, c)\n', { ignoreWhitespace: 'trim' });
      const row = r.rows[0];
      expect(row.kind).toBe('modified');
      const added = row.newRanges!.map((x) => row.new!.text.slice(x.start, x.end));
      expect(added.every((t) => t.trim().length > 0)).toBe(true);
    });

    it('ignoreCase compares case-insensitively', () => {
      expect(computeDiff('SELECT * FROM t\n', 'select * from t\n', { ignoreCase: true }).status).toBe('equivalent');
      expect(computeDiff('SELECT * FROM t\n', 'select * from t\n').status).toBe('modified');
    });
  });

  describe('line endings', () => {
    it('normalizes CRLF/LF and a missing final newline by default', () => {
      const r = computeDiff('a\r\nb\r\n', 'a\nb');
      expect(r.status).toBe('equivalent');
      expect(r.original.eol).toBe('\r\n');
      expect(r.modified.eol).toBe('\n');
    });

    it('reports terminator changes in preserve mode', () => {
      const r = computeDiff('a\r\nb\n', 'a\nb\n', { lineEndings: 'preserve' });
      expect(r.changes).toHaveLength(1);
      expect(r.changes[0]).toMatchObject({ oldStart: 1, oldCount: 1 });
      expect(computeDiff('a\nb', 'a\nb\n', { lineEndings: 'preserve' }).changes).toHaveLength(1);
    });
  });

  describe('large input safeguards', () => {
    it('truncates beyond maxLines with a warning', () => {
      const r = computeDiff(lines(50), lines(60), { limits: { maxLines: 20 } });
      expect(r.original.lines).toHaveLength(20);
      expect(r.warnings.map((w) => w.code)).toContain('truncated');
      expect(r.status).toBe('equivalent');
    });

    it('falls back to a single block when the time budget is exhausted', () => {
      const a = lines(4000, (i) => `a${(i * 7919) % 4000}`);
      const b = lines(4000, (i) => `a${(i * 104729) % 4000}`);
      const r = computeDiff(a, b, { limits: { timeoutMs: 0 } });
      expect(r.warnings.map((w) => w.code)).toContain('timeout');
      expectConsistent(r);
    });

    it('skips intraline highlighting for very long lines', () => {
      const long = 'x'.repeat(5000);
      const r = computeDiff(long + 'a\n', long + 'b\n');
      expect(r.rows[0].kind).toBe('modified');
      expect(r.rows[0].oldRanges).toBeUndefined();
      expect(r.warnings.map((w) => w.code)).toContain('intraline-skipped');
    });

    it('diffs 50k lines with scattered edits quickly', () => {
      const a = lines(50_000, (i) => `const value${i} = compute(${i});`);
      const b = a
        .split('\n')
        .map((l, i) => (i % 997 === 0 ? l.replace('compute', 'calculate') : l))
        .join('\n');
      const t = performance.now();
      const r = computeDiff(a, b);
      expect(performance.now() - t).toBeLessThan(5000);
      expect(r.changes.length).toBe(51);
      expect(r.warnings).toEqual([]);
    });
  });

  it('produces minimal edit scripts (same size as unfiltered Myers) on random inputs', () => {
    let seed = 3;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let t = 0; t < 200; t++) {
      // Small alphabets produce many repeated lines; large ones many lines unique to one side.
      const alphabet = 2 + Math.floor(rand() * 30);
      const a = Array.from({ length: Math.floor(rand() * 60) }, () => `l${Math.floor(rand() * alphabet)}`);
      const b = Array.from({ length: Math.floor(rand() * 60) }, () => `l${Math.floor(rand() * alphabet)}`);
      const r = computeDiff(a.join('\n'), b.join('\n'), { intraline: 'none' });
      const reference = diffArrays(a, b).reduce((n, p) => n + (p.added || p.removed ? p.count : 0), 0);
      expect(r.stats.additions + r.stats.deletions).toBe(reference);
      expectConsistent(r);
    }
  });

  it('compares a fully rewritten file quickly', () => {
    const a = lines(5000, (i) => (i % 40 === 0 ? `// section ${i}` : `const value${i} = compute(${i});`));
    const b = lines(5000, (i) => (i % 40 === 0 ? `// section ${i}` : `const item${i} = compute(${i});`));
    const t = performance.now();
    const r = computeDiff(a, b);
    expect(performance.now() - t).toBeLessThan(1500);
    expect(r.warnings).toEqual([]);
    expect(r.stats.changes).toBe(125);
  });

  it('is deterministic', () => {
    const a = lines(200, (i) => `x${i % 13}`);
    const b = lines(210, (i) => `x${(i * 3) % 13}`);
    expect(JSON.stringify(computeDiff(a, b))).toBe(JSON.stringify(computeDiff(a, b)));
  });
});

describe('intralineRanges', () => {
  it('merges adjacent ranges', () => {
    expect(intralineRanges('abc', 'xyz', 'char')).toEqual({ old: [{ start: 0, end: 3 }], new: [{ start: 0, end: 3 }] });
  });
});

describe('folding', () => {
  const a = lines(100);
  const b = a.replace('line 50\n', 'line fifty\n');
  const r = computeDiff(a, b);

  it('collapses long unchanged regions around changes, keeping context', () => {
    const folds = computeFolds(r, { contextLines: 3 });
    expect(folds.map((f) => [f.rowStart, f.rowEnd, f.count, f.oldStart])).toEqual([
      [0, 46, 46, 1],
      [53, 100, 47, 54],
    ]);
    const items = buildDisplayItems(r.rows.length, folds, new Set());
    expect(items).toHaveLength(2 + 7);
    expect(items.filter((i) => i.type === 'row').map((i) => (i.type === 'row' ? r.rows[i.row].old!.number : 0))).toEqual([
      47, 48, 49, 50, 51, 52, 53,
    ]);
  });

  it('never hides changed rows, and expands individual folds', () => {
    const folds = computeFolds(r, { contextLines: 0 });
    for (const f of folds) for (let i = f.rowStart; i < f.rowEnd; i++) expect(r.rows[i].kind).toBe('equal');
    const items = buildDisplayItems(r.rows.length, folds, new Set([folds[0].id]));
    expect(items.filter((i) => i.type === 'row')).toHaveLength(50);
    expect(foldContaining(folds, new Set(), 10)?.id).toBe(folds[0].id);
    expect(foldContaining(folds, new Set([folds[0].id]), 10)).toBeUndefined();
    expect(foldContaining(folds, new Set(), 49)).toBeUndefined();
  });

  it('does not fold short regions or unchanged files', () => {
    expect(computeFolds(computeDiff(lines(6), lines(6).replace('line 3', 'x')), { contextLines: 1, minHiddenLines: 4 })).toEqual([]);
    expect(computeFolds(computeDiff(a, a))).toEqual([]);
  });
});

describe('inline layout', () => {
  it('lists removed lines before added lines for each block', () => {
    const r = computeDiff('a\nb\nc\nd\n', 'a\nB\nC\nd\n');
    const items = buildInlineItems(r, buildDisplayItems(r.rows.length, [], new Set()));
    expect(items.map((i) => (i.type === 'line' ? `${i.kind}:${i.text}` : 'fold'))).toEqual([
      'equal:a',
      'removed:b',
      'removed:c',
      'added:B',
      'added:C',
      'equal:d',
    ]);
  });
});

describe('unified patch', () => {
  const roundTrip = (a: string, b: string, context?: number) => {
    const r = computeDiff(a, b, { lineEndings: 'preserve' });
    const patch = createUnifiedPatch(r, { context });
    expect(applyPatch(a, patch)).toBe(b);
    return patch;
  };

  it('emits standard headers and hunks', () => {
    const patch = createUnifiedPatch(computeDiff('a\nb\nc\n', 'a\nB\nc\n'), { oldName: 'a/file.txt', newName: 'b/file.txt' });
    expect(patch).toBe('--- a/file.txt\n+++ b/file.txt\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n');
  });

  it('uses /dev/null for added and deleted files', () => {
    expect(createUnifiedPatch(computeDiff(null, 'x\n'))).toBe('--- /dev/null\n+++ modified\n@@ -0,0 +1 @@\n+x\n');
    expect(createUnifiedPatch(computeDiff('x\n', null))).toBe('--- original\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n');
  });

  it('marks a missing newline at end of file', () => {
    const patch = roundTrip('a\nb', 'a\nc');
    expect(patch).toContain('-b\n\\ No newline at end of file\n+c\n\\ No newline at end of file\n');
    roundTrip('a\nb', 'a\nb\n');
    roundTrip('a\nb\n', 'a\nb');
  });

  it('round-trips CRLF content', () => {
    roundTrip('a\r\nb\r\nc\r\n', 'a\r\nB\r\nc\r\n');
  });

  it('returns an empty string when nothing changed', () => {
    expect(createUnifiedPatch(computeDiff('a\n', 'a\n'))).toBe('');
  });

  it('merges nearby changes into one hunk and splits distant ones', () => {
    const a = lines(40);
    const near = a.replace('line 10\n', 'X\n').replace('line 15\n', 'Y\n');
    expect(roundTrip(a, near).match(/^@@/gm)).toHaveLength(1);
    const far = a.replace('line 5\n', 'X\n').replace('line 30\n', 'Y\n');
    expect(roundTrip(a, far).match(/^@@/gm)).toHaveLength(2);
    expect(roundTrip(a, far, 0).match(/^@@/gm)).toHaveLength(2);
  });

  it('applies cleanly for randomized edits (fuzz)', () => {
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let t = 0; t < 150; t++) {
      const base = Array.from({ length: Math.floor(rand() * 40) }, () => `l${Math.floor(rand() * 8)}`);
      const next = [...base];
      for (let e = Math.floor(rand() * 6); e > 0; e--) {
        const at = Math.floor(rand() * (next.length + 1));
        const op = rand();
        if (op < 0.33) next.splice(at, 0, `n${Math.floor(rand() * 8)}`);
        else if (op < 0.66) next.splice(at, 1);
        else if (at < next.length) next[at] = `m${Math.floor(rand() * 8)}`;
      }
      const end = (arr: string[]) => (arr.length ? arr.join('\n') + (rand() < 0.8 ? '\n' : '') : '');
      const a = end(base);
      const b = end(next);
      const r = computeDiff(a, b, { lineEndings: 'preserve' });
      expectConsistent(r);
      expect(applyPatch(a, createUnifiedPatch(r, { context: Math.floor(rand() * 4) }))).toBe(b);
    }
  });
});

describe('search', () => {
  const r = computeDiff('Alpha beta\ngamma\n', 'alpha BETA\ngamma delta\n');

  it('searches both sides case-insensitively by default', () => {
    const { matches } = searchDiff(r, 'alpha');
    expect(matches.map((m) => [m.side, m.line, m.start, m.end])).toEqual([
      ['original', 1, 0, 5],
      ['modified', 1, 0, 5],
    ]);
  });

  it('respects scope, case sensitivity, whole words and regex', () => {
    expect(searchDiff(r, 'alpha', { caseSensitive: true }).matches).toHaveLength(1);
    expect(searchDiff(r, 'gamma', { scope: 'modified' }).matches.map((m) => m.side)).toEqual(['modified']);
    expect(searchDiff(r, 'ta', { wholeWord: true }).matches).toHaveLength(0);
    expect(searchDiff(r, 'g\\w+a', { regex: true }).matches).toHaveLength(2);
    expect(searchDiff(r, '(', { regex: true }).error).toBeTruthy();
    expect(searchDiff(r, '(').error).toBeUndefined();
  });

  it('caps the number of matches', () => {
    const big = computeDiff(
      lines(100, () => 'aaaa'),
      '',
    );
    const res = searchDiff(big, 'a', { maxMatches: 50 });
    expect(res.matches).toHaveLength(50);
    expect(res.truncated).toBe(true);
  });
});

describe('report', () => {
  it('summarises a comparison as JSON-safe data', () => {
    const report = createDiffReport(computeDiff('a\n', 'b\n'), { original: 'old.txt' });
    expect(report).toMatchObject({ format: 'm2diff-report', version: 1, status: 'modified', stats: { additions: 1, deletions: 1 } });
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
});

describe('applyChange', () => {
  /** Applies one change at a time until no differences remain; the target must end up equal to the source. */
  function converge(a: string, b: string, target: 'original' | 'modified') {
    let [o, m] = [a, b];
    for (let guard = 0; guard < 50; guard++) {
      const r = computeDiff(o, m, { lineEndings: 'preserve' });
      if (!r.changes.length) break;
      const i = guard % r.changes.length;
      if (target === 'modified') m = applyChange(r, i, 'modified');
      else o = applyChange(r, i, 'original');
    }
    return target === 'modified' ? m : o;
  }

  const cases: Array<[string, string]> = [
    ['a\nb\nc\n', 'x\na\nB\nc\nd\n'],
    ['a\nb\nc', 'a\nc'],
    ['', 'one\ntwo\n'],
    ['one\ntwo\n', ''],
    ['a\r\nb\r\nc\r\n', 'a\r\nB\r\nc\r\nnew\r\n'],
    [lines(30), lines(30, (i) => (i % 7 === 0 ? `changed ${i}` : `line ${i + 1}`))],
  ];

  it.each(cases)('copying every change into the modified side reproduces the original (%#)', (a, b) => {
    expect(converge(a, b, 'modified')).toBe(a);
  });

  it.each(cases)('copying every change into the original side reproduces the modified (%#)', (a, b) => {
    expect(converge(a, b, 'original')).toBe(b);
  });

  it('only touches the chosen block', () => {
    const r = computeDiff('a\nb\nc\nd\n', 'a\nB\nc\nD\n');
    expect(applyChange(r, 0, 'modified')).toBe('a\nb\nc\nD\n');
    expect(applyChange(r, 1, 'original')).toBe('a\nb\nc\nD\n');
  });

  it('keeps line terminators when inserting a final line without one', () => {
    const r = computeDiff('a\nb', 'a\nb\nc\n');
    expect(applyChange(r, 0, 'original')).toBe('a\nb\nc\n');
    const r2 = computeDiff('a\nb\n', 'z\na\nb\n');
    expect(applyChange(r2, 0, 'original')).toBe('z\na\nb\n');
  });

  it('rejects invalid indexes and truncated results', () => {
    const r = computeDiff('a\n', 'b\n');
    expect(() => applyChange(r, 3, 'modified')).toThrow(RangeError);
    const t = computeDiff(
      lines(10),
      lines(10, (i) => `x${i}`),
      { limits: { maxLines: 4 } },
    );
    expect(() => applyChange(t, 0, 'modified')).toThrow(/truncated/);
  });
});

describe('detectIndent', () => {
  it('recognises spaces, tabs and unindented text', () => {
    expect(detectIndent(['a {', '  b {', '    c', '  }', '}'])).toEqual({ kind: 'spaces', size: 2 });
    expect(detectIndent(['def f():', '    if x:', '        y'])).toEqual({ kind: 'spaces', size: 4 });
    expect(detectIndent(['a', '\tb', '\t\tc'])).toEqual({ kind: 'tabs', size: 1 });
    expect(detectIndent(['a', 'b'])).toBeNull();
  });
});
