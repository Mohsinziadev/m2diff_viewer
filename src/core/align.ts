/**
 * Line alignment inside a change block: decides which removed lines are edits of which added lines,
 * so the side-by-side view can put "the same line, edited" on one row and highlight words inside it.
 */

/** Two lines with a similarity at or above this are paired as an edit. */
export const PAIR_THRESHOLD = 0.4;

type Bigrams = Map<number, number>;

function bigrams(s: string): { map: Bigrams; size: number } {
  const map: Bigrams = new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const k = s.charCodeAt(i) * 65536 + s.charCodeAt(i + 1);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return { map, size: Math.max(0, s.length - 1) };
}

/** A prepared line for repeated similarity checks. */
export interface Profile {
  text: string;
  grams: Bigrams;
  size: number;
}

export function profile(line: string, ignoreCase: boolean): Profile {
  const text = ignoreCase ? line.trim().toLowerCase() : line.trim();
  const { map, size } = bigrams(text);
  return { text, grams: map, size };
}

/** Sørensen–Dice coefficient over character bigrams of the trimmed lines, in [0, 1]. */
export function similarity(a: Profile, b: Profile): number {
  if (a.text === b.text) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.grams.size <= b.grams.size ? [a.grams, b.grams] : [b.grams, a.grams];
  let common = 0;
  for (const [k, n] of small) {
    const m = large.get(k);
    if (m) common += Math.min(n, m);
  }
  return (2 * common) / (a.size + b.size);
}

/** Pairs of indices `[oldIndex, newIndex]`, strictly increasing in both coordinates. */
export type Pairs = Array<[number, number]>;

/**
 * Order-preserving alignment maximising total similarity of paired lines (pairs below the threshold
 * are not allowed). O(n·m) time and memory; callers bound n·m.
 */
export function alignOptimal(oldP: Profile[], newP: Profile[]): Pairs {
  const n = oldP.length;
  const m = newP.length;
  const w = m + 1;
  const score = new Float64Array((n + 1) * w);
  const sims = new Float32Array(n * m);
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) sims[i * m + j] = similarity(oldP[i], newP[j]);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      let best = Math.max(score[(i - 1) * w + j], score[i * w + j - 1]);
      const s = sims[(i - 1) * m + j - 1];
      // Prefer pairing on ties so equal-score alignments resolve to the diagonal.
      if (s >= PAIR_THRESHOLD) best = Math.max(best, score[(i - 1) * w + j - 1] + s);
      score[i * w + j] = best;
    }
  }
  const pairs: Pairs = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const s = sims[(i - 1) * m + j - 1];
    const here = score[i * w + j];
    if (s >= PAIR_THRESHOLD && here === score[(i - 1) * w + j - 1] + s) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (here === score[(i - 1) * w + j]) i--;
    else j--;
  }
  return pairs.reverse();
}

/** Cheap fallback for big blocks: pair lines in order, keeping only similar pairs. */
export function alignInOrder(oldP: Profile[], newP: Profile[]): Pairs {
  const pairs: Pairs = [];
  const n = Math.min(oldP.length, newP.length);
  for (let i = 0; i < n; i++) if (similarity(oldP[i], newP[i]) >= PAIR_THRESHOLD) pairs.push([i, i]);
  return pairs;
}
