import { diffArrays } from 'diff';
import { parseCsv, type CsvParseError, type CsvParseOptions } from './parse';

export type ColumnRef = string | number;

export interface CsvDiffOptions extends CsvParseOptions {
  /** First record is a header; columns are then matched by name. Default true. */
  header?: boolean;
  /**
   * Columns (header names or 0-based indices) identifying a row. Rows with the same key are compared
   * cell by cell wherever they are; row order is then irrelevant.
   */
  keyColumns?: readonly ColumnRef[];
  /**
   * Without key columns: `ordered` (default) finds inserted/deleted rows with a sequence diff and pairs
   * edited rows; `unordered` treats rows as a multiset and reports only rows missing on one side.
   */
  rowOrder?: 'ordered' | 'unordered';
  /** Columns excluded from comparison (still displayed). */
  ignoreColumns?: readonly ColumnRef[];
  ignoreCase?: boolean;
  /** Ignore leading/trailing whitespace in cells. Default false. */
  trimCells?: boolean;
}

export interface CsvColumn {
  name: string;
  oldIndex?: number;
  newIndex?: number;
  status: 'unchanged' | 'added' | 'removed';
  key?: boolean;
  ignored?: boolean;
}

export interface CsvCell {
  old?: string;
  new?: string;
  changed: boolean;
}

export interface CsvRowDiff {
  kind: 'unchanged' | 'added' | 'removed' | 'modified';
  /** 1-based data row number (header excluded) on each side. */
  oldRow?: number;
  newRow?: number;
  /** 1-based physical line of the record on each side. */
  oldLine?: number;
  newLine?: number;
  key?: string;
  /** One entry per `columns` element. */
  cells: CsvCell[];
}

export interface CsvDiffStats {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  changedCells: number;
  columnsAdded: number;
  columnsRemoved: number;
}

export interface CsvDiffResult {
  /** No fatal parse error on either side. */
  ok: boolean;
  delimiter: { original: string; modified: string };
  errors: { original: CsvParseError[]; modified: CsvParseError[] };
  /** Problems with options, e.g. unknown key columns or duplicate keys. */
  warnings: string[];
  columns: CsvColumn[];
  rows: CsvRowDiff[];
  stats: CsvDiffStats;
}

