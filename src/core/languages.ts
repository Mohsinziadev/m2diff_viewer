/**
 * Canonical language ids, labels, aliases and file extensions. The diff engine never needs a language;
 * this only helps pick a highlighter grammar. Unknown names are passed through unchanged, so
 * highlighters can support languages that are not listed here.
 */
export interface LanguageInfo {
  id: string;
  label: string;
  aliases?: string[];
  extensions?: string[];
  filenames?: string[];
}

export const LANGUAGES: readonly LanguageInfo[] = [
  { id: 'plaintext', label: 'Plain text', aliases: ['text', 'txt', 'plain'], extensions: ['txt', 'text'] },
  { id: 'javascript', label: 'JavaScript', aliases: ['js', 'node', 'mjs', 'cjs'], extensions: ['js', 'mjs', 'cjs'] },
  { id: 'jsx', label: 'JSX', extensions: ['jsx'] },
  { id: 'typescript', label: 'TypeScript', aliases: ['ts', 'mts', 'cts'], extensions: ['ts', 'mts', 'cts'] },
  { id: 'tsx', label: 'TSX', extensions: ['tsx'] },
  { id: 'json', label: 'JSON', extensions: ['json', 'map', 'webmanifest'], filenames: ['.prettierrc', '.babelrc'] },
  {
    id: 'jsonc',
    label: 'JSON with comments',
    aliases: ['json5'],
    extensions: ['jsonc', 'json5'],
    filenames: ['tsconfig.json', 'jsconfig.json'],
  },
  { id: 'yaml', label: 'YAML', aliases: ['yml'], extensions: ['yaml', 'yml'] },
  { id: 'toml', label: 'TOML', extensions: ['toml'], filenames: ['Cargo.lock'] },
  { id: 'xml', label: 'XML', aliases: ['svg', 'xsd', 'xsl', 'plist'], extensions: ['xml', 'svg', 'xsd', 'xsl', 'plist', 'csproj'] },
  { id: 'html', label: 'HTML', aliases: ['htm', 'xhtml'], extensions: ['html', 'htm', 'xhtml'] },
  { id: 'css', label: 'CSS', extensions: ['css'] },
  { id: 'scss', label: 'SCSS', extensions: ['scss'] },
  { id: 'less', label: 'Less', extensions: ['less'] },
  { id: 'markdown', label: 'Markdown', aliases: ['md', 'mdx'], extensions: ['md', 'markdown', 'mdx'] },
  { id: 'python', label: 'Python', aliases: ['py', 'py3'], extensions: ['py', 'pyi', 'pyw'] },
  { id: 'java', label: 'Java', extensions: ['java'] },
  { id: 'kotlin', label: 'Kotlin', aliases: ['kt'], extensions: ['kt', 'kts'] },
  { id: 'scala', label: 'Scala', extensions: ['scala', 'sc'] },
  { id: 'c', label: 'C', aliases: ['h'], extensions: ['c', 'h'] },
  { id: 'cpp', label: 'C++', aliases: ['c++', 'cc', 'hpp', 'cxx'], extensions: ['cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx'] },
  { id: 'csharp', label: 'C#', aliases: ['cs', 'c#'], extensions: ['cs', 'csx'] },
  { id: 'objectivec', label: 'Objective-C', aliases: ['objc'], extensions: ['m', 'mm'] },
  { id: 'swift', label: 'Swift', extensions: ['swift'] },
  { id: 'go', label: 'Go', aliases: ['golang'], extensions: ['go'] },
  { id: 'rust', label: 'Rust', aliases: ['rs'], extensions: ['rs'] },
  { id: 'php', label: 'PHP', extensions: ['php', 'phtml'] },
  { id: 'ruby', label: 'Ruby', aliases: ['rb'], extensions: ['rb', 'rake', 'gemspec'], filenames: ['Gemfile', 'Rakefile'] },
  { id: 'perl', label: 'Perl', aliases: ['pl'], extensions: ['pl', 'pm'] },
  { id: 'lua', label: 'Lua', extensions: ['lua'] },
  { id: 'r', label: 'R', extensions: ['r'] },
  { id: 'dart', label: 'Dart', extensions: ['dart'] },
  { id: 'elixir', label: 'Elixir', aliases: ['ex'], extensions: ['ex', 'exs'] },
  { id: 'haskell', label: 'Haskell', aliases: ['hs'], extensions: ['hs'] },
  { id: 'sql', label: 'SQL', aliases: ['mysql', 'postgres', 'postgresql', 'pgsql', 'sqlite'], extensions: ['sql'] },
  { id: 'graphql', label: 'GraphQL', aliases: ['gql'], extensions: ['graphql', 'gql'] },
  {
    id: 'bash',
    label: 'Bash',
    aliases: ['sh', 'shell', 'zsh', 'shellscript'],
    extensions: ['sh', 'bash', 'zsh'],
    filenames: ['.bashrc', '.zshrc'],
  },
  { id: 'powershell', label: 'PowerShell', aliases: ['ps', 'ps1', 'pwsh'], extensions: ['ps1', 'psm1'] },
  { id: 'dockerfile', label: 'Dockerfile', aliases: ['docker'], extensions: ['dockerfile'], filenames: ['Dockerfile', 'Containerfile'] },
  { id: 'makefile', label: 'Makefile', aliases: ['make', 'mk'], extensions: ['mk', 'mak'], filenames: ['Makefile', 'GNUmakefile'] },
  { id: 'nginx', label: 'Nginx', aliases: ['nginxconf'], filenames: ['nginx.conf'] },
  { id: 'ini', label: 'INI', aliases: ['properties', 'cfg', 'conf'], extensions: ['ini', 'cfg', 'conf', 'properties', 'editorconfig'] },
  { id: 'dotenv', label: '.env', aliases: ['env'], extensions: ['env'], filenames: ['.env'] },
  { id: 'vue', label: 'Vue', extensions: ['vue'] },
  { id: 'svelte', label: 'Svelte', extensions: ['svelte'] },
  { id: 'diff', label: 'Diff', aliases: ['patch'], extensions: ['diff', 'patch'] },
  { id: 'csv', label: 'CSV', aliases: ['tsv'], extensions: ['csv', 'tsv'] },
  { id: 'log', label: 'Log', extensions: ['log'] },
];

