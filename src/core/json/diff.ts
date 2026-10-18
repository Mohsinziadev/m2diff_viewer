import { diffArrays } from 'diff';
import { createPathMatcher, formatJsonPath, type JsonPath, type PathMatcher } from './path';

export type ValueType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' | 'undefined';

export function valueType(v: unknown): ValueType {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  const t = typeof v;
  if (t === 'object') return 'object';
  if (t === 'string' || t === 'number' || t === 'boolean') return t;
  return 'undefined';
}

/**
 * - `unchanged` equal on both sides
 * - `changed`   a value that differs, or a container with changes inside
 * - `added`/`removed` present on one side only
 * - `ignored`   differs, but the path matches `ignorePaths`
 */
export type NodeStatus = 'unchanged' | 'changed' | 'added' | 'removed' | 'ignored';

export interface ValueDiffNode {
  /** Object key or array index (the new index when present, else the old one); `null` for the root. */
  key: string | number | null;
  path: JsonPath;
  status: NodeStatus;
  oldType?: ValueType;
  newType?: ValueType;
  old?: unknown;
  new?: unknown;
  /** For array elements: positions on each side. */
  oldIndex?: number;
  newIndex?: number;
  /** Present for objects/arrays (on either side when added/removed, on both sides otherwise). */
  children?: ValueDiffNode[];
  /** Number of reported changes in this subtree. */
  changeCount: number;
}

export type ValueChangeKind = 'added' | 'removed' | 'changed';

export interface ValueChange {
  kind: ValueChangeKind;
  path: JsonPath;
  /** Formatted path, e.g. `$.users[2].email`. */
  pathString: string;
  old?: unknown;
  new?: unknown;
  /** Set when the value changed type (e.g. string → number). */
  typeChanged?: boolean;
}

export interface ValueDiffOptions {
  /** Paths whose differences are reported as `ignored` instead of changes. See `parsePathPattern` for syntax. */
  ignorePaths?: readonly string[];
  /**
   * How array elements are matched:
   * - `ordered` (default): order matters; insertions and deletions are found with a sequence diff
   * - `unordered`: arrays are multisets; only elements missing on one side are reported
   */
  arrays?: 'ordered' | 'unordered';
  /**
   * Match array elements by an identity field instead of position, e.g. `{ 'users': 'id', '**.items': 'sku' }`.
   * Keys are path patterns of the array; values are the field name. Takes precedence over `arrays`.
   */
  arrayKeys?: Readonly<Record<string, string>>;
}

export interface ValueDiffStats {
  added: number;
  removed: number;
  changed: number;
  ignored: number;
}

export interface ValueDiffResult {
  tree: ValueDiffNode;
  changes: ValueChange[];
  stats: ValueDiffStats;
  /** Malformed `ignorePaths`/`arrayKeys` patterns. */
  patternErrors: string[];
}

const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Structural comparison of two plain JSON-like values (objects, arrays, primitives). */
export function diffValues(a: unknown, b: unknown, options: ValueDiffOptions = {}): ValueDiffResult {
  const ignore = createPathMatcher(options.ignorePaths);
  const keyed = Object.entries(options.arrayKeys ?? {}).map(([pattern, field]) => ({ matcher: createPathMatcher([pattern]), field }));
  const changes: ValueChange[] = [];
  const stats: ValueDiffStats = { added: 0, removed: 0, changed: 0, ignored: 0 };
  const ctx: Ctx = { ignore, keyed, unordered: options.arrays === 'unordered', changes, stats };
  const tree = compare(ctx, a, b, [], null, true, true);
  return { tree, changes, stats, patternErrors: [...ignore.errors, ...keyed.flatMap((k) => k.matcher.errors)] };
}

interface Ctx {
  ignore: PathMatcher;
  keyed: Array<{ matcher: PathMatcher; field: string }>;
  unordered: boolean;
  changes: ValueChange[];
  stats: ValueDiffStats;
}

