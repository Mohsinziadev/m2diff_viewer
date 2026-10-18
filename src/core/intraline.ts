import { diffChars, diffWordsWithSpace } from 'diff';
import type { IntralineMode, Range, WhitespaceMode } from './types';

/** Merges sorted, possibly touching ranges. */
export function mergeRanges(ranges: Range[]): Range[] {
  const out: Range[] = [];
  for (const r of ranges) {
    if (r.end <= r.start) continue;
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ start: r.start, end: r.end });
  }
  return out;
}

const ONLY_WS = /^\s*$/;

/**
 * Character ranges that differ between two versions of a line, at word or character granularity.
 * Whitespace-only ranges are dropped when whitespace is ignored, so indentation changes do not light up.
 */
export function intralineRanges(
  a: string,
  b: string,
  mode: Exclude<IntralineMode, 'none'>,
  ignoreCase = false,
  whitespace: WhitespaceMode = 'none',
): { old: Range[]; new: Range[] } {
  const parts = mode === 'char' ? diffChars(a, b, { ignoreCase }) : diffWordsWithSpace(a, b, { ignoreCase });
  const oldR: Range[] = [];
  const newR: Range[] = [];
  let i = 0;
  let j = 0;
  const keep = (text: string) => whitespace === 'none' || !ONLY_WS.test(text);
  for (const p of parts) {
    const len = p.value.length;
    if (p.removed) {
      if (keep(p.value)) oldR.push({ start: i, end: Math.min(a.length, i + len) });
      i += len;
    } else if (p.added) {
      if (keep(p.value)) newR.push({ start: j, end: Math.min(b.length, j + len) });
      j += len;
    } else {
      i += len;
      j += len;
    }
  }
  return { old: mergeRanges(oldR), new: mergeRanges(newR) };
}
