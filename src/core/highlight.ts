import type { Range } from './types';

/** Font-style bit flags (same values as TextMate/Shiki). */
export const FONT_ITALIC = 1;
export const FONT_BOLD = 2;
export const FONT_UNDERLINE = 4;

/**
 * A run of same-styled text. Adapters either provide a `className` styled by the stylesheet
 * (highlight.js scopes) or explicit colours (Shiki themes), optionally with a separate dark colour.
 */
export interface SyntaxToken {
  text: string;
  className?: string;
  color?: string;
  darkColor?: string;
  fontStyle?: number;
}

export type TokenLine = SyntaxToken[];

/**
 * The syntax-highlighting adapter contract. The diff engine never depends on it; viewers fall back to
 * plain text whenever a language is unknown, not yet loaded, or tokenizing fails.
 */
export interface SyntaxHighlighter {
  readonly name: string;
  /** The grammar id this highlighter uses for a language, or `null` when it cannot highlight it. */
  resolve(language: string): string | null;
  /** Whether `tokenize` can run synchronously for this language now. */
  isLoaded(language: string): boolean;
  /** Loads a grammar on demand. Resolves when `isLoaded` is true; rejects if it cannot be loaded. */
  load(language: string): Promise<void>;
  /**
   * Tokenizes `code` (lines joined with `\n`). Must return one token list per line, and each line's
   * token texts must concatenate to the line; otherwise the output is discarded for that line.
   */
  tokenize(code: string, language: string): TokenLine[];
  /** Optional language detection for `language="auto"`. */
  detect?(code: string): string | null;
  /** Languages offered in a language picker. */
  languages?(): string[];
}

/**
 * Tokenizes lines with a highlighter, returning `null` when it cannot (unknown language, not loaded,
 * adapter error). Lines whose tokens do not reproduce the text are left un-highlighted.
 */
export function tokenizeLines(
  highlighter: SyntaxHighlighter | null | undefined,
  lines: readonly string[],
  language: string,
): (TokenLine | undefined)[] | null {
  if (!highlighter) return null;
  const grammar = highlighter.resolve(language);
  return grammar ? tokenizeWithGrammar(highlighter, lines, grammar) : null;
}

/** Like `tokenizeLines`, for a grammar id already returned by `highlighter.resolve`. */
export function tokenizeWithGrammar(
  highlighter: SyntaxHighlighter,
  lines: readonly string[],
  grammar: string,
): (TokenLine | undefined)[] | null {
  if (!lines.length || !highlighter.isLoaded(grammar)) return null;
  let tokens: TokenLine[];
  try {
    tokens = highlighter.tokenize(lines.join('\n'), grammar);
  } catch {
    return null;
  }
  const out: (TokenLine | undefined)[] = new Array(lines.length);
  for (let i = 0; i < lines.length; i++) {
    const t = tokens[i];
    if (!t) continue;
    let joined = '';
    for (const tok of t) joined += tok.text;
    out[i] = joined === lines[i] ? t : undefined;
  }
  return out;
}

/** A styled range of a line (diff change, search match...). */
export interface Decoration extends Range {
  className: string;
}

export interface Piece {
  text: string;
  token?: SyntaxToken;
  /** Decoration classes covering this piece (space-separated), or `''`. */
  decorations: string;
}

/**
 * Splits a line into pieces at every token and decoration boundary so syntax colours and diff/search
 * highlights can be rendered together without changing the text.
 */
export function splitPieces(text: string, tokens: TokenLine | undefined, decorations: readonly Decoration[] = []): Piece[] {
  if (!text) return [];
  const toks: SyntaxToken[] = tokens && tokens.length ? tokens : [{ text }];
  if (!decorations.length) return toks.filter((t) => t.text).map((t) => ({ text: t.text, token: tokens ? t : undefined, decorations: '' }));

  const cuts = new Set<number>([0, text.length]);
  let pos = 0;
  for (const t of toks) {
    cuts.add(pos);
    pos += t.text.length;
  }
  for (const d of decorations) {
    cuts.add(Math.max(0, Math.min(text.length, d.start)));
    cuts.add(Math.max(0, Math.min(text.length, d.end)));
  }
  const points = [...cuts].sort((a, b) => a - b);

  const pieces: Piece[] = [];
  let ti = 0;
  let tokStart = 0;
  for (let p = 0; p < points.length - 1; p++) {
    const start = points[p];
    const end = points[p + 1];
    if (end <= start) continue;
    while (ti < toks.length - 1 && tokStart + toks[ti].text.length <= start) {
      tokStart += toks[ti].text.length;
      ti++;
    }
    let cls = '';
    for (const d of decorations) if (d.start <= start && d.end >= end) cls = cls ? `${cls} ${d.className}` : d.className;
    pieces.push({ text: text.slice(start, end), token: tokens ? toks[ti] : undefined, decorations: cls });
  }
  return pieces;
}
