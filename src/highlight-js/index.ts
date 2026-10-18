import type { HLJSApi, LanguageFn } from 'highlight.js';
import hljsCore from 'highlight.js/lib/core';
import { resolveLanguage } from '../core/languages';
import type { SyntaxHighlighter, SyntaxToken, TokenLine } from '../core/highlight';

type Loader = () => Promise<{ default: LanguageFn }>;

/**
 * Grammar loaders. Each is a separate dynamic import, so bundlers emit one small chunk per language and
 * only the languages actually viewed are downloaded — from your own bundle, never from a CDN.
 */
const LOADERS: Record<string, Loader> = {
  bash: () => import('highlight.js/lib/languages/bash'),
  c: () => import('highlight.js/lib/languages/c'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  csharp: () => import('highlight.js/lib/languages/csharp'),
  css: () => import('highlight.js/lib/languages/css'),
  dart: () => import('highlight.js/lib/languages/dart'),
  diff: () => import('highlight.js/lib/languages/diff'),
  dockerfile: () => import('highlight.js/lib/languages/dockerfile'),
  elixir: () => import('highlight.js/lib/languages/elixir'),
  go: () => import('highlight.js/lib/languages/go'),
  graphql: () => import('highlight.js/lib/languages/graphql'),
  haskell: () => import('highlight.js/lib/languages/haskell'),
  ini: () => import('highlight.js/lib/languages/ini'),
  java: () => import('highlight.js/lib/languages/java'),
  javascript: () => import('highlight.js/lib/languages/javascript'),
  json: () => import('highlight.js/lib/languages/json'),
  kotlin: () => import('highlight.js/lib/languages/kotlin'),
  less: () => import('highlight.js/lib/languages/less'),
  lua: () => import('highlight.js/lib/languages/lua'),
  makefile: () => import('highlight.js/lib/languages/makefile'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
  nginx: () => import('highlight.js/lib/languages/nginx'),
  objectivec: () => import('highlight.js/lib/languages/objectivec'),
  perl: () => import('highlight.js/lib/languages/perl'),
  php: () => import('highlight.js/lib/languages/php'),
  plaintext: () => import('highlight.js/lib/languages/plaintext'),
  powershell: () => import('highlight.js/lib/languages/powershell'),
  python: () => import('highlight.js/lib/languages/python'),
  r: () => import('highlight.js/lib/languages/r'),
  ruby: () => import('highlight.js/lib/languages/ruby'),
  rust: () => import('highlight.js/lib/languages/rust'),
  scala: () => import('highlight.js/lib/languages/scala'),
  scss: () => import('highlight.js/lib/languages/scss'),
  sql: () => import('highlight.js/lib/languages/sql'),
  swift: () => import('highlight.js/lib/languages/swift'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  xml: () => import('highlight.js/lib/languages/xml'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
};

/** Canonical ids that highlight.js covers with a related grammar. */
const GRAMMAR_FOR: Record<string, string> = {
  jsx: 'javascript',
  tsx: 'typescript',
  jsonc: 'json',
  html: 'xml',
  vue: 'xml', // template markup only; use the Shiki adapter for full SFC highlighting
  svelte: 'xml',
  toml: 'ini',
  dotenv: 'bash',
};

/** Grammars that embed others (sub-languages) and should load them too. */
const DEPENDENCIES: Record<string, string[]> = { markdown: ['xml'], php: ['xml'] };

export interface HighlightJsAdapterOptions {
  /**
   * Your own highlight.js instance (e.g. `import hljs from 'highlight.js'` with every language registered).
   * Default: a private instance of `highlight.js/lib/core` that loads grammars on demand.
   */
  hljs?: HLJSApi;
  /** Additional grammars registered immediately: id → highlight.js language function. */
  languages?: Record<string, LanguageFn>;
  /** Additional grammars loaded on first use: id → `() => import('...')` resolving to `{ default: LanguageFn }`. */
  loaders?: Record<string, Loader>;
  /** Restrict `language="auto"` detection to these grammars (default: every loaded grammar). */
  detectLanguages?: string[];
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'" };
const HTML_TOKEN = /<span class="([^"]*)">|<\/span>|&(?:amp|lt|gt|quot|#x27|#39);|\n|[^<&\n]+/g;

/** Converts highlight.js HTML output into per-line tokens (scopes carry over line breaks). */
export function hljsHtmlToLines(html: string): TokenLine[] {
  const lines: TokenLine[] = [[]];
  const stack: string[] = [];
  const push = (text: string) => {
    const line = lines[lines.length - 1];
    const className = stack[stack.length - 1];
    const last = line[line.length - 1];
    if (last && last.className === className) last.text += text;
    else line.push(className ? { text, className } : { text });
  };
  HTML_TOKEN.lastIndex = 0;
  for (let m = HTML_TOKEN.exec(html); m; m = HTML_TOKEN.exec(html)) {
    const s = m[0];
    if (m[1] !== undefined) stack.push(m[1]);
    else if (s === '</span>') stack.pop();
    else if (s === '\n') lines.push([]);
    else push(s[0] === '&' ? ENTITIES[s] : s);
  }
  return lines;
}

/**
 * A `SyntaxHighlighter` backed by highlight.js (~190 languages, synchronous, no WebAssembly).
 * Token colours come from the m2diff stylesheet (`--m2d-syn-*` variables), so no highlight.js theme CSS is needed.
 */
export function createHighlightJsAdapter(options: HighlightJsAdapterOptions = {}): SyntaxHighlighter {
  const hljs = options.hljs ?? hljsCore.newInstance();
  for (const [id, fn] of Object.entries(options.languages ?? {})) hljs.registerLanguage(id, fn);
  const custom = options.loaders ?? {};
  const loading = new Map<string, Promise<void>>();
  const loaderFor = (grammar: string): Loader | undefined => custom[grammar] ?? LOADERS[grammar];

  const adapter: SyntaxHighlighter = {
    name: 'highlight.js',
    resolve(language) {
      const id = resolveLanguage(language);
      if (id === 'plaintext' || id === 'csv' || id === 'log') return null;
      if (custom[id] || hljs.getLanguage(id)) return id;
      const grammar = GRAMMAR_FOR[id] ?? id;
      return hljs.getLanguage(grammar) || LOADERS[grammar] ? grammar : null;
    },
    isLoaded: (grammar) => !!hljs.getLanguage(grammar),
    load(grammar) {
      if (hljs.getLanguage(grammar)) return Promise.resolve();
      let p = loading.get(grammar);
      if (!p) {
        const loader = loaderFor(grammar);
        if (!loader) return Promise.reject(new Error(`highlight.js: no grammar for "${grammar}"`));
        p = Promise.all([loader(), ...(DEPENDENCIES[grammar] ?? []).map((d) => (hljs.getLanguage(d) ? null : LOADERS[d]?.()))]).then(
          ([main, ...deps]) => {
            (DEPENDENCIES[grammar] ?? []).forEach((d, i) => {
              const dep = deps[i];
              if (dep && !hljs.getLanguage(d)) hljs.registerLanguage(d, dep.default);
            });
            hljs.registerLanguage(grammar, main.default);
          },
        );
        p.catch(() => loading.delete(grammar));
        loading.set(grammar, p);
      }
      return p;
    },
    tokenize(code, grammar) {
      return hljsHtmlToLines(hljs.highlight(code, { language: grammar, ignoreIllegals: true }).value);
    },
    detect(code) {
      const loaded = hljs.listLanguages();
      const subset = options.detectLanguages ? options.detectLanguages.filter((l) => loaded.includes(l)) : loaded;
      if (!subset.length) return null;
      const res = hljs.highlightAuto(code.slice(0, 20_000), subset);
      // Require a clear winner: weak or tied guesses are worse than plain text.
      return res.language && res.relevance >= 3 && res.relevance > (res.secondBest?.relevance ?? 0) ? res.language : null;
    },
    languages: () =>
      [...new Set([...Object.keys(LOADERS), ...Object.keys(GRAMMAR_FOR), ...Object.keys(custom), ...hljs.listLanguages()])].sort(),
  };
  return adapter;
}

export type { SyntaxHighlighter, SyntaxToken };
