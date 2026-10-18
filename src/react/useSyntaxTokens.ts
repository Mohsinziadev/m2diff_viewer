'use client';
import { useEffect, useMemo, useState } from 'react';
import { tokenizeWithGrammar, type SyntaxHighlighter, type TokenLine } from '../core/highlight';

export interface TokenSource {
  get(lineIndex: number): TokenLine | undefined;
}

export type HighlightStatus = 'off' | 'loading' | 'ready' | 'lazy' | 'unsupported';

/**
 * Syntax tokens for one side of a comparison.
 *
 * Documents up to `fullLimit` lines are tokenized as a whole (accurate multi-line strings and comments).
 * Larger documents are tokenized line by line, only for lines that are actually rendered, so scrolling a
 * huge file never highlights invisible lines; constructs spanning lines may then be coloured approximately.
 */
export function useSyntaxTokens(
  lines: readonly string[] | undefined,
  language: string,
  highlighter: SyntaxHighlighter | null | undefined,
  fullLimit: number,
): { source: TokenSource | null; status: HighlightStatus } {
  const grammar = useMemo(() => {
    if (!highlighter || !language) return null;
    try {
      return highlighter.resolve(language);
    } catch {
      return null;
    }
  }, [highlighter, language]);
  const [loaded, setLoaded] = useState<{ hl: SyntaxHighlighter; grammar: string; ok: boolean } | null>(null);
  const settled = loaded !== null && loaded.hl === highlighter && loaded.grammar === grammar ? loaded : null;
  const isReady = !!grammar && !!highlighter && (highlighter.isLoaded(grammar) || !!settled?.ok);
  const failed = !!settled && !settled.ok;

  useEffect(() => {
    if (!highlighter || !grammar || highlighter.isLoaded(grammar)) return;
    let live = true;
    highlighter.load(grammar).then(
      () => live && setLoaded({ hl: highlighter, grammar, ok: highlighter.isLoaded(grammar) }),
      () => live && setLoaded({ hl: highlighter, grammar, ok: false }),
    );
    return () => {
      live = false;
    };
  }, [highlighter, grammar]);

  const source = useMemo<TokenSource | null>(() => {
    if (!isReady || !lines || !lines.length || !highlighter || !grammar) return null;
    if (lines.length <= fullLimit) {
      const all = tokenizeWithGrammar(highlighter, lines, grammar);
      return all ? { get: (i) => all[i] } : null;
    }
    const cache = new Map<number, TokenLine | undefined>();
    return {
      get(i) {
        if (cache.has(i)) return cache.get(i);
        if (cache.size > 20_000) cache.clear();
        const line = lines[i];
        const t = line === undefined ? undefined : (tokenizeWithGrammar(highlighter, [line], grammar)?.[0] ?? undefined);
        cache.set(i, t);
        return t;
      },
    };
  }, [isReady, lines, highlighter, grammar, fullLimit]);

  const status: HighlightStatus =
    !highlighter || !language
      ? 'off'
      : !grammar || failed
        ? 'unsupported'
        : !isReady
          ? 'loading'
          : lines && lines.length > fullLimit
            ? 'lazy'
            : 'ready';
  return { source, status };
}
