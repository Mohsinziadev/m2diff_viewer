export interface ParseError {
  message: string;
  /** 1-based line and column of the problem. */
  line: number;
  column: number;
  /** 0-based offset in the input. */
  offset: number;
}

export type ParseResult<T = unknown> = { ok: true; value: T } | { ok: false; error: ParseError };

export interface JsonParseOptions {
  /** Accept `//` and `/* *\/` comments and trailing commas (JSONC). Default false. */
  jsonc?: boolean;
}

/**
 * Parses JSON with precise, engine-independent error positions. Strict JSON goes through the native
 * `JSON.parse` fast path; the hand-written parser runs for JSONC and to locate errors. Never throws.
 */
export function parseJson(text: string, options: JsonParseOptions = {}): ParseResult {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (!options.jsonc) {
    try {
      return { ok: true, value: JSON.parse(src) };
    } catch {
      // fall through to the locating parser
    }
  }
  try {
    return { ok: true, value: new Parser(src, !!options.jsonc).parseDocument() };
  } catch (e) {
    if (e instanceof JsonSyntaxError) return { ok: false, error: e.info };
    if (e instanceof RangeError)
      return { ok: false, error: { message: 'JSON is nested too deeply to parse', line: 1, column: 1, offset: 0 } };
    throw e;
  }
}

class JsonSyntaxError extends Error {
  constructor(readonly info: ParseError) {
    super(info.message);
  }
}

const ESCAPES: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };

class Parser {
  private i = 0;
  constructor(
    private readonly s: string,
    private readonly jsonc: boolean,
  ) {}

  parseDocument(): unknown {
    this.ws();
    if (this.i >= this.s.length) this.fail('Unexpected end of input: expected a JSON value');
    const v = this.value();
    this.ws();
    if (this.i < this.s.length) this.fail(`Unexpected ${this.describe()} after the JSON value`);
    return v;
  }

  private fail(message: string, at = this.i): never {
    let line = 1;
    let col = 1;
    for (let k = 0; k < at && k < this.s.length; k++) {
      if (this.s[k] === '\n') {
        line++;
        col = 1;
      } else col++;
    }
    throw new JsonSyntaxError({ message: `${message} (line ${line}, column ${col})`, line, column: col, offset: at });
  }

  private describe(): string {
    if (this.i >= this.s.length) return 'end of input';
    return `character ${JSON.stringify(this.s[this.i])}`;
  }

  private ws() {
    const s = this.s;
    for (;;) {
      const c = s.charCodeAt(this.i);
      if (c === 32 || c === 9 || c === 10 || c === 13) this.i++;
      else if (this.jsonc && c === 47 && s[this.i + 1] === '/') {
        while (this.i < s.length && s[this.i] !== '\n') this.i++;
      } else if (this.jsonc && c === 47 && s[this.i + 1] === '*') {
        const end = s.indexOf('*/', this.i + 2);
        if (end < 0) this.fail('Unterminated block comment');
        this.i = end + 2;
      } else return;
    }
  }

  private value(): unknown {
    const c = this.s[this.i];
    switch (c) {
      case '{':
        return this.object();
      case '[':
        return this.array();
      case '"':
        return this.string();
      case 't':
        return this.literal('true', true);
      case 'f':
        return this.literal('false', false);
      case 'n':
        return this.literal('null', null);
      default:
        if (c === '-' || (c >= '0' && c <= '9')) return this.number();
        return this.fail(`Unexpected ${this.describe()}: expected a JSON value`);
    }
  }

  private literal<T>(word: string, v: T): T {
    if (this.s.startsWith(word, this.i)) {
      this.i += word.length;
      return v;
    }
    return this.fail(`Unexpected ${this.describe()}: expected a JSON value`);
  }

  private number(): number {
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.s.slice(this.i, this.i + 400));
    if (!m) return this.fail('Invalid number');
    this.i += m[0].length;
    return Number(m[0]);
  }

  private string(): string {
    const s = this.s;
    const start = this.i;
    this.i++;
    let out = '';
    let chunk = this.i;
    for (;;) {
      if (this.i >= s.length) this.fail('Unterminated string', start);
      const c = s.charCodeAt(this.i);
      if (c === 34) {
        out += s.slice(chunk, this.i);
        this.i++;
        return out;
      }
      if (c < 0x20) this.fail('Control character in string (escape it, e.g. \\n)');
      if (c === 92) {
        out += s.slice(chunk, this.i);
        const e = s[this.i + 1];
        if (e === 'u') {
          const hex = s.slice(this.i + 2, this.i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail('Invalid \\u escape');
          out += String.fromCharCode(parseInt(hex, 16));
          this.i += 6;
        } else if (e !== undefined && e in ESCAPES) {
          out += ESCAPES[e];
          this.i += 2;
        } else this.fail(`Invalid escape sequence \\${e ?? ''}`);
        chunk = this.i;
        continue;
      }
      this.i++;
    }
  }

  private array(): unknown[] {
    this.i++;
    const out: unknown[] = [];
    this.ws();
    if (this.s[this.i] === ']') {
      this.i++;
      return out;
    }
    for (;;) {
      this.ws();
      out.push(this.value());
      this.ws();
      const c = this.s[this.i];
      if (c === ',') {
        this.i++;
        this.ws();
        if (this.s[this.i] === ']') {
          if (!this.jsonc) this.fail('Trailing comma in array');
          this.i++;
          return out;
        }
        continue;
      }
      if (c === ']') {
        this.i++;
        return out;
      }
      this.fail(`Unexpected ${this.describe()}: expected "," or "]"`);
    }
  }

  private object(): Record<string, unknown> {
    this.i++;
    const out: Record<string, unknown> = {};
    this.ws();
    if (this.s[this.i] === '}') {
      this.i++;
      return out;
    }
    for (;;) {
      this.ws();
      if (this.s[this.i] !== '"') this.fail(`Unexpected ${this.describe()}: expected a property name in double quotes`);
      const key = this.string();
      this.ws();
      if (this.s[this.i] !== ':') this.fail(`Unexpected ${this.describe()}: expected ":"`);
      this.i++;
      this.ws();
      const v = this.value();
      // defineProperty keeps "__proto__" an own data property instead of changing the prototype.
      Object.defineProperty(out, key, { value: v, enumerable: true, writable: true, configurable: true });
      this.ws();
      const c = this.s[this.i];
      if (c === ',') {
        this.i++;
        this.ws();
        if (this.s[this.i] === '}') {
          if (!this.jsonc) this.fail('Trailing comma in object');
          this.i++;
          return out;
        }
        continue;
      }
      if (c === '}') {
        this.i++;
        return out;
      }
      this.fail(`Unexpected ${this.describe()}: expected "," or "}"`);
    }
  }
}
