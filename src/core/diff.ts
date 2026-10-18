import { diffArrays } from 'diff';
import { alignInOrder, alignOptimal, profile, type Pairs, type Profile } from './align';
import { intralineRanges } from './intraline';
import { normalizeLine, splitLines } from './text';
import type {
  ChangeKind,
  DiffChange,
  DiffLimits,
  DiffOptions,
  DiffResult,
  DiffRow,
  DiffStats,
  DiffStatus,
  DiffWarning,
  ResolvedDiffOptions,
  TextInfo,
} from './types';

export const DEFAULT_LIMITS: DiffLimits = {
  maxLines: 200_000,
  maxChars: 20_000_000,
  timeoutMs: 3000,
  maxIntralineLength: 2000,
  maxAlignCells: 40_000,
};

export function resolveOptions(options: DiffOptions = {}): ResolvedDiffOptions {
  return {
    ignoreWhitespace: options.ignoreWhitespace ?? 'none',
    ignoreCase: options.ignoreCase ?? false,
    lineEndings: options.lineEndings ?? 'normalize',
    intraline: options.intraline ?? 'word',
    limits: { ...DEFAULT_LIMITS, ...options.limits },
  };
}

/** One run of the line-level edit script, in line indices (0-based) of each side. */
interface Op {
  type: 'equal' | 'change';
  oldFrom: number;
  oldTo: number;
  newFrom: number;
  newTo: number;
}

function comparisonKeys(info: TextInfo, opts: ResolvedDiffOptions, custom: readonly (string | undefined)[] | undefined): string[] {
  const keys = new Array<string>(info.lines.length);
  for (let i = 0; i < info.lines.length; i++) {
    let key = custom?.[i] ?? normalizeLine(info.lines[i], opts.ignoreWhitespace, opts.ignoreCase);
    if (opts.lineEndings === 'preserve') key += '\u0000' + info.eols[i];
    keys[i] = key;
  }
  return keys;
}

/** Line-level edit script: common prefix/suffix trimming, then Myers over interned line ids. */
function lineOps(oldKeys: string[], newKeys: string[], timeoutMs: number): { ops: Op[]; timedOut: boolean } {
  const ids = new Map<string, number>();
  const intern = (k: string) => {
    let id = ids.get(k);
    if (id === undefined) ids.set(k, (id = ids.size));
    return id;
  };
  const a = oldKeys.map(intern);
  const b = newKeys.map(intern);

  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;

  const ops: Op[] = [];
  const push = (type: Op['type'], oldLen: number, newLen: number) => {
    if (oldLen === 0 && newLen === 0) return;
    const prev = ops[ops.length - 1];
    const oldFrom = prev ? prev.oldTo : 0;
    const newFrom = prev ? prev.newTo : 0;
    if (prev && prev.type === type) {
      prev.oldTo += oldLen;
      prev.newTo += newLen;
    } else ops.push({ type, oldFrom, oldTo: oldFrom + oldLen, newFrom, newTo: newFrom + newLen });
  };

  push('equal', pre, pre);
  const midA = a.slice(pre, a.length - suf);
  const midB = b.slice(pre, b.length - suf);
  let timedOut = false;
  if (midA.length === 0 || midB.length === 0) {
    push('change', midA.length, midB.length);
  } else {
    // Lines present on only one side can never be part of the longest common subsequence, so Myers runs
    // on the lines both sides share (as xdiff and GNU diff do). The edit script stays minimal, and files
    // that were largely rewritten compare in a fraction of the time.
    const inA = new Set(midA);
    const inB = new Set(midB);
    const keepA: number[] = [];
    const keepB: number[] = [];
    for (let i = 0; i < midA.length; i++) if (inB.has(midA[i])) keepA.push(i);
    for (let j = 0; j < midB.length; j++) if (inA.has(midB[j])) keepB.push(j);
    const parts =
      keepA.length && keepB.length
        ? diffArrays(
            keepA.map((i) => midA[i]),
            keepB.map((j) => midB[j]),
            { timeout: timeoutMs },
          )
        : [];
    if (!parts) {
      timedOut = true;
      push('change', midA.length, midB.length);
    } else {
      // Map matched runs back to positions in the full arrays; everything between matches is a change.
      let fa = 0;
      let fb = 0;
      let ia = 0;
      let ib = 0;
      for (const p of parts) {
        if (p.added) fb += p.count;
        else if (p.removed) fa += p.count;
        else {
          for (let k = 0; k < p.count; k++) {
            const oa = keepA[fa++];
            const ob = keepB[fb++];
            push('change', oa - ia, ob - ib);
            push('equal', 1, 1);
            ia = oa + 1;
            ib = ob + 1;
          }
        }
      }
      push('change', midA.length - ia, midB.length - ib);
    }
  }
  push('equal', suf, suf);
  return { ops, timedOut };
}

