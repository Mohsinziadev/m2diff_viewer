/**
 * How whitespace takes part in line comparison.
 *
 * - `none`     every character counts (default)
 * - `trim`     leading and trailing whitespace is ignored
 * - `collapse` leading/trailing whitespace is ignored and inner runs of whitespace compare equal (like `diff -b`)
 * - `all`      all whitespace is ignored, so `a+b` equals `a + b` (like `diff -w`)
 */
export type WhitespaceMode = 'none' | 'trim' | 'collapse' | 'all';

/**
 * - `normalize`: `\r\n`, `\r` and `\n` are equivalent and a missing final newline is not a difference (default)
 * - `preserve`: line terminators are part of the content, so CRLF↔LF and final-newline changes are reported
 */
export type LineEndingMode = 'normalize' | 'preserve';

/** Granularity of the highlighting inside modified lines. */
export type IntralineMode = 'word' | 'char' | 'none';

export interface DiffLimits {
  /** Lines compared per side. Further lines are left out and reported as truncated. Default 200 000. */
  maxLines: number;
  /** Characters compared per side; input past this is truncated at a line boundary. Default 20 000 000. */
  maxChars: number;
  /**
   * Time budget in milliseconds for the line diff. When exceeded, the changed region is reported as a
   * single replacement block (still correct, just not minimal) and a `timeout` warning is added. Default 3000.
   */
  timeoutMs: number;
  /** Lines longer than this (on either side) get no word/char highlighting. Default 2000. */
  maxIntralineLength: number;
  /**
   * Largest change block (removed × added lines) that gets similarity-based line alignment. Larger
   * blocks are paired in order. Default 40 000 (e.g. 200 × 200).
   */
  maxAlignCells: number;
}

export interface DiffOptions {
  ignoreWhitespace?: WhitespaceMode;
  ignoreCase?: boolean;
  lineEndings?: LineEndingMode;
  intraline?: IntralineMode;
  limits?: Partial<DiffLimits>;
  /**
   * Custom comparison keys, one per line, replacing the built-in whitespace/case normalisation
   * (`undefined` entries keep the built-in key). Lines with equal keys compare equal even when their text differs (the row is then flagged
   * `ignored`). Used by the JSON adapter to ignore paths without altering displayed content.
   */
  compareKeys?: { original?: readonly (string | undefined)[]; modified?: readonly (string | undefined)[] };
}

export interface ResolvedDiffOptions {
  ignoreWhitespace: WhitespaceMode;
  ignoreCase: boolean;
  lineEndings: LineEndingMode;
  intraline: IntralineMode;
  limits: DiffLimits;
}

/** A half-open range `[start, end)` in UTF-16 code units of a line's text. */
export interface Range {
  start: number;
  end: number;
}

export interface DiffLine {
  /** 1-based line number in its document. */
  number: number;
  /** Line content without its terminator. */
  text: string;
}

/**
 * - `equal`     present on both sides and equal under the comparison options
 * - `modified`  a removed and an added line that are similar enough to be shown as an edit
 * - `replaced`  a removed and an added line shown side by side but too different to pair as an edit
 * - `removed`   only in the original
 * - `added`     only in the modified version
 */
export type RowKind = 'equal' | 'modified' | 'replaced' | 'removed' | 'added';

/** One aligned row of the side-by-side view. */
export interface DiffRow {
  kind: RowKind;
  old?: DiffLine;
  new?: DiffLine;
  /** Index into `DiffResult.changes`, or -1 for equal rows. */
  change: number;
  /** Changed ranges inside `old.text` (only for `modified` rows with intraline highlighting). */
  oldRanges?: Range[];
  /** Changed ranges inside `new.text`. */
  newRanges?: Range[];
  /** An `equal` row whose texts differ only in ways the options ignore (whitespace, case, ignored JSON path...). */
  ignored?: boolean;
}

export type ChangeKind = 'added' | 'removed' | 'modified';

/** A contiguous block of changed lines (one "difference"). */
export interface DiffChange {
  index: number;
  kind: ChangeKind;
  /** Row range `[rowStart, rowEnd)` in `DiffResult.rows`. */
  rowStart: number;
  rowEnd: number;
  /** First original line of the block (1-based); when `oldCount` is 0 it is the line the insertion follows. */
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
}

export interface DiffStats {
  /** Lines present only in the modified version, including the new side of modified lines. */
  additions: number;
  /** Lines present only in the original, including the old side of modified lines. */
  deletions: number;
  /** Number of change blocks ("differences"). */
  changes: number;
  /** Rows paired as in-place edits. */
  modifiedLines: number;
  /** Equal rows (including rows whose differences are ignored). */
  unchangedLines: number;
  /** Equal rows whose raw text differs in an ignored way. */
  ignoredLines: number;
  originalLines: number;
  modifiedLinesTotal: number;
}

export interface TextInfo {
  /** Whether content was provided at all (`null`/`undefined` means the file does not exist on this side). */
  present: boolean;
  lines: string[];
  /** Terminator of each line (`''` for a last line without one). */
  eols: string[];
  /** Dominant line terminator, or `mixed`/`none`. */
  eol: '\n' | '\r\n' | '\r' | 'mixed' | 'none';
  finalNewline: boolean;
  /** Lines that existed before truncation. */
  totalLines: number;
  truncated: boolean;
}

export type DiffWarningCode = 'truncated' | 'timeout' | 'intraline-skipped';

export interface DiffWarning {
  code: DiffWarningCode;
  message: string;
}

/**
 * - `identical`  byte-for-byte equal
 * - `equivalent` differences exist but every one is ignored by the options
 * - `added`/`deleted` the original/modified content is missing (`null`/`undefined`)
 * - `modified`   at least one change
 */
export type DiffStatus = 'identical' | 'equivalent' | 'added' | 'deleted' | 'modified';

export interface DiffResult {
  status: DiffStatus;
  rows: DiffRow[];
  changes: DiffChange[];
  stats: DiffStats;
  original: TextInfo;
  modified: TextInfo;
  warnings: DiffWarning[];
  options: ResolvedDiffOptions;
}

export type DiffSide = 'original' | 'modified';
