import type { TextInfo, WhitespaceMode } from './types';

const LINE_BREAK = /\r\n|\r|\n/g;

/**
 * Splits text into lines, recording each line's terminator. `''` has no lines, `'a\n'` has one line
 * with a final newline, `'\n'` has one empty line.
 */
export function splitLines(text: string | null | undefined, maxLines = Infinity, maxChars = Infinity): TextInfo {
  if (text == null) {
    return { present: false, lines: [], eols: [], eol: 'none', finalNewline: false, totalLines: 0, truncated: false };
  }
  const lines: string[] = [];
  const eols: string[] = [];
  let last = 0;
  let truncated = false;
  let totalLines = 0;
  LINE_BREAK.lastIndex = 0;
  for (let m = LINE_BREAK.exec(text); m; m = LINE_BREAK.exec(text)) {
    totalLines++;
    if (!truncated && (lines.length >= maxLines || m.index > maxChars)) truncated = true;
    if (!truncated) {
      lines.push(text.slice(last, m.index));
      eols.push(m[0]);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    totalLines++;
    if (!truncated && (lines.length >= maxLines || text.length > maxChars)) truncated = true;
    if (!truncated) {
      lines.push(text.slice(last));
      eols.push('');
    }
  }
  const finalNewline = text.length > 0 && last === text.length;
  return { present: true, lines, eols, eol: dominantEol(eols), finalNewline, totalLines, truncated };
}

function dominantEol(eols: string[]): TextInfo['eol'] {
  let kind: string | undefined;
  for (const e of eols) {
    if (!e) continue;
    if (kind === undefined) kind = e;
    else if (kind !== e) return 'mixed';
  }
  return (kind as TextInfo['eol'] | undefined) ?? 'none';
}

const WS_RUN = /\s+/g;
const WS_ANY = /\s/g;

/** The comparison key of a line under the given whitespace/case options. */
export function normalizeLine(line: string, whitespace: WhitespaceMode, ignoreCase: boolean): string {
  let key = line;
  switch (whitespace) {
    case 'trim':
      key = key.trim();
      break;
    case 'collapse':
      key = key.trim().replace(WS_RUN, ' ');
      break;
    case 'all':
      key = key.replace(WS_ANY, '');
      break;
    case 'none':
      break;
  }
  return ignoreCase ? key.toLowerCase() : key;
}

/** Expands tabs to the next tab stop; used for width estimation only, never for displayed content. */
export function visualLength(line: string, tabSize = 4): number {
  if (line.indexOf('\t') === -1) return line.length;
  let col = 0;
  for (let i = 0; i < line.length; i++) col = line[i] === '\t' ? col + tabSize - (col % tabSize) : col + 1;
  return col;
}

/** Display name of a line-ending style, e.g. for a status bar. */
export function describeEol(eol: TextInfo['eol']): string {
  switch (eol) {
    case '\n':
      return 'LF';
    case '\r\n':
      return 'CRLF';
    case '\r':
      return 'CR';
    case 'mixed':
      return 'Mixed';
    case 'none':
      return 'None';
  }
}
