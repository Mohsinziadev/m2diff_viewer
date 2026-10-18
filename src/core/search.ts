import type { DiffResult, DiffSide } from './types';

export type SearchScope = DiffSide | 'both';

export interface SearchOptions {
  /** Which side(s) to search. Default `both`. */
  scope?: SearchScope;
  caseSensitive?: boolean;
  /** Treat the query as a regular expression. Invalid patterns return an `error` instead of throwing. */
  regex?: boolean;
  wholeWord?: boolean;
  /** Stop after this many matches (the result is then flagged `truncated`). Default 10 000. */
  maxMatches?: number;
}

export interface SearchMatch {
  /** Row index in `DiffResult.rows`. */
  row: number;
  side: DiffSide;
  /** 1-based line number on that side. */
  line: number;
  start: number;
  end: number;
}

export interface SearchResult {
  matches: SearchMatch[];
  truncated: boolean;
  error?: string;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Finds every occurrence of `query` in row order (original side first within a row). */
export function searchDiff(result: DiffResult, query: string, options: SearchOptions = {}): SearchResult {
  const matches: SearchMatch[] = [];
  if (!query) return { matches, truncated: false };
  const scope = options.scope ?? 'both';
  const max = options.maxMatches ?? 10_000;
  let source = options.regex ? query : escapeRegExp(query);
  if (options.wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
  let re: RegExp;
  try {
    re = new RegExp(source, `g${options.caseSensitive ? '' : 'i'}${options.wholeWord ? 'u' : ''}`);
  } catch (e) {
    return { matches, truncated: false, error: e instanceof Error ? e.message : 'Invalid pattern' };
  }

  const scan = (text: string, row: number, side: DiffSide, line: number): boolean => {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      matches.push({ row, side, line, start: m.index, end: m.index + m[0].length });
      if (matches.length >= max) return true;
    }
    return false;
  };

  const { rows } = result;
  for (let r = 0; r < rows.length; r++) {
    const { old: o, new: n } = rows[r];
    if (o && scope !== 'modified' && scan(o.text, r, 'original', o.number)) return { matches, truncated: true };
    if (n && scope !== 'original' && scan(n.text, r, 'modified', n.number)) return { matches, truncated: true };
  }
  return { matches, truncated: false };
}
