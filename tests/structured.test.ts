import { describe, expect, it } from 'vitest';
import {
  computeDiff,
  createPathMatcher,
  diffCsv,
  diffJson,
  diffStructured,
  diffValues,
  envFormat,
  formatJsonPath,
  matchesPath,
  parseCsv,
  parseJson,
  parsePathPattern,
} from '../src/core';

describe('parseJson', () => {
  it('parses valid JSON through the fast path', () => {
    expect(parseJson('{"a":[1,2,{"b":null}]}')).toEqual({ ok: true, value: { a: [1, 2, { b: null }] } });
  });

  it('reports invalid JSON with a line and column instead of throwing', () => {
    const r = parseJson('{\n  "a": 1,\n  "b": tru\n}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ line: 3, column: 8 });
    const trailing = parseJson('[1, 2,]');
    expect(trailing.ok).toBe(false);
    if (!trailing.ok) expect(trailing.error.message).toMatch(/Trailing comma/);
    expect(parseJson('').ok).toBe(false);
    expect(parseJson('{"a": "unterminated}').ok).toBe(false);
  });

  it('accepts comments and trailing commas in JSONC mode', () => {
    expect(parseJson('{\n // comment\n "a": 1, /* block */\n "b": [1,],\n}', { jsonc: true })).toEqual({
      ok: true,
      value: { a: 1, b: [1] },
    });
  });

  it('keeps __proto__ as data', () => {
    const r = parseJson('{"__proto__": {"polluted": true}} ', { jsonc: true });
    expect(r.ok && Object.getPrototypeOf(r.value)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('JSON paths', () => {
  it('formats paths', () => {
    expect(formatJsonPath(['users', 0, 'first name', 'x'])).toBe('$.users[0]["first name"].x');
  });

  it('parses and matches patterns with wildcards', () => {
    const m = (p: string, path: (string | number)[]) => matchesPath(parsePathPattern(p), path);
    expect(m('metadata.updatedAt', ['metadata', 'updatedAt'])).toBe(true);
    expect(m('$.request.timestamp', ['request', 'timestamp'])).toBe(true);
    expect(m('users[*].lastSeen', ['users', 3, 'lastSeen'])).toBe(true);
    expect(m('users[*].lastSeen', ['users', 3, 'name'])).toBe(false);
    expect(m('users[1]', ['users', 1])).toBe(true);
    expect(m('users[1]', ['users', 2])).toBe(false);
    expect(m('a.*.c', ['a', 'b', 'c'])).toBe(true);
    expect(m('**.updatedAt', ['updatedAt'])).toBe(true);
    expect(m('**.updatedAt', ['a', 0, 'b', 'updatedAt'])).toBe(true);
    expect(m('["key.with.dots"]', ['key.with.dots'])).toBe(true);
    expect(m("$['it''s']".replace("''", "\\'"), ["it's"])).toBe(true);
    expect(m('metadata', ['metadata', 'updatedAt'])).toBe(false);
  });

  it('reports malformed patterns instead of ignoring them silently', () => {
    expect(() => parsePathPattern('a..b')).toThrow(/empty key/);
    expect(() => parsePathPattern('a[')).toThrow(/missing/);
    expect(createPathMatcher(['ok.path', 'bad[x']).errors).toHaveLength(1);
  });
});

describe('diffValues / diffJson', () => {
  const before = { name: 'svc', version: 1, tags: ['a', 'b'], owner: { id: 7, email: 'a@x.io' }, metadata: { updatedAt: '2024-01-01' } };
  const after = { name: 'svc', version: 2, tags: ['a', 'b', 'c'], owner: { id: 7 }, metadata: { updatedAt: '2025-06-01' }, region: 'eu' };

  it('identifies added, removed and changed keys with paths', () => {
    const r = diffValues(before, after);
    expect(r.changes.map((c) => `${c.kind} ${c.pathString}`).sort()).toEqual(
      ['added $.region', 'added $.tags[2]', 'changed $.metadata.updatedAt', 'changed $.version', 'removed $.owner.email'].sort(),
    );
    expect(r.stats).toEqual({ added: 2, removed: 1, changed: 2, ignored: 0 });
    expect(r.tree.status).toBe('changed');
    expect(r.tree.changeCount).toBe(5);
  });

  it('reports nested changes in arrays of objects and type changes', () => {
    const r = diffValues(
      {
        items: [
          { id: 1, qty: 1 },
          { id: 2, qty: 5 },
        ],
      },
      {
        items: [
          { id: 1, qty: 1 },
          { id: 2, qty: '5' },
        ],
      },
    );
    expect(r.changes).toEqual([
      { kind: 'changed', path: ['items', 1, 'qty'], pathString: '$.items[1].qty', old: 5, new: '5', typeChanged: true },
    ]);
  });

  it('ignores selected paths without reporting them as changes', () => {
    const r = diffValues(before, after, { ignorePaths: ['metadata.updatedAt', '$.version'] });
    expect(r.changes.map((c) => c.pathString)).not.toContain('$.metadata.updatedAt');
    expect(r.stats.ignored).toBe(2);
    const users = diffValues(
      { users: [{ n: 'a', lastSeen: 1 }] },
      { users: [{ n: 'a', lastSeen: 2 }] },
      { ignorePaths: ['users[*].lastSeen'] },
    );
    expect(users.changes).toEqual([]);
    expect(users.tree.status).toBe('unchanged');
  });

  it('finds insertions in ordered arrays instead of shifting every element', () => {
    const r = diffValues([1, 2, 3, 4], [1, 9, 2, 3, 4]);
    expect(r.changes).toEqual([{ kind: 'added', path: [1], pathString: '$[1]', new: 9 }]);
  });

  it('supports unordered arrays and matching by identity key', () => {
    expect(diffValues([1, 2, 3], [3, 1, 2], { arrays: 'unordered' }).changes).toEqual([]);
    expect(diffValues([1, 2, 3], [3, 1, 2]).changes.length).toBeGreaterThan(0);
    const keyed = diffValues(
      {
        users: [
          { id: 1, n: 'a' },
          { id: 2, n: 'b' },
        ],
      },
      {
        users: [
          { id: 2, n: 'B' },
          { id: 1, n: 'a' },
          { id: 3, n: 'c' },
        ],
      },
      { arrayKeys: { users: 'id' } },
    );
    expect(keyed.changes.map((c) => `${c.kind} ${c.pathString}`)).toEqual(['changed $.users[0].n', 'added $.users[2]']);
  });

  it('handles invalid JSON gracefully, falling back to a raw text diff', () => {
    const r = diffJson('{"a": 1}', '{"a": }');
    expect(r.ok).toBe(false);
    expect(r.errors.modified).toMatchObject({ line: 1 });
    expect(r.structure).toBeUndefined();
    expect(r.text).toMatchObject({ original: '{"a": 1}', modified: '{"a": }', normalized: false });
  });

  it('accepts already-parsed values and missing documents', () => {
    expect(diffJson({ value: { a: 1 } }, { value: { a: 2 } }).structure!.stats.changed).toBe(1);
    expect(diffJson(null, '{"a":1}').structure!.stats.added).toBe(1);
  });

  it('produces a normalised text diff where key order does not matter and ignored paths align', () => {
    const a = '{"b": 1, "a": {"t": "2024", "x": true}}';
    const b = '{"a": {"x": true, "t": "2025"}, "b": 1}';
    const plain = diffJson(a, b);
    const textDiff = computeDiff(plain.text.original, plain.text.modified, plain.text.options);
    expect(textDiff.changes).toHaveLength(1);

    const ignored = diffJson(a, b, { ignorePaths: ['a.t'] });
    const ignoredText = computeDiff(ignored.text.original, ignored.text.modified, ignored.text.options);
    expect(ignoredText.changes).toEqual([]);
    expect(ignoredText.rows.find((r) => r.ignored)?.old?.text).toContain('"2024"');
    // The displayed text is never altered by ignore options.
    expect(ignored.text.original).toContain('"2024"');
    expect(ignored.text.modified).toContain('"2025"');
  });
});

describe('structured formats', () => {
  it('compares .env files through the adapter interface', () => {
    const r = diffStructured(
      '# db\nDB_HOST=localhost\nexport DB_PORT=5432\nSECRET="a b" # note\n',
      'DB_HOST=db.internal\nDB_PORT=5432\nSECRET="a b"\nNEW=1\n',
      envFormat,
    );
    expect(r.ok).toBe(true);
    expect(r.structure!.changes.map((c) => `${c.kind} ${c.pathString}`)).toEqual(['changed $.DB_HOST', 'added $.NEW']);
    expect(r.text.modified).toBe('DB_HOST=db.internal\nDB_PORT=5432\nNEW=1\nSECRET="a b"\n');
    expect(diffStructured('nonsense line', 'A=1', envFormat).errors.original?.line).toBe(1);
  });
});

describe('parseCsv', () => {
  it('handles quoted delimiters, escaped quotes and embedded newlines', () => {
    const r = parseCsv('id,name,note\r\n1,"Smith, Jane","said ""hi"""\n2,Bob,"multi\nline"\n');
    expect(r.records).toEqual([
      ['id', 'name', 'note'],
      ['1', 'Smith, Jane', 'said "hi"'],
      ['2', 'Bob', 'multi\nline'],
    ]);
    expect(r.lines).toEqual([1, 2, 3]);
    expect(r.errors).toEqual([]);
  });

  it('detects common delimiters', () => {
    expect(parseCsv('a;b;c\n1;2;3\n').delimiter).toBe(';');
    expect(parseCsv('a\tb\n1\t2\n').delimiter).toBe('\t');
    expect(parseCsv('a,"x;y;z"\n1,2\n').delimiter).toBe(',');
  });

  it('reports parse errors clearly', () => {
    const unterminated = parseCsv('a,b\n1,"open\n2,3\n');
    expect(unterminated.errors[0]).toMatchObject({ code: 'unterminated-quote', line: 2, fatal: true });
    const counts = parseCsv('a,b\n1,2,3\n');
    expect(counts.errors[0]).toMatchObject({ code: 'column-count', record: 2, fatal: false });
    const stray = parseCsv('a,b\n"x"y,2\n');
    expect(stray.errors[0]).toMatchObject({ code: 'unexpected-quote' });
    expect(stray.records[1]).toEqual(['xy', '2']);
  });

  it('handles empty input and a BOM', () => {
    expect(parseCsv('').records).toEqual([]);
    expect(parseCsv('﻿a,b\n').records).toEqual([['a', 'b']]);
  });
});

describe('diffCsv', () => {
  const a = 'id,name,price\n1,Apple,1.00\n2,Banana,0.50\n3,Cherry,3.00\n';

  it('finds added, removed and modified rows with changed cells (ordered)', () => {
    const r = diffCsv(a, 'id,name,price\n1,Apple,1.20\n3,Cherry,3.00\n4,Date,2.00\n');
    expect(r.rows.map((x) => x.kind)).toEqual(['modified', 'removed', 'unchanged', 'added']);
    expect(r.rows[0].cells.map((c) => c.changed)).toEqual([false, false, true]);
    expect(r.stats).toMatchObject({ added: 1, removed: 1, modified: 1, unchanged: 1, changedCells: 1 });
  });

  it('matches rows by key columns regardless of order', () => {
    const r = diffCsv(a, 'id,name,price\n3,Cherry,3.50\n1,Apple,1.00\n', { keyColumns: ['id'] });
    // Output follows the modified order; a removed row is placed before the first match that came after it.
    expect(r.rows.map((x) => `${x.kind}:${x.key}`)).toEqual(['removed:2', 'modified:3', 'unchanged:1']);
    expect(r.rows[1].cells.map((c) => c.changed)).toEqual([false, false, true]);
  });

  it('supports order-insensitive comparison', () => {
    const shuffled = 'id,name,price\n3,Cherry,3.00\n1,Apple,1.00\n2,Banana,0.50\n';
    expect(diffCsv(a, shuffled, { rowOrder: 'unordered' }).stats).toMatchObject({ added: 0, removed: 0, modified: 0, unchanged: 3 });
  });

  it('matches columns by header name and reports added/removed columns', () => {
    const r = diffCsv(a, 'price,id,name,stock\n1.00,1,Apple,5\n0.50,2,Banana,0\n3.00,3,Cherry,9\n');
    expect(r.columns.map((c) => `${c.name}:${c.status}`)).toEqual(['id:unchanged', 'name:unchanged', 'price:unchanged', 'stock:added']);
    expect(r.stats).toMatchObject({ modified: 0, unchanged: 3, columnsAdded: 1 });
  });

  it('honours ignoreColumns, trimCells and ignoreCase', () => {
    const b = 'id,name,price\n1, apple ,9\n2,Banana,0.50\n3,Cherry,3.00\n';
    expect(diffCsv(a, b, { ignoreColumns: ['price'], trimCells: true, ignoreCase: true }).stats.modified).toBe(0);
    expect(diffCsv(a, b).stats.modified).toBe(1);
  });

  it('warns about unknown key columns and duplicate keys, and flags fatal parse errors', () => {
    expect(diffCsv(a, a, { keyColumns: ['nope'] }).warnings[0]).toMatch(/Unknown column/);
    expect(diffCsv('id\n1\n1\n', 'id\n1\n', { keyColumns: ['id'] }).warnings[0]).toMatch(/Duplicate keys/);
    expect(diffCsv('a\n"x', 'a\n').ok).toBe(false);
  });
});