function record(ctx: Ctx, kind: ValueChangeKind, path: JsonPath, old: unknown, nw: unknown, typeChanged = false): void {
  const change: ValueChange = { kind, path, pathString: formatJsonPath(path) };
  if (kind !== 'added') change.old = old;
  if (kind !== 'removed') change.new = nw;
  if (typeChanged) change.typeChanged = true;
  ctx.changes.push(change);
  ctx.stats[kind]++;
}

/** Builds an all-added or all-removed subtree for display. */
function oneSided(value: unknown, path: JsonPath, key: string | number | null, status: 'added' | 'removed'): ValueDiffNode {
  const t = valueType(value);
  const node: ValueDiffNode = { key, path, status, changeCount: 0 };
  if (status === 'added') {
    node.newType = t;
    node.new = value;
  } else {
    node.oldType = t;
    node.old = value;
  }
  if (t === 'object')
    node.children = Object.keys(value as object).map((k) => oneSided((value as Record<string, unknown>)[k], [...path, k], k, status));
  else if (t === 'array') node.children = (value as unknown[]).map((v, i) => oneSided(v, [...path, i], i, status));
  return node;
}

/** Order-independent fingerprint of a value, skipping ignored paths. */
function fingerprint(ctx: Ctx, v: unknown, path: JsonPath): string {
  const t = valueType(v);
  if (t === 'array') return '[' + (v as unknown[]).map((x, i) => fingerprint(ctx, x, [...path, i])).join(',') + ']';
  if (t === 'object') {
    const keys = Object.keys(v as object).sort();
    let s = '{';
    for (const k of keys) {
      const p = [...path, k];
      if (ctx.ignore.patterns.length && ctx.ignore.test(p)) continue;
      s += JSON.stringify(k) + ':' + fingerprint(ctx, (v as Record<string, unknown>)[k], p) + ',';
    }
    return s + '}';
  }
  return t === 'undefined' ? 'undefined' : JSON.stringify(v);
}

function compare(
  ctx: Ctx,
  a: unknown,
  b: unknown,
  path: JsonPath,
  key: string | number | null,
  hasA: boolean,
  hasB: boolean,
): ValueDiffNode {
  if (ctx.ignore.patterns.length && ctx.ignore.test(path)) {
    const differs = hasA !== hasB || fingerprint(ctx, a, path) !== fingerprint(ctx, b, path);
    if (differs) ctx.stats.ignored++;
    const node: ValueDiffNode = { key, path, status: differs ? 'ignored' : 'unchanged', changeCount: 0 };
    if (hasA) {
      node.old = a;
      node.oldType = valueType(a);
    }
    if (hasB) {
      node.new = b;
      node.newType = valueType(b);
    }
    return node;
  }
  if (!hasA) {
    record(ctx, 'added', path, undefined, b);
    return { ...oneSided(b, path, key, 'added'), changeCount: 1 };
  }
  if (!hasB) {
    record(ctx, 'removed', path, a, undefined);
    return { ...oneSided(a, path, key, 'removed'), changeCount: 1 };
  }

  const ta = valueType(a);
  const tb = valueType(b);
  if (ta !== tb) {
    record(ctx, 'changed', path, a, b, true);
    return { key, path, status: 'changed', oldType: ta, newType: tb, old: a, new: b, changeCount: 1 };
  }
  if (ta === 'object') return compareObjects(ctx, a as Record<string, unknown>, b as Record<string, unknown>, path, key);
  if (ta === 'array') return compareArrays(ctx, a as unknown[], b as unknown[], path, key);
  if (a === b || (Number.isNaN(a) && Number.isNaN(b)))
    return { key, path, status: 'unchanged', oldType: ta, newType: tb, old: a, new: b, changeCount: 0 };
  record(ctx, 'changed', path, a, b);
  return { key, path, status: 'changed', oldType: ta, newType: tb, old: a, new: b, changeCount: 1 };
}

