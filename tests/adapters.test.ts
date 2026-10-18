import { createHighlighter } from 'shiki';
import { describe, expect, it } from 'vitest';
import { tokenizeLines } from '../src/core';
import { createHighlightJsAdapter, hljsHtmlToLines } from '../src/highlight-js';
import { createShikiAdapter } from '../src/shiki';

describe('hljsHtmlToLines', () => {
  it('decodes entities and carries scopes across line breaks', () => {
    const lines = hljsHtmlToLines('<span class="hljs-comment">/* a &lt; b\n &amp;&amp; c */</span> x &quot;&#x27;');
    expect(lines).toEqual([
      [{ text: '/* a < b', className: 'hljs-comment' }],
      [{ text: ' && c */', className: 'hljs-comment' }, { text: ' x "\'' }],
    ]);
  });
});

describe('highlight.js adapter', () => {
  const hl = createHighlightJsAdapter();

  it('resolves languages, aliases and related grammars; unknown languages fall back', () => {
    expect(hl.resolve('ts')).toBe('typescript');
    expect(hl.resolve('tsx')).toBe('typescript');
    expect(hl.resolve('vue')).toBe('xml');
    expect(hl.resolve('yml')).toBe('yaml');
    expect(hl.resolve('plaintext')).toBeNull();
    expect(hl.resolve('klingon')).toBeNull();
  });

  it('loads every bundled grammar on demand and tokenizes it', async () => {
    const samples: Record<string, string> = {
      typescript: 'const x: number = 1; // n',
      python: 'def f(x):\n    return x  # n',
      go: 'func main() { fmt.Println("hi") }',
      rust: 'fn main() { let x = 5; }',
      sql: 'SELECT id FROM users WHERE id = 1;',
      css: '.a { color: red; }',
      yaml: 'key: value # c',
      json: '{"a": [1, true, null]}',
      markdown: '# Title\n\n<b>html</b>',
      php: '<?php echo "hi"; ?>',
    };
    for (const id of hl.languages!()) {
      const grammar = hl.resolve(id);
      if (!grammar) continue;
      await hl.load(grammar);
      expect(hl.isLoaded(grammar)).toBe(true);
    }
    for (const [lang, code] of Object.entries(samples)) {
      const lines = code.split('\n');
      const tokens = tokenizeLines(hl, lines, lang)!;
      expect(tokens).toHaveLength(lines.length);
      tokens.forEach((t, i) => expect(t!.map((x) => x.text).join('')).toBe(lines[i]));
      expect(tokens.flat().some((t) => t?.className?.startsWith('hljs-'))).toBe(true);
    }
  });

  it('keeps multi-line comments highlighted on every line', async () => {
    await hl.load('javascript');
    const t = tokenizeLines(hl, ['/* start', 'middle', 'end */ let x;'], 'js')!;
    expect(t[1]).toEqual([{ text: 'middle', className: 'hljs-comment' }]);
  });

  it('rejects loading unknown grammars and accepts custom ones', async () => {
    await expect(hl.load('klingon')).rejects.toThrow(/no grammar/);
    const klingon = () => ({ name: 'Klingon', keywords: { keyword: 'Qapla' }, contains: [] });
    const eager = createHighlightJsAdapter({ languages: { klingon } });
    expect(eager.resolve('klingon')).toBe('klingon');
    expect(eager.isLoaded('klingon')).toBe(true);
    expect(tokenizeLines(eager, ['Qapla x'], 'klingon')![0]![0]).toEqual({ text: 'Qapla', className: 'hljs-keyword' });
    const lazy = createHighlightJsAdapter({ loaders: { klingon: async () => ({ default: klingon }) } });
    expect(lazy.resolve('klingon')).toBe('klingon');
    expect(lazy.isLoaded('klingon')).toBe(false);
    await lazy.load('klingon');
    expect(tokenizeLines(lazy, ['Qapla'], 'klingon')![0]![0].className).toBe('hljs-keyword');
  });

  it('detects languages among the configured candidates', async () => {
    const detector = createHighlightJsAdapter({ detectLanguages: ['python', 'javascript', 'sql'] });
    expect(detector.detect!('x = 1')).toBeNull(); // nothing loaded yet
    await Promise.all(['python', 'javascript', 'sql'].map((l) => detector.load(l)));
    expect(detector.detect!('def main():\n    import os\n    print(os.getcwd())\n    return None\n')).toBe('python');
    expect(
      detector.detect!('SELECT u.name, COUNT(o.id) AS orders\nFROM users u\nLEFT JOIN orders o ON o.user_id = u.id\nGROUP BY u.name;'),
    ).toBe('sql');
    expect(detector.detect!('hello')).toBeNull();
  });
});

describe('Shiki adapter', () => {
  it('tokenizes with light and dark colours and loads languages on demand', async () => {
    const shiki = await createHighlighter({ themes: ['github-light', 'github-dark'], langs: [] });
    const hl = createShikiAdapter(shiki, { themes: { light: 'github-light', dark: 'github-dark' } });
    const grammar = hl.resolve('rs')!;
    expect(grammar).toBe('rust');
    expect(hl.isLoaded(grammar)).toBe(false);
    await hl.load(grammar);
    const tokens = tokenizeLines(hl, ['fn main() {', '    let x = 5;', '}'], 'rust')!;
    expect(tokens).toHaveLength(3);
    const kw = tokens[0]!.find((t) => t.text.includes('fn'))!;
    expect(kw.color).toMatch(/^#/);
    expect(kw.darkColor).toMatch(/^#/);
    expect(kw.color).not.toBe(kw.darkColor);
    expect(hl.resolve('plaintext')).toBeNull();
    await expect(hl.load('not-a-language')).rejects.toBeTruthy();
    expect(hl.resolve('not-a-language')).toBeNull();
    shiki.dispose();
  });
});
