/** A location in a JSON value: object keys and array indices from the root. */
export type JsonPath = ReadonlyArray<string | number>;

const IDENT = /^[A-Za-z_$][\w$]*$/;

/** Formats a path as `$.users[0].name`, quoting keys that are not identifiers (`$["a.b"]`). */
export function formatJsonPath(path: JsonPath): string {
  let out = '$';
  for (const seg of path) {
    if (typeof seg === 'number') out += `[${seg}]`;
    else if (IDENT.test(seg)) out += `.${seg}`;
    else out += `[${JSON.stringify(seg)}]`;
  }
  return out;
}

/** One step of a path pattern. */
type PatternSegment = { kind: 'key'; key: string } | { kind: 'index'; index: number } | { kind: 'any' } | { kind: 'deep' };

export interface PathPattern {
  source: string;
  segments: PatternSegment[];
}

/**
 * Parses a path pattern. Supported syntax:
 *
 * - `a.b.c`, `$.a.b`, `$`: keys from the root (the `$` prefix is optional)
 * - `items[0]`: an array index
 * - `items[*]`, `a.*`: any single key or index
 * - `**`: any number of levels, including none (`**.updatedAt` matches `updatedAt` at any depth)
 * - `["key.with.dots"]`, `['quoted']`: keys that are not identifiers
 *
 * Throws a descriptive error for malformed patterns.
 */
export function parsePathPattern(source: string): PathPattern {
  const s = source.trim();
  const segments: PatternSegment[] = [];
  let i = 0;
  if (s[0] === '$') i = 1;
  const fail = (msg: string): never => {
    throw new Error(`Invalid path pattern ${JSON.stringify(source)}: ${msg} at position ${i}`);
  };
  let first = i === 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '[') {
      const close = s.indexOf(']', i);
      if (close < 0) fail('missing "]"');
      const inner = s.slice(i + 1, close).trim();
      if (inner === '*') segments.push({ kind: 'any' });
      else if (/^\d+$/.test(inner)) segments.push({ kind: 'index', index: Number(inner) });
      else if (/^"(?:[^"\\]|\\.)*"$/.test(inner)) segments.push({ kind: 'key', key: JSON.parse(inner) as string });
      else if (/^'(?:[^'\\]|\\.)*'$/.test(inner)) segments.push({ kind: 'key', key: inner.slice(1, -1).replace(/\\(.)/g, '$1') });
      else fail(`unsupported bracket expression [${inner}]`);
      i = close + 1;
      first = false;
      continue;
    }
    if (c === '.') {
      i++;
      if (i >= s.length) fail('trailing "."');
    } else if (!first) fail('expected "." or "["');
    first = false;
    let j = i;
    while (j < s.length && s[j] !== '.' && s[j] !== '[') j++;
    const name = s.slice(i, j);
    if (!name) fail('empty key');
    if (name === '**') segments.push({ kind: 'deep' });
    else if (name === '*') segments.push({ kind: 'any' });
    else segments.push({ kind: 'key', key: name });
    i = j;
  }
  return { source, segments };
}

/** Whether a concrete path matches a pattern exactly (not a prefix match). */
export function matchesPath(pattern: PathPattern, path: JsonPath): boolean {
  const segs = pattern.segments;
  const go = (pi: number, qi: number): boolean => {
    if (pi === segs.length) return qi === path.length;
    const seg = segs[pi];
    if (seg.kind === 'deep') {
      for (let k = qi; k <= path.length; k++) if (go(pi + 1, k)) return true;
      return false;
    }
    if (qi >= path.length) return false;
    const p = path[qi];
    const ok =
      seg.kind === 'any' ||
      (seg.kind === 'key' && (p === seg.key || (typeof p === 'number' && String(p) === seg.key))) ||
      (seg.kind === 'index' && p === seg.index);
    return ok && go(pi + 1, qi + 1);
  };
  return go(0, 0);
}

/** A compiled set of patterns. Malformed patterns are reported, never silently ignored. */
export interface PathMatcher {
  patterns: PathPattern[];
  errors: string[];
  test(path: JsonPath): boolean;
}

export function createPathMatcher(sources: readonly string[] | undefined): PathMatcher {
  const patterns: PathPattern[] = [];
  const errors: string[] = [];
  for (const src of sources ?? []) {
    if (!src.trim()) continue;
    try {
      patterns.push(parsePathPattern(src));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { patterns, errors, test: (path) => patterns.some((p) => matchesPath(p, path)) };
}
