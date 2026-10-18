import type { DiffResult } from './types';

/** A run of unchanged rows that can be collapsed. Only `equal` rows are ever folded. */
export interface FoldRegion {
  /** Stable id within one result: the first hidden row index. */
  id: number;
  rowStart: number;
  rowEnd: number;
  /** First hidden line number on each side. */
  oldStart: number;
  newStart: number;
  count: number;
}

export interface FoldOptions {
  /** Unchanged lines kept visible before and after each change. Default 3. */
  contextLines?: number;
  /** Regions shorter than this stay expanded (a fold row hiding one line saves nothing). Default 4. */
  minHiddenLines?: number;
}

/** Collapsible unchanged regions. Returns nothing when there are no changes. */
export function computeFolds(result: DiffResult, options: FoldOptions = {}): FoldRegion[] {
  const context = Math.max(0, Math.floor(options.contextLines ?? 3));
  const minHidden = Math.max(1, Math.floor(options.minHiddenLines ?? 4));
  const { rows, changes } = result;
  if (changes.length === 0) return [];
  const folds: FoldRegion[] = [];
  const add = (start: number, end: number) => {
    if (end - start < minHidden) return;
    const first = rows[start];
    folds.push({ id: start, rowStart: start, rowEnd: end, oldStart: first.old!.number, newStart: first.new!.number, count: end - start });
  };
  let prevEnd = 0;
  for (let c = 0; c < changes.length; c++) {
    const { rowStart, rowEnd } = changes[c];
    const start = c === 0 ? 0 : prevEnd + context;
    add(start, rowStart - context);
    prevEnd = rowEnd;
  }
  add(prevEnd + context, rows.length);
  return folds;
}

export type DisplayItem = { type: 'row'; row: number } | { type: 'fold'; fold: FoldRegion };

/** Interleaves visible rows and collapsed fold markers. `expanded` holds fold ids shown in full. */
export function buildDisplayItems(rowCount: number, folds: readonly FoldRegion[], expanded: ReadonlySet<number>): DisplayItem[] {
  const items: DisplayItem[] = [];
  let r = 0;
  for (const fold of folds) {
    if (expanded.has(fold.id)) continue;
    for (; r < fold.rowStart; r++) items.push({ type: 'row', row: r });
    items.push({ type: 'fold', fold });
    r = fold.rowEnd;
  }
  for (; r < rowCount; r++) items.push({ type: 'row', row: r });
  return items;
}

/** The collapsed fold that hides `row`, if any. */
export function foldContaining(folds: readonly FoldRegion[], expanded: ReadonlySet<number>, row: number): FoldRegion | undefined {
  let lo = 0;
  let hi = folds.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const f = folds[mid];
    if (row < f.rowStart) hi = mid - 1;
    else if (row >= f.rowEnd) lo = mid + 1;
    else return expanded.has(f.id) ? undefined : f;
  }
  return undefined;
}