function container(key: string | number | null, path: JsonPath, type: ValueType, children: ValueDiffNode[]): ValueDiffNode {
  const changeCount = children.reduce((n, c) => n + c.changeCount, 0);
  return { key, path, status: changeCount ? 'changed' : 'unchanged', oldType: type, newType: type, children, changeCount };
}

function compareObjects(
  ctx: Ctx,
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  path: JsonPath,
  key: string | number | null,
): ValueDiffNode {
  const children: ValueDiffNode[] = [];
  for (const k of Object.keys(a)) children.push(compare(ctx, a[k], hasOwn(b, k) ? b[k] : undefined, [...path, k], k, true, hasOwn(b, k)));
  for (const k of Object.keys(b)) if (!hasOwn(a, k)) children.push(compare(ctx, undefined, b[k], [...path, k], k, false, true));
  return container(key, path, 'object', children);
}

function withIndices(node: ValueDiffNode, oldIndex: number | undefined, newIndex: number | undefined): ValueDiffNode {
  if (oldIndex !== undefined) node.oldIndex = oldIndex;
  if (newIndex !== undefined) node.newIndex = newIndex;
  return node;
}

function compareArrays(ctx: Ctx, a: unknown[], b: unknown[], path: JsonPath, key: string | number | null): ValueDiffNode {
  const keyField = ctx.keyed.find((k) => k.matcher.test(path))?.field;
  if (keyField !== undefined || ctx.unordered) return container(key, path, 'array', matchUnordered(ctx, a, b, path, keyField));

  const children: ValueDiffNode[] = [];
  const fa = a.map((v, i) => fingerprint(ctx, v, [...path, i]));
  const fb = b.map((v, i) => fingerprint(ctx, v, [...path, i]));
  const parts = diffArrays(fa, fb, { timeout: 2000 }) ?? [
    { removed: true, added: false, count: fa.length, value: fa },
    { removed: false, added: true, count: fb.length, value: fb },
  ];
  let i = 0;
  let j = 0;
  let removedRun: number[] = [];
  const flush = (addedCount: number) => {
    const paired = Math.min(removedRun.length, addedCount);
    for (let k = 0; k < paired; k++) {
      const oi = removedRun[k];
      children.push(withIndices(compare(ctx, a[oi], b[j], [...path, j], j, true, true), oi, j));
      j++;
    }
    for (let k = paired; k < removedRun.length; k++) {
      const oi = removedRun[k];
      children.push(withIndices(compare(ctx, a[oi], undefined, [...path, oi], oi, true, false), oi, undefined));
    }
    for (let k = paired; k < addedCount; k++) {
      children.push(withIndices(compare(ctx, undefined, b[j], [...path, j], j, false, true), undefined, j));
      j++;
    }
    removedRun = [];
  };
  for (const p of parts) {
    if (p.removed) {
      for (let k = 0; k < p.count; k++) removedRun.push(i++);
    } else if (p.added) {
      flush(p.count);
    } else {
      flush(0);
      for (let k = 0; k < p.count; k++) {
        children.push(withIndices(compare(ctx, a[i], b[j], [...path, j], j, true, true), i, j));
        i++;
        j++;
      }
    }
  }
  flush(0);
  return container(key, path, 'array', children);
}

