export interface CsvParseOptions {
  /** Field separator, or `auto` to detect among `,` `;` tab and `|`. Default `auto`. */
  delimiter?: string;
  /** Quote character. Default `"`. */
  quote?: string;
}

export type CsvErrorCode = 'unterminated-quote' | 'unexpected-quote' | 'column-count';

export interface CsvParseError {
  code: CsvErrorCode;
  message: string;
  /** 1-based record number. */
  record: number;
  /** 1-based physical line where the problem was found. */
  line: number;
  /** Whether the data could still be compared (column-count problems are warnings). */
  fatal: boolean;
}

export interface CsvParseResult {
  records: string[][];
  /** 1-based physical line where each record starts. */
  lines: number[];
  delimiter: string;
  errors: CsvParseError[];
}

const CANDIDATES = [',', ';', '\t', '|'];

/** Picks the candidate delimiter that splits the first lines most consistently (quotes respected). */
export function detectDelimiter(text: string, quote = '"'): string {
  const sample = text.slice(0, 64 * 1024);
  let best = ',';
  let bestScore = 0;
  for (const d of CANDIDATES) {
    const counts: number[] = [];
    let n = 0;
    let inQuotes = false;
    for (let i = 0; i < sample.length && counts.length < 20; i++) {
      const c = sample[i];
      if (c === quote) inQuotes = !inQuotes;
      else if (!inQuotes && c === d) n++;
      else if (!inQuotes && (c === '\n' || c === '\r')) {
        if (c === '\r' && sample[i + 1] === '\n') i++;
        counts.push(n);
        n = 0;
      }
    }
    if (n) counts.push(n);
    if (!counts.length || counts[0] === 0) continue;
    const consistent = counts.filter((x) => x === counts[0]).length / counts.length;
    const score = consistent * 1000 + counts[0];
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/**
 * RFC 4180 CSV parser: quoted fields may contain delimiters, newlines and doubled quotes (`""`).
 * Accepts LF, CRLF and CR line breaks and a UTF-8 BOM; skips completely empty lines.
 * Never throws: problems are returned in `errors`.
 */
export function parseCsv(input: string, options: CsvParseOptions = {}): CsvParseResult {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const quote = options.quote ?? '"';
  const delimiter = !options.delimiter || options.delimiter === 'auto' ? detectDelimiter(text, quote) : options.delimiter;
  const records: string[][] = [];
  const lines: number[] = [];
  const errors: CsvParseError[] = [];

  let line = 1;
  let i = 0;
  const n = text.length;
  while (i < n) {
    // Skip blank lines between records.
    if (text[i] === '\n' || text[i] === '\r') {
      if (text[i] === '\r' && text[i + 1] === '\n') i++;
      i++;
      line++;
      continue;
    }
    const record: string[] = [];
    const startLine = line;
    for (;;) {
      let field = '';
      if (text[i] === quote) {
        const openLine = line;
        i++;
        let closed = false;
        while (i < n) {
          const c = text[i];
          if (c === quote) {
            if (text[i + 1] === quote) {
              field += quote;
              i += 2;
              continue;
            }
            i++;
            closed = true;
            break;
          }
          if (c === '\n' || (c === '\r' && text[i + 1] !== '\n')) line++;
          field += c;
          i++;
        }
        if (!closed) {
          errors.push({
            code: 'unterminated-quote',
            message: `Quoted field opened on line ${openLine} is never closed`,
            record: records.length + 1,
            line: openLine,
            fatal: true,
          });
        } else if (i < n && text[i] !== delimiter && text[i] !== '\n' && text[i] !== '\r') {
          errors.push({
            code: 'unexpected-quote',
            message: `Unexpected text after a closing quote on line ${line}`,
            record: records.length + 1,
            line,
            fatal: false,
          });
          // Keep the stray characters as part of the field (lenient, like most spreadsheet apps).
          while (i < n && text[i] !== delimiter && text[i] !== '\n' && text[i] !== '\r') field += text[i++];
        }
      } else {
        const start = i;
        while (i < n && text[i] !== delimiter && text[i] !== '\n' && text[i] !== '\r') i++;
        field = text.slice(start, i);
      }
      record.push(field);
      if (i < n && text[i] === delimiter) {
        i++;
        continue;
      }
      break;
    }
    records.push(record);
    lines.push(startLine);
    if (text[i] === '\r' && text[i + 1] === '\n') i++;
    if (i < n) {
      i++;
      line++;
    }
  }

  if (records.length > 1) {
    const expected = records[0].length;
    for (let r = 1; r < records.length; r++) {
      if (records[r].length !== expected) {
        errors.push({
          code: 'column-count',
          message: `Record ${r + 1} (line ${lines[r]}) has ${records[r].length} fields; expected ${expected}`,
          record: r + 1,
          line: lines[r],
          fatal: false,
        });
        if (errors.length > 200) break;
      }
    }
  }
  return { records, lines, delimiter, errors };
}