function statusOf(original: TextInfo, modified: TextInfo, sameText: boolean, changeCount: number): DiffStatus {
  if (!original.present && !modified.present) return 'identical';
  if (!original.present) return 'added';
  if (!modified.present) return 'deleted';
  if (sameText) return 'identical';
  return changeCount === 0 ? 'equivalent' : 'modified';
}

/**
 * Compares two texts line by line, aligns edited lines and computes word/character differences
 * inside them. Pure and synchronous; safe to call on the server or in a worker.
 *
 * `null`/`undefined` means "no file" (the result status becomes `added`/`deleted`); `''` is an empty file.
 */
export function computeDiff(original: string | null | undefined, modified: string | null | undefined, options?: DiffOptions): DiffResult {
  const opts = resolveOptions(options);
  const { limits } = opts;
  const oldInfo = splitLines(original, limits.maxLines, limits.maxChars);
  const newInfo = splitLines(modified, limits.maxLines, limits.maxChars);
  const warnings: DiffWarning[] = [];
  if (oldInfo.truncated || newInfo.truncated) {
    warnings.push({
      code: 'truncated',
      message: `Input exceeds the comparison limit (${limits.maxLines.toLocaleString('en-US')} lines); only the first ${Math.max(
        oldInfo.lines.length,
        newInfo.lines.length,
      ).toLocaleString('en-US')} lines were compared.`,
    });
  }

  const sameText = original === modified && !oldInfo.truncated;
  const { ops, timedOut } = sameText
    ? {
        ops: oldInfo.lines.length
          ? [{ type: 'equal' as const, oldFrom: 0, oldTo: oldInfo.lines.length, newFrom: 0, newTo: newInfo.lines.length }]
          : [],
        timedOut: false,
      }
    : lineOps(
        comparisonKeys(oldInfo, opts, options?.compareKeys?.original),
        comparisonKeys(newInfo, opts, options?.compareKeys?.modified),
        limits.timeoutMs,
      );
  if (timedOut) {
    warnings.push({
      code: 'timeout',
      message: `The line comparison exceeded its ${limits.timeoutMs} ms budget; the changed region is shown as one block.`,
    });
  }

  const rows: DiffRow[] = [];
  const changes: DiffChange[] = [];
  const intralineDeadline = Date.now() + limits.timeoutMs;
  let intralineSkipped = false;
  let modifiedLines = 0;
  let ignoredLines = 0;
  const oldLines = oldInfo.lines;
  const newLines = newInfo.lines;

  for (const op of ops) {
    if (op.type === 'equal') {
      for (let k = 0; k < op.oldTo - op.oldFrom; k++) {
        const oi = op.oldFrom + k;
        const ni = op.newFrom + k;
        const row: DiffRow = {
          kind: 'equal',
          old: { number: oi + 1, text: oldLines[oi] },
          new: { number: ni + 1, text: newLines[ni] },
          change: -1,
        };
        if (oldLines[oi] !== newLines[ni]) {
          row.ignored = true;
          ignoredLines++;
        }
        rows.push(row);
      }
      continue;
    }

    const index = changes.length;
    const oldCount = op.oldTo - op.oldFrom;
    const newCount = op.newTo - op.newFrom;
    const kind: ChangeKind = oldCount === 0 ? 'added' : newCount === 0 ? 'removed' : 'modified';
    const rowStart = rows.length;

    let pairs: Pairs = [];
    if (oldCount && newCount) {
      const oldP: Profile[] = [];
      const newP: Profile[] = [];
      for (let i = op.oldFrom; i < op.oldTo; i++) oldP.push(profile(oldLines[i], opts.ignoreCase));
      for (let j = op.newFrom; j < op.newTo; j++) newP.push(profile(newLines[j], opts.ignoreCase));
      pairs = oldCount * newCount <= limits.maxAlignCells ? alignOptimal(oldP, newP) : alignInOrder(oldP, newP);
    }

    // Lay out rows: each pair is an edit; unpaired lines between pairs share rows side by side.
    let i = 0;
    let j = 0;
    const emitGap = (iTo: number, jTo: number) => {
      while (i < iTo || j < jTo) {
        const hasOld = i < iTo;
        const hasNew = j < jTo;
        rows.push({
          kind: hasOld && hasNew ? 'replaced' : hasOld ? 'removed' : 'added',
          old: hasOld ? { number: op.oldFrom + i + 1, text: oldLines[op.oldFrom + i] } : undefined,
          new: hasNew ? { number: op.newFrom + j + 1, text: newLines[op.newFrom + j] } : undefined,
          change: index,
        });
        if (hasOld) i++;
        if (hasNew) j++;
      }
    };
    for (const [pi, pj] of pairs) {
      emitGap(pi, pj);
      const a = oldLines[op.oldFrom + pi];
      const b = newLines[op.newFrom + pj];
      const row: DiffRow = {
        kind: 'modified',
        old: { number: op.oldFrom + pi + 1, text: a },
        new: { number: op.newFrom + pj + 1, text: b },
        change: index,
      };
      if (opts.intraline !== 'none') {
        if (a.length > limits.maxIntralineLength || b.length > limits.maxIntralineLength || Date.now() > intralineDeadline) {
          intralineSkipped = true;
        } else {
          const r = intralineRanges(a, b, opts.intraline, opts.ignoreCase, opts.ignoreWhitespace);
          row.oldRanges = r.old;
          row.newRanges = r.new;
        }
      }
      rows.push(row);
      modifiedLines++;
      i = pi + 1;
      j = pj + 1;
    }
    emitGap(oldCount, newCount);

    changes.push({
      index,
      kind,
      rowStart,
      rowEnd: rows.length,
      oldStart: oldCount ? op.oldFrom + 1 : op.oldFrom,
      oldCount,
      newStart: newCount ? op.newFrom + 1 : op.newFrom,
      newCount,
    });
  }

  if (intralineSkipped) {
    warnings.push({
      code: 'intraline-skipped',
      message: 'Some modified lines are too long (or too many) for word-level highlighting; they are highlighted as whole lines.',
    });
  }

  let additions = 0;
  let deletions = 0;
  for (const c of changes) {
    additions += c.newCount;
    deletions += c.oldCount;
  }
  const stats: DiffStats = {
    additions,
    deletions,
    changes: changes.length,
    modifiedLines,
    unchangedLines: rows.length - changes.reduce((n, c) => n + (c.rowEnd - c.rowStart), 0),
    ignoredLines,
    originalLines: oldInfo.totalLines,
    modifiedLinesTotal: newInfo.totalLines,
  };

  return {
    status: statusOf(oldInfo, newInfo, sameText, changes.length),
    rows,
    changes,
    stats,
    original: oldInfo,
    modified: newInfo,
    warnings,
    options: opts,
  };
}
