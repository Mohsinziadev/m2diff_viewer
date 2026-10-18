import { resolveLanguage } from '../core/languages';
import type { SyntaxHighlighter, TokenLine } from '../core/highlight';

/**
 * The parts of a Shiki highlighter this adapter uses. Declared structurally so `m2diff-viewer` has no
 * dependency on Shiki: create the highlighter yourself (`createHighlighter` from `shiki`, or a
 * fine-grained `createHighlighterCore` bundle) and pass it in.
 */
export interface ShikiHighlighterLike {
  // Option types are `never` so Shiki's narrow literal unions (bundled language/theme names) are accepted.
  codeToTokensWithThemes(
    code: string,
    options: { lang: never; themes: never },
  ): Array<Array<{ content: string; variants: Record<string, { color?: string; fontStyle?: number }> }>>;
  getLoadedLanguages(): string[];
  loadLanguage(...langs: never[]): Promise<void>;
}

export interface ShikiAdapterOptions {
  /** Themes already loaded in the highlighter, used for light and dark mode. */
  themes: { light: string; dark: string };
  /** Overrides from canonical language ids to Shiki language ids. */
  languageMap?: Record<string, string>;
}

const SHIKI_IDS: Record<string, string> = {
  objectivec: 'objective-c',
  makefile: 'make',
  dockerfile: 'docker',
};

/**
 * A `SyntaxHighlighter` backed by Shiki (TextMate grammars, VS Code-accurate colours). Languages not yet
 * loaded are loaded on demand via `highlighter.loadLanguage`; anything Shiki cannot load is shown as plain text.
 */
export function createShikiAdapter(highlighter: ShikiHighlighterLike, options: ShikiAdapterOptions): SyntaxHighlighter {
  const map = { ...SHIKI_IDS, ...options.languageMap };
  const themes = { light: options.themes.light, dark: options.themes.dark };
  const failed = new Set<string>();
  return {
    name: 'shiki',
    resolve(language) {
      const id = resolveLanguage(language);
      if (id === 'plaintext' || id === 'text') return null;
      const lang = map[id] ?? id;
      return failed.has(lang) ? null : lang;
    },
    isLoaded: (lang) => highlighter.getLoadedLanguages().includes(lang),
    async load(lang) {
      try {
        await highlighter.loadLanguage(lang as never);
      } catch (e) {
        failed.add(lang);
        throw e;
      }
    },
    tokenize(code, lang): TokenLine[] {
      return highlighter.codeToTokensWithThemes(code, { lang: lang as never, themes: themes as never }).map((line) =>
        line.map((t) => {
          const light = t.variants.light ?? {};
          const dark = t.variants.dark ?? {};
          return {
            text: t.content,
            color: light.color,
            darkColor: dark.color,
            fontStyle: light.fontStyle && light.fontStyle > 0 ? light.fontStyle : undefined,
          };
        }),
      );
    },
    languages: () => highlighter.getLoadedLanguages().slice().sort(),
  };
}
