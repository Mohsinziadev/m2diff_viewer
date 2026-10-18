import type { DiffResult, DiffSide, TextInfo } from './types';

/**
 * Copies one change block across: the lines of `change` on the side opposite `target` replace the
 * block's lines on `target`. Returns the new full text of `target`; the other side is unchanged.
 *
 * Throws when the change index is out of range or the result was truncated (part of the text is
 * missing, so it cannot be rebuilt).
 */
export function applyChange(result: DiffResult, changeIndex: number, target: DiffSide): string {
  const change = result.changes[changeIndex];
  if (!change) throw new RangeError(`No change at index ${changeIndex}`);
  if (result.original.truncated || result.modified.truncated) throw new Error('Cannot apply a change to a truncated comparison');

  const toModified = target === 'modified';
  const src = toModified ? result.original : result.modified;
  const dst = toModified ? result.modified : result.original;
  const srcCount = toModified ? change.oldCount : change.newCount;
  const dstCount = toModified ? change.newCount : change.oldCount;
  // `*Start` is 1-based, or the line an insertion follows when the count is 0.
  const srcFrom = srcCount ? (toModified ? change.oldStart : change.newStart) - 1 : 0;
  const dstFrom = dstCount ? (toModified ? change.newStart : change.oldStart) - 1 : toModified ? change.newStart : change.oldStart;

  const lines = [...dst.lines.slice(0, dstFrom), ...src.lines.slice(srcFrom, srcFrom + srcCount), ...dst.lines.slice(dstFrom + dstCount)];
  const eols = [...dst.eols.slice(0, dstFrom), ...src.eols.slice(srcFrom, srcFrom + srcCount), ...dst.eols.slice(dstFrom + dstCount)];
  return joinLines(lines, eols, fallbackEol(dst, src));
}

function fallbackEol(dst: TextInfo, src: TextInfo): string {
  for (const info of [dst, src]) if (info.eol !== 'mixed' && info.eol !== 'none') return info.eol;
  return dst.eols.find(Boolean) ?? src.eols.find(Boolean) ?? '\n';
}

/** Joins lines with their terminators; every line but the last is given one if it lacks it. */
function joinLines(lines: string[], eols: string[], fallback: string): string {
  let out = '';
  for (let i = 0; i < lines.length; i++) out += lines[i] + (eols[i] || (i < lines.length - 1 ? fallback : ''));
  return out;
}
