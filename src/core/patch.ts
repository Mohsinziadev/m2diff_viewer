import type { DiffResult, DiffRow } from './types';

export interface PatchOptions {
  /** Name in the `---` header. Default `original`; `/dev/null` is used when the original is missing. */
  oldName?: string;
  /** Name in the `+++` header. Default `modified`; `/dev/null` is used when the modified file is missing. */
  newName?: string;
  /** Optional header suffix (usually a timestamp), separated by a tab. */
  oldHeader?: string;
  newHeader?: string;
  /** Unchanged lines around each change. Default 3. */
  context?: number;
  /** Emit the `---`/`+++` file headers. Default true. */
  fileHeaders?: boolean;
}

const NO_NEWLINE = '\\ No newline at end of file';

/**
 * Formats a comparison as a unified diff (`diff -u` / `git diff` hunk format).
 *
 * The patch applies exactly (`patch`, `git apply`, jsdiff `applyPatch`) when the comparison used
 * `lineEndings: 'preserve'` and no whitespace/case/path ignoring. With ignore options, context lines are
 * taken from the original and ignored differences are not represented. Returns `''` when nothing changed.
 */
export function createUnifiedPatch(result: DiffResult, options: PatchOptions = {}): string {
  const { rows, changes, original, modified } = result;
  if (changes.length === 0) return '';
  const context = Math.max(0, Math.floor(options.context ?? 3));
  const preserve = result.options.lineEndings === 'preserve';
  const out: string[] = [];

  if (options.fileHeaders !== false) {
    const head = (prefix: string, present: boolean, name: string | undefined, fallback: string, extra?: string) =>
      `${prefix} ${present ? (name ?? fallback) : '/dev/null'}${extra ? '\t' + extra : ''}`;
    out.push(head('---', original.present, options.oldName, 'original', options.oldHeader));
    out.push(head('+++', modified.present, options.newName, 'modified', options.newHeader));
  }

  // Lines before each row, per side, so hunk headers can name the line an insertion follows.
  const oldBefore = new Int32Array(rows.length + 1);
  const newBefore = new Int32Array(rows.length + 1);
  for (let r = 0; r < rows.length; r++) {
    oldBefore[r + 1] = oldBefore[r] + (rows[r].old ? 1 : 0);
    newBefore[r + 1] = newBefore[r] + (rows[r].new ? 1 : 0);
  }

  const oldLast = original.truncated ? -1 : original.lines.length;
  const newLast = modified.truncated ? -1 : modified.lines.length;
  const text = (line: string, eol: string | undefined) => (preserve && eol === '\r\n' ? line + '\r' : line);

  let c = 0;
  while (c < changes.length) {
    const from = Math.max(0, changes[c].rowStart - context);
    let last = c;
    while (last + 1 < changes.length && changes[last + 1].rowStart - changes[last].rowEnd <= 2 * context) last++;
    const to = Math.min(rows.length, changes[last].rowEnd + context);

    const body: string[] = [];
    let r = from;
    while (r < to) {
      const row: DiffRow = rows[r];
      if (row.change < 0) {
        const n = row.old!.number;
        body.push(' ' + text(row.old!.text, original.eols[n - 1]));
        if (n === oldLast && !original.finalNewline) body.push(NO_NEWLINE);
        r++;
        continue;
      }
      const end = changes[row.change].rowEnd;
      for (let k = r; k < end; k++) {
        const o = rows[k].old;
        if (!o) continue;
        body.push('-' + text(o.text, original.eols[o.number - 1]));
        if (o.number === oldLast && !original.finalNewline) body.push(NO_NEWLINE);
      }
      for (let k = r; k < end; k++) {
        const n = rows[k].new;
        if (!n) continue;
        body.push('+' + text(n.text, modified.eols[n.number - 1]));
        if (n.number === newLast && !modified.finalNewline) body.push(NO_NEWLINE);
      }
      r = end;
    }

    const oldCount = oldBefore[to] - oldBefore[from];
    const newCount = newBefore[to] - newBefore[from];
    const oldStart = oldCount ? oldBefore[from] + 1 : oldBefore[from];
    const newStart = newCount ? newBefore[from] + 1 : newBefore[from];
    out.push(`@@ -${range(oldStart, oldCount)} +${range(newStart, newCount)} @@`);
    for (const line of body) out.push(line);
    c = last + 1;
  }
  return out.join('\n') + '\n';
}

function range(start: number, count: number): string {
  return count === 1 ? String(start) : `${start},${count}`;
}
