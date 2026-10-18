import type { DisplayItem, FoldRegion } from './fold';
import type { DiffResult, Range } from './types';

/** One line of the unified (inline) layout. */
export type InlineItem =
  | {
      type: 'line';
      kind: 'equal' | 'removed' | 'added';
      row: number;
      oldNumber?: number;
      newNumber?: number;
      text: string;
      ranges?: Range[];
      /** Part of a line edited in place (paired with a line on the other side). */
      edited?: boolean;
      ignored?: boolean;
      change: number;
    }
  | { type: 'fold'; fold: FoldRegion };

/**
 * Converts split-view display items into the inline layout: unchanged lines once, and each change
 * block as all of its removed lines followed by all of its added lines.
 */
export function buildInlineItems(result: DiffResult, items: readonly DisplayItem[]): InlineItem[] {
  const { rows, changes } = result;
  const out: InlineItem[] = [];
  for (const item of items) {
    if (item.type === 'fold') {
      out.push(item);
      continue;
    }
    const row = rows[item.row];
    if (row.change < 0) {
      out.push({
        type: 'line',
        kind: 'equal',
        row: item.row,
        oldNumber: row.old!.number,
        newNumber: row.new!.number,
        text: row.new!.text,
        ignored: row.ignored,
        change: -1,
      });
      continue;
    }
    const change = changes[row.change];
    if (item.row !== change.rowStart) continue; // the whole block is emitted at its first row
    for (let r = change.rowStart; r < change.rowEnd; r++) {
      const { old: o, kind } = rows[r];
      if (o) {
        out.push({
          type: 'line',
          kind: 'removed',
          row: r,
          oldNumber: o.number,
          text: o.text,
          ranges: rows[r].oldRanges,
          edited: kind === 'modified',
          change: change.index,
        });
      }
    }
    for (let r = change.rowStart; r < change.rowEnd; r++) {
      const { new: n, kind } = rows[r];
      if (n) {
        out.push({
          type: 'line',
          kind: 'added',
          row: r,
          newNumber: n.number,
          text: n.text,
          ranges: rows[r].newRanges,
          edited: kind === 'modified',
          change: change.index,
        });
      }
    }
  }
  return out;
}