/** Matches elements by identity field (when given) or by fingerprint, independent of position. */
function matchUnordered(ctx: Ctx, a: unknown[], b: unknown[], path: JsonPath, keyField: string | undefined): ValueDiffNode[] {
  const identity = (v: unknown, p: JsonPath): string | undefined => {
    if (keyField === undefined) return fingerprint(ctx, v, p);
    if (valueType(v) === 'object' && hasOwn(v as object, keyField))
      return 'k:' + fingerprint(ctx, (v as Record<string, unknown>)[keyField], p);
    return 'v:' + fingerprint(ctx, v, p); // elements without the key field match only identical elements
  };
  const pool = new Map<string, number[]>();
  a.forEach((v, i) => {
    const id = identity(v, [...path, i]);
    if (id === undefined) return;
    const list = pool.get(id);
    if (list) list.push(i);
    else pool.set(id, [i]);
  });
  const matchedOld = new Set<number>();
  const pairs: Array<[number | undefined, number]> = b.map((v, j) => {
    const list = pool.get(identity(v, [...path, j])!);
    const oi = list?.shift();
    if (oi !== undefined) matchedOld.add(oi);
    return [oi, j];
  });
  const removed = a.map((_, i) => i).filter((i) => !matchedOld.has(i));

  // Keep removed elements next to their old neighbours: emit each before the first match that follows it.
  const children: ValueDiffNode[] = [];
  let r = 0;
  for (const [oi, j] of pairs) {
    if (oi !== undefined) {
      while (r < removed.length && removed[r] < oi) {
        const ri = removed[r++];
        children.push(withIndices(compare(ctx, a[ri], undefined, [...path, ri], ri, true, false), ri, undefined));
      }
      children.push(withIndices(compare(ctx, a[oi], b[j], [...path, j], j, true, true), oi, j));
    } else {
      children.push(withIndices(compare(ctx, undefined, b[j], [...path, j], j, false, true), undefined, j));
    }
  }
  for (; r < removed.length; r++) {
    const ri = removed[r];
    children.push(withIndices(compare(ctx, a[ri], undefined, [...path, ri], ri, true, false), ri, undefined));
  }
  return children;
}

/** Pretty-printed text with the JSON path of every line (used to align ignored paths in text view). */
export interface FormattedLines {
  text: string;
  paths: JsonPath[];
}

/** Formats a value as indented JSON, recording which path each output line belongs to. */
export function formatJsonLines(value: unknown, options: { sortKeys?: boolean; indent?: number } = {}): FormattedLines {
  const indentUnit = ' '.repeat(options.indent ?? 2);
  const lines: string[] = [];
  const paths: JsonPath[] = [];
  const emit = (line: string, path: JsonPath) => {
    lines.push(line);
    paths.push(path);
  };
  const walk = (v: unknown, path: JsonPath, prefix: string, depth: number, comma: string) => {
    const pad = indentUnit.repeat(depth);
    const t = valueType(v);
    if (t === 'object' || t === 'array') {
      const entries: Array<[string | number, unknown]> =
        t === 'array'
          ? (v as unknown[]).map((x, i) => [i, x])
          : (options.sortKeys ? Object.keys(v as object).sort() : Object.keys(v as object)).map((k) => [
              k,
              (v as Record<string, unknown>)[k],
            ]);
      const [open, close] = t === 'array' ? ['[', ']'] : ['{', '}'];
      if (!entries.length) {
        emit(`${pad}${prefix}${open}${close}${comma}`, path);
        return;
      }
      emit(`${pad}${prefix}${open}`, path);
      entries.forEach(([k, x], idx) => {
        const childPrefix = t === 'array' ? '' : `${JSON.stringify(k)}: `;
        walk(x, [...path, k], childPrefix, depth + 1, idx < entries.length - 1 ? ',' : '');
      });
      emit(`${pad}${close}${comma}`, path);
      return;
    }
    emit(`${pad}${prefix}${t === 'undefined' ? 'null' : JSON.stringify(v)}${comma}`, path);
  };
  walk(value, [], '', 0, '');
  return { text: lines.join('\n') + '\n', paths };
}

/**
 * Comparison keys for a formatted document: lines inside an ignored path share one key on both sides,
 * so their differences are aligned and flagged as ignored instead of reported as changes.
 */
export function ignoredLineKeys(paths: readonly JsonPath[], ignore: PathMatcher): (string | undefined)[] {
  if (!ignore.patterns.length) return [];
  return paths.map((p) => {
    for (let len = p.length; len >= 1; len--) {
      const prefix = p.slice(0, len);
      if (ignore.test(prefix)) return '\u0001ignored ' + formatJsonPath(prefix);
    }
    return undefined;
  });
}