/** Compares two CSV documents row by row and cell by cell. Never throws on malformed input. */
export function diffCsv(
  original: string | null | undefined,
  modified: string | null | undefined,
  options: CsvDiffOptions = {},
): CsvDiffResult {
  const header = options.header ?? true;
  const pa = parseCsv(original ?? '', options);
  const pb = parseCsv(modified ?? '', options);
  const warnings: string[] = [];
  const result: CsvDiffResult = {
    ok: !pa.errors.some((e) => e.fatal) && !pb.errors.some((e) => e.fatal),
    delimiter: { original: pa.delimiter, modified: pb.delimiter },
    errors: { original: pa.errors, modified: pb.errors },
    warnings,
    columns: [],
    rows: [],
    stats: { added: 0, removed: 0, modified: 0, unchanged: 0, changedCells: 0, columnsAdded: 0, columnsRemoved: 0 },
  };

  const headA = header ? (pa.records[0] ?? []) : [];
  const headB = header ? (pb.records[0] ?? []) : [];
  const dataA = header ? pa.records.slice(1) : pa.records;
  const dataB = header ? pb.records.slice(1) : pb.records;
  const linesA = header ? pa.lines.slice(1) : pa.lines;
  const linesB = header ? pb.lines.slice(1) : pb.lines;

  // Columns: by name with a header (handles reordering), by position without.
  const columns: CsvColumn[] = [];
  if (header) {
    const usedB = new Set<number>();
    headA.forEach((name, i) => {
      const j = headB.findIndex((h, k) => h === name && !usedB.has(k));
      if (j >= 0) usedB.add(j);
      columns.push({ name, oldIndex: i, newIndex: j >= 0 ? j : undefined, status: j >= 0 ? 'unchanged' : 'removed' });
    });
    headB.forEach((name, j) => {
      if (!usedB.has(j)) columns.push({ name, newIndex: j, status: 'added' });
    });
  } else {
    const widest = (rows: string[][]) => rows.reduce((w, r) => Math.max(w, r.length), 0);
    const widthA = widest(dataA);
    const widthB = widest(dataB);
    const width = Math.max(widthA, widthB);
    for (let c = 0; c < width; c++) {
      columns.push({
        name: `Column ${c + 1}`,
        oldIndex: c < widthA ? c : undefined,
        newIndex: c < widthB ? c : undefined,
        status: c < widthA && c < widthB ? 'unchanged' : c < widthA ? 'removed' : 'added',
      });
    }
  }
  result.stats.columnsAdded = columns.filter((c) => c.status === 'added').length;
  result.stats.columnsRemoved = columns.filter((c) => c.status === 'removed').length;

  const resolveColumn = (ref: ColumnRef): number => {
    const idx = typeof ref === 'number' ? (ref < columns.length ? ref : -1) : columns.findIndex((c) => c.name === ref);
    if (idx < 0) warnings.push(`Unknown column ${JSON.stringify(ref)}`);
    return idx;
  };
  for (const ref of options.ignoreColumns ?? []) {
    const idx = resolveColumn(ref);
    if (idx >= 0) columns[idx].ignored = true;
  }
  const keyCols = (options.keyColumns ?? []).map(resolveColumn).filter((i) => i >= 0);
  for (const k of keyCols) {
    columns[k].key = true;
    if (columns[k].status !== 'unchanged') warnings.push(`Key column "${columns[k].name}" is not present on both sides`);
  }
  result.columns = columns;

  const compared = columns.map((_, i) => i).filter((i) => columns[i].status === 'unchanged' && !columns[i].ignored);
  const norm = (v: string | undefined) => {
    let s = v ?? '';
    if (options.trimCells) s = s.trim();
    if (options.ignoreCase) s = s.toLowerCase();
    return s;
  };
  const cellA = (r: number, c: number) => (columns[c].oldIndex === undefined ? undefined : dataA[r][columns[c].oldIndex!]);
  const cellB = (r: number, c: number) => (columns[c].newIndex === undefined ? undefined : dataB[r][columns[c].newIndex!]);
  const fpA = (r: number) => compared.map((c) => norm(cellA(r, c))).join('\u0000');
  const fpB = (r: number) => compared.map((c) => norm(cellB(r, c))).join('\u0000');

  const emit = (ra: number | undefined, rb: number | undefined, key?: string) => {
    const cells: CsvCell[] = columns.map((col, c) => {
      const o = ra === undefined ? undefined : cellA(ra, c);
      const nw = rb === undefined ? undefined : cellB(rb, c);
      const changed = ra !== undefined && rb !== undefined && col.status === 'unchanged' && !col.ignored && norm(o) !== norm(nw);
      return { old: o, new: nw, changed };
    });
    const changedCells = cells.filter((c) => c.changed).length;
    const kind: CsvRowDiff['kind'] = ra === undefined ? 'added' : rb === undefined ? 'removed' : changedCells ? 'modified' : 'unchanged';
    const row: CsvRowDiff = { kind, cells };
    if (ra !== undefined) {
      row.oldRow = ra + 1;
      row.oldLine = linesA[ra];
    }
    if (rb !== undefined) {
      row.newRow = rb + 1;
      row.newLine = linesB[rb];
    }
    if (key !== undefined) row.key = key;
    result.rows.push(row);
    result.stats[kind]++;
    result.stats.changedCells += changedCells;
  };

  if (keyCols.length) {
    const keyOf = (get: (r: number, c: number) => string | undefined, r: number) => keyCols.map((c) => norm(get(r, c))).join('\u0000');
    const display = (get: (r: number, c: number) => string | undefined, r: number) => keyCols.map((c) => get(r, c) ?? '').join(' · ');
    const pool = new Map<string, number[]>();
    const dupes = new Set<string>();
    dataA.forEach((_, r) => {
      const k = keyOf(cellA, r);
      const list = pool.get(k);
      if (list) {
        list.push(r);
        dupes.add(display(cellA, r));
      } else pool.set(k, [r]);
    });
    const matched = new Set<number>();
    const pairs = dataB.map((_, rb) => {
      const ra = pool.get(keyOf(cellB, rb))?.shift();
      if (ra !== undefined) matched.add(ra);
      return [ra, rb] as const;
    });
    if (dupes.size)
      warnings.push(`Duplicate keys in the original (matched in order): ${[...dupes].slice(0, 5).join(', ')}${dupes.size > 5 ? '…' : ''}`);
    // Output in modified order, with removed rows placed where they were in the original.
    const removed = dataA.map((_, r) => r).filter((r) => !matched.has(r));
    let x = 0;
    for (const [ra, rb] of pairs) {
      if (ra !== undefined) {
        for (; x < removed.length && removed[x] < ra; x++) emit(removed[x], undefined, display(cellA, removed[x]));
      }
      emit(ra, rb, display(cellB, rb));
    }
    for (; x < removed.length; x++) emit(removed[x], undefined, display(cellA, removed[x]));
    return result;
  }

  const fa = dataA.map((_, r) => fpA(r));
  const fb = dataB.map((_, r) => fpB(r));

  if (options.rowOrder === 'unordered') {
    const pool = new Map<string, number[]>();
    fa.forEach((f, r) => {
      const list = pool.get(f);
      if (list) list.push(r);
      else pool.set(f, [r]);
    });
    const matched = new Set<number>();
    const pairs = fb.map((f, rb) => {
      const ra = pool.get(f)?.shift();
      if (ra !== undefined) matched.add(ra);
      return [ra, rb] as const;
    });
    const removed = fa.map((_, r) => r).filter((r) => !matched.has(r));
    let x = 0;
    for (const [ra, rb] of pairs) {
      if (ra !== undefined) while (x < removed.length && removed[x] < ra) emit(removed[x++], undefined);
      emit(ra, rb);
    }
    while (x < removed.length) emit(removed[x++], undefined);
    return result;
  }

  const parts = diffArrays(fa, fb, { timeout: 3000 }) ?? [
    { removed: true, added: false, count: fa.length, value: fa },
    { removed: false, added: true, count: fb.length, value: fb },
  ];
  let ia = 0;
  let ib = 0;
  let pending: number[] = [];
  const similar = (ra: number, rb: number) => {
    if (!compared.length) return true;
    let same = 0;
    for (const c of compared) if (norm(cellA(ra, c)) === norm(cellB(rb, c))) same++;
    return same / compared.length >= 1 / 3;
  };
  const flush = (addedCount: number) => {
    const added: number[] = [];
    for (let k = 0; k < addedCount; k++) added.push(ib++);
    // Pair removed/added rows in order when they share enough cells; otherwise report both.
    let x = 0;
    let y = 0;
    while (x < pending.length || y < added.length) {
      if (x < pending.length && y < added.length && similar(pending[x], added[y])) emit(pending[x++], added[y++]);
      else if (x < pending.length && (y >= added.length || pending.length - x >= added.length - y)) emit(pending[x++], undefined);
      else emit(undefined, added[y++]);
    }
    pending = [];
  };
  for (const p of parts) {
    if (p.removed) for (let k = 0; k < p.count; k++) pending.push(ia++);
    else if (p.added) flush(p.count);
    else {
      flush(0);
      for (let k = 0; k < p.count; k++) emit(ia++, ib++);
    }
  }
  flush(0);
  return result;
}