const byName = new Map<string, LanguageInfo>();
const byExt = new Map<string, LanguageInfo>();
const byFile = new Map<string, LanguageInfo>();
for (const l of LANGUAGES) {
  byName.set(l.id, l);
  for (const a of l.aliases ?? []) byName.set(a, l);
  for (const e of l.extensions ?? []) byExt.set(e, l);
  for (const f of l.filenames ?? []) byFile.set(f.toLowerCase(), l);
}

/** Canonical id for a language name or alias (`ts` → `typescript`); unknown names are lower-cased and returned. */
export function resolveLanguage(name: string | null | undefined): string {
  if (!name) return 'plaintext';
  const key = name.trim().toLowerCase();
  return byName.get(key)?.id ?? key;
}

export function getLanguageInfo(name: string): LanguageInfo | undefined {
  return byName.get(resolveLanguage(name));
}

/** Display label for a language id (falls back to the id). */
export function languageLabel(name: string): string {
  return getLanguageInfo(name)?.label ?? name;
}

/** Guesses a language from a file name or path (`src/app.tsx` → `tsx`, `.env.local` → `dotenv`). */
export function languageFromFilename(filename: string | null | undefined): string | undefined {
  if (!filename) return undefined;
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const lower = base.toLowerCase();
  const exact = byFile.get(lower);
  if (exact) return exact.id;
  if (lower === '.env' || lower.startsWith('.env.')) return 'dotenv';
  if (lower.startsWith('dockerfile')) return 'dockerfile';
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return undefined;
  return byExt.get(lower.slice(dot + 1))?.id;
}
