import {
  diffValues,
  formatJsonLines,
  ignoredLineKeys,
  type FormattedLines,
  type ValueDiffOptions,
  type ValueDiffResult,
} from './json/diff';
import { parseJson, type ParseError, type ParseResult } from './json/parse';
import { createPathMatcher } from './json/path';
import type { DiffOptions } from './types';

/**
 * A structured data format: anything that parses into a JSON-like value tree (objects, arrays,
 * primitives). Implement this to add YAML, TOML, query strings... without touching the engine:
 *
 * ```ts
 * import YAML from 'yaml';
 * const yamlFormat: StructuredFormat = {
 *   id: 'yaml', label: 'YAML', language: 'yaml',
 *   parse(text) {
 *     try { return { ok: true, value: YAML.parse(text) }; }
 *     catch (e) { return { ok: false, error: { message: String(e), line: 1, column: 1, offset: 0 } }; }
 *   },
 * };
 * ```
 */
export interface StructuredFormat {
  id: string;
  label: string;
  /** Language used to highlight the text view. */
  language?: string;
  parse(text: string): ParseResult;
  /** Pretty-prints a value for the text view with each line's path. Defaults to indented JSON. */
  format?(value: unknown, options: { sortKeys: boolean }): FormattedLines;
}

export const jsonFormat: StructuredFormat = {
  id: 'json',
  label: 'JSON',
  language: 'json',
  parse: (text) => parseJson(text),
};

export const jsoncFormat: StructuredFormat = {
  id: 'jsonc',
  label: 'JSON with comments',
  language: 'json',
  parse: (text) => parseJson(text, { jsonc: true }),
};

const ENV_LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/;

/** `.env` files: `KEY=value`, `export KEY=value`, quoted values, `#` comments. */
export const envFormat: StructuredFormat = {
  id: 'dotenv',
  label: '.env',
  language: 'bash',
  parse(text) {
    const out: Record<string, string> = {};
    const lines = text.split(/\r\n|\r|\n/);
    for (let n = 0; n < lines.length; n++) {
      const raw = lines[n];
      if (!raw.trim() || raw.trim().startsWith('#')) continue;
      const m = ENV_LINE.exec(raw);
      if (!m) {
        return { ok: false, error: { message: `Expected KEY=value (line ${n + 1})`, line: n + 1, column: 1, offset: 0 } };
      }
      let value = m[2].trim();
      const q = value[0];
      if ((q === '"' || q === "'") && value.length >= 2 && value.lastIndexOf(q) > 0) {
        value = value.slice(1, value.lastIndexOf(q));
        if (q === '"') value = value.replace(/\\n/g, '\n').replace(/\\"/g, '"');
      } else {
        const hash = value.search(/\s#/);
        if (hash >= 0) value = value.slice(0, hash).trimEnd();
      }
      Object.defineProperty(out, m[1], { value, enumerable: true, writable: true, configurable: true });
    }
    return { ok: true, value: out };
  },
  format(value, { sortKeys }) {
    const obj = value as Record<string, unknown>;
    const keys = sortKeys ? Object.keys(obj).sort() : Object.keys(obj);
    const lines = keys.map((k) => {
      const v = String(obj[k]);
      return `${k}=${/[\s#"'\n]/.test(v) || v === '' ? JSON.stringify(v) : v}`;
    });
    return { text: lines.join('\n') + (lines.length ? '\n' : ''), paths: keys.map((k) => [k]) };
  },
};

export interface StructuredDiffOptions extends ValueDiffOptions {
  /** Sort object keys in the text view so key order does not show up as changes. Default true. */
  sortKeys?: boolean;
  /** Line-diff options for the text view (whitespace, intraline...). */
  text?: DiffOptions;
}

export interface StructuredDiffResult {
  format: string;
  /** Both sides parsed. When false, `structure` is absent and `text` holds the raw inputs. */
  ok: boolean;
  errors: { original?: ParseError; modified?: ParseError };
  structure?: ValueDiffResult;
  /**
   * Inputs for a line diff of the same data: normalised (pretty-printed) text when both sides parse,
   * the raw text otherwise. Pass `options` straight to `computeDiff`/`<DiffViewer options>`.
   */
  text: { original: string; modified: string; options: DiffOptions; normalized: boolean };
}

type Input = string | { value: unknown } | null | undefined;

/**
 * Compares two documents of a structured format. Inputs are text, or `{ value }` for already-parsed
 * data. `null`/`undefined` means "missing" (everything is added/removed).
 */
export function diffStructured(
  original: Input,
  modified: Input,
  format: StructuredFormat,
  options: StructuredDiffOptions = {},
): StructuredDiffResult {
  const parse = (input: Input): ParseResult & { present: boolean } => {
    if (input == null) return { ok: true, value: undefined, present: false };
    if (typeof input !== 'string') return { ok: true, value: input.value, present: true };
    return { ...format.parse(input), present: true };
  };
  const a = parse(original);
  const b = parse(modified);
  const rawText = (input: Input) => (input == null ? '' : typeof input === 'string' ? input : JSON.stringify(input.value, null, 2) + '\n');

  if (!a.ok || !b.ok) {
    return {
      format: format.id,
      ok: false,
      errors: { original: a.ok ? undefined : a.error, modified: b.ok ? undefined : b.error },
      text: { original: rawText(original), modified: rawText(modified), options: { ...options.text }, normalized: false },
    };
  }

  const structure = diffValuesPresent(a.value, b.value, a.present, b.present, options);
  const sortKeys = options.sortKeys ?? true;
  const print = (v: unknown, present: boolean): FormattedLines =>
    !present ? { text: '', paths: [] } : format.format ? format.format(v, { sortKeys }) : formatJsonLines(v, { sortKeys });
  const fa = print(a.value, a.present);
  const fb = print(b.value, b.present);
  const ignore = createPathMatcher(options.ignorePaths);
  const textOpts: DiffOptions = { ...options.text };
  if (ignore.patterns.length) {
    // Only ignored lines get custom keys; the others keep the normal whitespace/case rules.
    textOpts.compareKeys = { original: ignoredLineKeys(fa.paths, ignore), modified: ignoredLineKeys(fb.paths, ignore) };
  }
  return {
    format: format.id,
    ok: true,
    errors: {},
    structure,
    text: { original: fa.text, modified: fb.text, options: textOpts, normalized: true },
  };
}

function diffValuesPresent(a: unknown, b: unknown, hasA: boolean, hasB: boolean, options: ValueDiffOptions): ValueDiffResult {
  if (hasA && hasB) return diffValues(a, b, options);
  // A missing document compares as an empty one of the other side's container type.
  const empty = (v: unknown) => (Array.isArray(v) ? [] : v !== null && typeof v === 'object' ? {} : undefined);
  return diffValues(hasA ? a : empty(b), hasB ? b : empty(a), options);
}

export interface JsonDiffOptions extends StructuredDiffOptions {
  /** Accept comments and trailing commas. Default false. */
  jsonc?: boolean;
}

/** Compares two JSON documents structurally (and prepares a normalised text diff). Never throws on invalid JSON. */
export function diffJson(original: Input, modified: Input, options: JsonDiffOptions = {}): StructuredDiffResult {
  return diffStructured(original, modified, options.jsonc ? jsoncFormat : jsonFormat, options);
}
