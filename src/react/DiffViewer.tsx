'use client';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import type { Differ } from '../core/async';
import { buildDisplayItems, computeFolds, foldContaining, type DisplayItem, type FoldRegion } from '../core/fold';
import type { SyntaxHighlighter } from '../core/highlight';
import { buildInlineItems } from '../core/inline';
import { languageFromFilename, languageLabel, resolveLanguage, LANGUAGES } from '../core/languages';
import { applyChange } from '../core/merge';
import { createUnifiedPatch, type PatchOptions } from '../core/patch';
import { createDiffReport, type DiffReport } from '../core/report';
import { searchDiff, type SearchMatch, type SearchScope } from '../core/search';
import { describeEol, visualLength } from '../core/text';
import type { DiffChange, DiffOptions, DiffResult, DiffSide, IntralineMode, LineEndingMode, WhitespaceMode } from '../core/types';
import { IconButton, OverviewRuler, Popover, SearchBar, Select, type OverviewHandle, type OverviewMarker } from './chrome';
import { IconArrowDown, IconArrowUp, IconCheck, IconExport, IconFold, IconSearch, IconSettings, IconUnfold, IconWarning } from './icons';
import { useDiff } from './useDiff';
import { useSyntaxTokens } from './useSyntaxTokens';
import { copyText, cx, describeBinding, downloadText, matchesBinding, useControllableState } from './utils';
import { CONNECTOR_WIDTH, InlineView, PatchView, SplitView, type ViewHandle, type ViewportInfo } from './views';

export type ViewMode = 'split' | 'inline' | 'unified';
export type ViewModeSetting = ViewMode | 'auto';
export type ThemeSetting = 'light' | 'dark' | 'auto';

export type DiffAction = 'nextChange' | 'previousChange' | 'openSearch' | 'nextMatch' | 'previousMatch';
export type KeyBindings = Record<DiffAction, string[]>;

/** Default shortcuts; active while focus is inside the viewer. `Mod` is ⌘ on macOS, Ctrl elsewhere. */
export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  nextChange: ['F7', 'Alt+ArrowDown'],
  previousChange: ['Shift+F7', 'Alt+ArrowUp'],
  openSearch: ['Mod+F'],
  nextMatch: ['F3', 'Mod+G'],
  previousMatch: ['Shift+F3', 'Mod+Shift+G'],
};

export interface ToolbarOptions {
  /** Previous/next difference buttons. */
  navigation?: boolean;
  /** Side-by-side / inline / unified selector. */
  view?: boolean;
  /** Whitespace handling selector. */
  whitespace?: boolean;
  /** Word / character / line highlighting selector. */
  intraline?: boolean;
  /** Collapse-unchanged toggle. */
  collapse?: boolean;
  /** Settings popover (case, line endings, context lines, scroll sync). */
  settings?: boolean;
  search?: boolean;
  /** Copy/download menu. */
  export?: boolean;
  /** Language picker (default: shown when a highlighter is set). */
  language?: boolean;
  /** "N differences" summary. */
  summary?: boolean;
}

export type ExportAction = 'copy-original' | 'copy-modified' | 'copy-patch' | 'download-diff' | 'download-patch' | 'download-report';

export interface ExportEvent {
  action: ExportAction;
  /** Text that will be copied or saved. */
  content: string;
  /** File name for downloads. */
  filename?: string;
  result: DiffResult;
}

export interface NavigateEvent {
  changeIndex: number;
  change: DiffChange;
}

export interface ApplyChangeEvent {
  changeIndex: number;
  change: DiffChange;
  /** The side that receives the other side's lines. */
  target: DiffSide;
  /** Full new text of `target` after the change is copied over. */
  text: string;
  result: DiffResult;
}

export type DiffViewerSlot = 'root' | 'toolbar' | 'header' | 'body' | 'row' | 'statusBar';

export interface DiffViewerProps {
  /** Original text. `null`/`undefined` means the file did not exist (shown as fully added). */
  original: string | null | undefined;
  /** Modified text. `null`/`undefined` means the file was deleted. */
  modified: string | null | undefined;
  /** File names: shown in headers, used in patch headers and to infer the language. */
  originalName?: string;
  modifiedName?: string;
  /** Custom header content (defaults to the file names, or "Original"/"Modified"). */
  originalLabel?: ReactNode;
  modifiedLabel?: ReactNode;

  /** Language id or alias (`typescript`, `ts`, `py`…), or `auto` to let the highlighter detect it. Controlled when set together with `onLanguageChange`. */
  language?: string;
  onLanguageChange?: (language: string) => void;
  /** Syntax highlighter (see `m2diff-viewer/highlight-js` and `m2diff-viewer/shiki`). Without one, text is shown plain. */
  highlighter?: SyntaxHighlighter | null;
  /** Documents up to this many lines are highlighted as a whole; longer ones only for visible lines. Default 10 000. */
  highlightLimit?: number;

  /**
   * Controlled view mode. Use with `onViewChange`; omit for uncontrolled (`defaultView`, default `auto`:
   * side-by-side when the viewer is at least 720px wide, inline below).
   */
  view?: ViewModeSetting;
  defaultView?: ViewModeSetting;
  onViewChange?: (view: ViewModeSetting) => void;

  /** Controlled comparison options (whitespace, case, line endings, intraline, limits). */
  options?: DiffOptions;
  defaultOptions?: DiffOptions;
  onOptionsChange?: (options: DiffOptions) => void;
  /** Compare asynchronously with a custom function, e.g. a Web Worker (`createWorkerDiffer`). */
  differ?: Differ;

  /** Collapse unchanged regions (initial state; the toolbar can toggle it). Default true. */
  collapseUnchanged?: boolean;
  /** Unchanged lines kept around each change when collapsing. Default 3. */
  contextLines?: number;
  /** Smallest region worth collapsing. Default 4. */
  minCollapsedLines?: number;
  showLineNumbers?: boolean;
  /** Change overview along the right edge. Default true. */
  overview?: boolean;
  /** Bands and » / « arrows between the side-by-side panes linking each change to its counterpart. Default true. */
  connectors?: boolean;
  /**
   * Turns the connector arrows into buttons: » copies a change from the original into the modified
   * text, « the other way. The viewer is controlled, so update `original`/`modified` with `event.text`.
   */
  onApplyChange?: (event: ApplyChangeEvent) => void;
  /** Sync horizontal scrolling of the two panes (initial state). Default true. */
  syncHorizontalScroll?: boolean;

  /** `true` (default) shows the full toolbar; `false` hides it; an object picks individual controls. */
  toolbar?: boolean | ToolbarOptions;
  /** Extra toolbar content, rendered at the end. */
  toolbarEnd?: ReactNode;
  statusBar?: boolean;
  /** Replace the file header row. Return `null` to hide it. */
  renderHeader?: (info: { result: DiffResult | null; view: ViewMode }) => ReactNode;
  renderFoldLabel?: (fold: FoldRegion) => ReactNode;

  theme?: ThemeSetting;
  /** CSS height of the viewer, e.g. `600` or `'70vh'`. `'auto'` grows with content (no virtualisation). Default 560px. */
  height?: number | string;
  /** Row height in pixels (keep in sync with `--m2d-row-h` if you restyle fonts). Default 20. */
  rowHeight?: number;
  /** Render only visible rows. `auto` (default) enables it above 400 rows. */
  virtualize?: boolean | 'auto';
  /** Override shortcuts, or `false` to disable them. */
  keyBindings?: Partial<KeyBindings> | false;

  className?: string;
  classNames?: Partial<Record<DiffViewerSlot, string>>;
  style?: CSSProperties;
  /** Accessible name of the viewer region. */
  'aria-label'?: string;

  /** Called with each new comparison result. */
  onDiff?: (result: DiffResult) => void;
  onError?: (error: Error) => void;
  onNavigate?: (event: NavigateEvent) => void;
  /** Called before copying or downloading. Return `false` to handle it yourself. */
  onExport?: (event: ExportEvent) => boolean | void;
}

/** Imperative API (via `ref`) for building custom toolbars around a minimal viewer. */
export interface DiffViewerHandle {
  readonly result: DiffResult | null;
  nextChange(): void;
  previousChange(): void;
  goToChange(index: number): void;
  expandAll(): void;
  collapseAll(): void;
  openSearch(query?: string): void;
  getUnifiedPatch(options?: PatchOptions): string;
  getReport(): DiffReport | null;
}

const EMPTY_SET: ReadonlySet<number> = new Set();
const PATCH_ACTIONS: ReadonlySet<ExportAction> = new Set(['copy-patch', 'download-diff', 'download-patch']);
const AUTO_VIRTUALIZE_ROWS = 400;
const NARROW_WIDTH = 720;

const WHITESPACE_OPTIONS: ReadonlyArray<{ value: WhitespaceMode; label: string }> = [
  { value: 'none', label: 'Do not ignore' },
  { value: 'trim', label: 'Trim whitespace' },
  { value: 'collapse', label: 'Ignore whitespace changes' },
  { value: 'all', label: 'Ignore all whitespace' },
];
const INTRALINE_OPTIONS: ReadonlyArray<{ value: IntralineMode; label: string }> = [
  { value: 'word', label: 'Highlight words' },
  { value: 'char', label: 'Highlight characters' },
  { value: 'none', label: 'Highlight lines' },
];
const VIEW_OPTIONS: ReadonlyArray<{ value: ViewModeSetting; label: string }> = [
  { value: 'split', label: 'Side-by-side' },
  { value: 'inline', label: 'Inline' },
  { value: 'unified', label: 'Unified patch' },
  { value: 'auto', label: 'Auto' },
];

const baseName = (name: string | undefined) => (name ? (name.split(/[\\/]/).pop() ?? name) : undefined);

export const DiffViewer = forwardRef<DiffViewerHandle, DiffViewerProps>(function DiffViewer(props, ref) {
  const {
    original,
    modified,
    originalName,
    modifiedName,
    highlighter,
    highlightLimit = 10_000,
    differ,
    contextLines: contextProp = 3,
    minCollapsedLines = 4,
    showLineNumbers = true,
    overview = true,
    connectors = true,
    theme = 'auto',
    height,
    rowHeight = 20,
    virtualize = 'auto',
    statusBar = true,
    classNames = {},
    onDiff,
    onError,
    onNavigate,
    onExport,
    onApplyChange,
  } = props;

  // ——— state ————————————————————————————————————————————————————
  const [viewSetting, setView, viewSettable] = useControllableState<ViewModeSetting>(
    props.view,
    props.defaultView ?? 'auto',
    props.onViewChange,
  );
  const [options, setOptions, optionsSettable] = useControllableState<DiffOptions>(
    props.options,
    props.defaultOptions ?? {},
    props.onOptionsChange,
  );
  const inferredLanguage = useMemo(
    () => languageFromFilename(modifiedName) ?? languageFromFilename(originalName) ?? 'plaintext',
    [originalName, modifiedName],
  );
  const [languageSetting, setLanguage, languageSettable] = useControllableState<string>(
    props.onLanguageChange ? props.language : undefined,
    props.language ?? inferredLanguage,
    props.onLanguageChange,
  );
  const [collapse, setCollapse] = useState(props.collapseUnchanged ?? true);
  const [contextLines, setContextLines] = useState(contextProp);
  const [syncHorizontal, setSyncHorizontal] = useState(props.syncHorizontalScroll ?? true);
  const [ratio, setRatio] = useState(0.5);
  const [width, setWidth] = useState(0);
  const [activeChange, setActiveChange] = useState(-1);
  const [activeHunk, setActiveHunk] = useState(-1);
  const [announcement, setAnnouncement] = useState('');
  const [copied, setCopied] = useState<ExportAction | null>(null);
  const [search, setSearch] = useState({
    open: false,
    query: '',
    scope: 'both' as SearchScope,
    caseSensitive: false,
    regex: false,
    wholeWord: false,
    active: 0,
  });

  // Props that seed internal state also update it when they change.
  const [seen, setSeen] = useState({
    collapse: props.collapseUnchanged,
    context: contextProp,
    sync: props.syncHorizontalScroll,
    language: props.language,
  });
  if (
    seen.collapse !== props.collapseUnchanged ||
    seen.context !== contextProp ||
    seen.sync !== props.syncHorizontalScroll ||
    seen.language !== props.language
  ) {
    setSeen({ collapse: props.collapseUnchanged, context: contextProp, sync: props.syncHorizontalScroll, language: props.language });
    if (seen.collapse !== props.collapseUnchanged) setCollapse(props.collapseUnchanged ?? true);
    if (seen.context !== contextProp) setContextLines(contextProp);
    if (seen.sync !== props.syncHorizontalScroll) setSyncHorizontal(props.syncHorizontalScroll ?? true);
    if (seen.language !== props.language && !props.onLanguageChange && props.language !== undefined) setLanguage(props.language);
  }

  const rootRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ViewHandle>(null);
  const overviewRef = useRef<OverviewHandle>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  // ——— comparison ———————————————————————————————————————————————
  const { result, pending, error } = useDiff(original, modified, { options, differ });

  useEffect(() => {
    if (result) onDiff?.(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);
  useEffect(() => {
    if (error) onError?.(error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  // Container width for `auto` view (narrow screens read better inline).
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const view: ViewMode = viewSetting === 'auto' ? (width && width < NARROW_WIDTH ? 'inline' : 'split') : viewSetting;

  // ——— language & highlighting —————————————————————————————————————
  const detected = useMemo(() => {
    if (languageSetting !== 'auto' || !highlighter?.detect) return null;
    const sample = (modified ?? original ?? '').slice(0, 20_000);
    try {
      return sample ? highlighter.detect(sample) : null;
    } catch {
      return null;
    }
  }, [languageSetting, highlighter, modified, original]);
  const language = languageSetting === 'auto' ? (detected ?? 'plaintext') : resolveLanguage(languageSetting);
  const oldHl = useSyntaxTokens(result?.original.lines, language, highlighter, highlightLimit);
  const newHl = useSyntaxTokens(result?.modified.lines, language, highlighter, highlightLimit);

  // ——— folding ——————————————————————————————————————————————————
  const folds = useMemo(
    () => (result && collapse ? computeFolds(result, { contextLines, minHiddenLines: minCollapsedLines }) : []),
    [result, collapse, contextLines, minCollapsedLines],
  );
  const [expandedState, setExpandedState] = useState<{ for: unknown; ids: ReadonlySet<number> }>({ for: null, ids: EMPTY_SET });
  const expanded = expandedState.for === folds ? expandedState.ids : EMPTY_SET;
  const expandFold = useCallback(
    (id: number) => setExpandedState((s) => ({ for: folds, ids: new Set([...(s.for === folds ? s.ids : []), id]) })),
    [folds],
  );
  const expandAll = useCallback(() => setExpandedState({ for: folds, ids: new Set(folds.map((f) => f.id)) }), [folds]);
  const collapseAll = useCallback(() => {
    setCollapse(true);
    setExpandedState({ for: null, ids: EMPTY_SET });
  }, []);
  const hiddenFolds = folds.filter((f) => !expanded.has(f.id)).length;

  const items: DisplayItem[] = useMemo(
    () => (result ? buildDisplayItems(result.rows.length, folds, expanded) : []),
    [result, folds, expanded],
  );
  const inlineItems = useMemo(() => (result && view === 'inline' ? buildInlineItems(result, items) : []), [result, items, view]);

  // Row → item index lookups for navigation.
  const rowToItem = useMemo(() => {
    const map = new Int32Array(result?.rows.length ?? 0).fill(-1);
    items.forEach((it, i) => {
      if (it.type === 'row') map[it.row] = i;
    });
    return map;
  }, [result, items]);
  const inlineIndex = useMemo(() => {
    const n = result?.rows.length ?? 0;
    const oldMap = new Int32Array(n).fill(-1);
    const newMap = new Int32Array(n).fill(-1);
    inlineItems.forEach((it, i) => {
      if (it.type !== 'line') return;
      if (it.kind !== 'added') oldMap[it.row] = i;
      if (it.kind !== 'removed') newMap[it.row] = i;
    });
    return { oldMap, newMap };
  }, [result, inlineItems]);

  // ——— unified patch ——————————————————————————————————————————————
  const patchOptions = useMemo<PatchOptions>(
    () => ({ oldName: originalName ?? 'original', newName: modifiedName ?? 'modified', context: contextLines }),
    [originalName, modifiedName, contextLines],
  );
  const patchLines = useMemo(() => {
    if (!result || view !== 'unified') return [];
    const text = createUnifiedPatch(result, patchOptions);
    return text ? text.slice(0, -1).split('\n') : [];
  }, [result, view, patchOptions]);
  const hunkLines = useMemo(() => patchLines.flatMap((l, i) => (l.startsWith('@@') ? [i] : [])), [patchLines]);

  // ——— search ———————————————————————————————————————————————————
  const searchResult = useMemo(
    () =>
      result && search.open && search.query
        ? searchDiff(result, search.query, {
            scope: view === 'unified' ? 'both' : search.scope,
            caseSensitive: search.caseSensitive,
            regex: search.regex,
            wholeWord: search.wholeWord,
          })
        : { matches: [] as SearchMatch[], truncated: false, error: undefined },
    [result, search.open, search.query, search.scope, search.caseSensitive, search.regex, search.wholeWord, view],
  );
  const matches = searchResult.matches;
  const activeMatchIndex = matches.length ? Math.min(search.active, matches.length - 1) : -1;
  const activeMatch = activeMatchIndex >= 0 ? matches[activeMatchIndex] : null;
  const matchesByRow = useMemo(() => {
    const map = new Map<number, SearchMatch[]>();
    for (const m of matches) {
      const list = map.get(m.row);
      if (list) list.push(m);
      else map.set(m.row, [m]);
    }
    return map;
  }, [matches]);

  // ——— navigation ———————————————————————————————————————————————
  const pendingReveal = useRef<{ row: number; side?: 'original' | 'modified' } | null>(null);

  const scrollToRow = useCallback(
    (row: number, side?: 'original' | 'modified') => {
      if (view === 'split') {
        const idx = rowToItem[row];
        if (idx >= 0) viewRef.current?.scrollToItem(idx);
      } else if (view === 'inline') {
        const idx =
          side === 'original'
            ? inlineIndex.oldMap[row]
            : side === 'modified'
              ? inlineIndex.newMap[row]
              : Math.max(inlineIndex.oldMap[row], inlineIndex.newMap[row]);
        const any = idx >= 0 ? idx : Math.max(inlineIndex.oldMap[row], inlineIndex.newMap[row]);
        if (any >= 0) viewRef.current?.scrollToItem(any);
      }
    },
    [view, rowToItem, inlineIndex],
  );

  const reveal = useCallback(
    (row: number, side?: 'original' | 'modified') => {
      const fold = foldContaining(folds, expanded, row);
      if (fold) {
        pendingReveal.current = { row, side };
        expandFold(fold.id);
      } else scrollToRow(row, side);
    },
    [folds, expanded, expandFold, scrollToRow],
  );

  // Finish a reveal once the fold it needed is expanded.
  useEffect(() => {
    const p = pendingReveal.current;
    if (!p) return;
    pendingReveal.current = null;
    scrollToRow(p.row, p.side);
  }, [items, scrollToRow]);

  const announce = (msg: string) => setAnnouncement((prev) => (prev === msg ? msg + '​' : msg));

  const goToChange = useCallback(
    (index: number) => {
      if (!result || !result.changes.length) {
        announce('No differences');
        return;
      }
      if (view === 'unified') {
        const h = Math.max(0, Math.min(hunkLines.length - 1, index));
        setActiveHunk(h);
        viewRef.current?.scrollToItem(hunkLines[h]);
        announce(`Hunk ${h + 1} of ${hunkLines.length}`);
        return;
      }
      const i = Math.max(0, Math.min(result.changes.length - 1, index));
      const change = result.changes[i];
      setActiveChange(i);
      reveal(change.rowStart);
      const where =
        change.kind === 'added'
          ? `${change.newCount} added ${change.newCount === 1 ? 'line' : 'lines'} at line ${change.newStart}`
          : change.kind === 'removed'
            ? `${change.oldCount} removed ${change.oldCount === 1 ? 'line' : 'lines'} at line ${change.oldStart}`
            : `lines ${change.oldStart}–${change.oldStart + change.oldCount - 1} changed`;
      announce(`Difference ${i + 1} of ${result.changes.length}: ${where}`);
      onNavigate?.({ changeIndex: i, change });
    },
    [result, view, hunkLines, reveal, onNavigate],
  );
  const canApply = !!onApplyChange && !!result && !result.original.truncated && !result.modified.truncated;
  const applyChangeTo = useCallback(
    (index: number, target: DiffSide) => {
      if (!result || !onApplyChange) return;
      const text = applyChange(result, index, target);
      setActiveChange(index);
      announce(`Difference ${index + 1} applied to the ${target} text`);
      onApplyChange({ changeIndex: index, change: result.changes[index], target, text, result });
    },
    [result, onApplyChange],
  );

  const current = view === 'unified' ? activeHunk : activeChange;
  const total = view === 'unified' ? hunkLines.length : (result?.changes.length ?? 0);
  const nextChange = useCallback(() => goToChange(current < 0 ? 0 : current + 1), [goToChange, current]);
  const previousChange = useCallback(() => goToChange(current < 0 ? 0 : current - 1), [goToChange, current]);

  const goToMatch = useCallback(
    (index: number) => {
      if (!matches.length) return;
      const i = ((index % matches.length) + matches.length) % matches.length;
      setSearch((s) => ({ ...s, active: i }));
      const m = matches[i];
      reveal(m.row, m.side);
    },
    [matches, reveal],
  );

  const openSearch = useCallback((query?: string) => {
    setSearch((s) => ({ ...s, open: true, query: query ?? s.query, active: 0 }));
    // Focus after the bar mounts.
    setTimeout(() => {
      searchInput.current?.focus();
      searchInput.current?.select();
    }, 0);
  }, []);
  const closeSearch = () => {
    setSearch((s) => ({ ...s, open: false }));
    viewRef.current?.focus();
  };

  // ——— export ——————————————————————————————————————————————————
  const labelText = (name: string | undefined, fallback: string) => name ?? fallback;
  const runExport = async (action: ExportAction) => {
    if (!result) return;
    const fileBase = baseName(modifiedName ?? originalName)?.replace(/\.[^.]*$/, '') || 'changes';
    let content: string;
    let filename: string | undefined;
    switch (action) {
      case 'copy-original':
        content = original ?? '';
        break;
      case 'copy-modified':
        content = modified ?? '';
        break;
      case 'copy-patch':
        content = createUnifiedPatch(result, patchOptions);
        break;
      case 'download-diff':
      case 'download-patch':
        content = createUnifiedPatch(result, patchOptions);
        filename = `${fileBase}.${action === 'download-diff' ? 'diff' : 'patch'}`;
        break;
      case 'download-report':
        content = JSON.stringify(createDiffReport(result, { original: originalName, modified: modifiedName }), null, 2) + '\n';
        filename = `${fileBase}.diff-report.json`;
        break;
    }
    if (onExport?.({ action, content, filename, result }) === false) return;
    if (filename) {
      downloadText(filename, content, action === 'download-report' ? 'application/json' : 'text/x-diff');
      announce(`Saved ${filename}`);
    } else {
      const ok = await copyText(content);
      const what = action === 'copy-original' ? 'original text' : action === 'copy-modified' ? 'modified text' : 'unified diff';
      announce(ok ? `Copied ${what}` : `Could not copy ${what}`);
      if (ok) {
        setCopied(action);
        setTimeout(() => setCopied((c) => (c === action ? null : c)), 1500);
      }
    }
  };

  // ——— keyboard ————————————————————————————————————————————————
  const bindings = useMemo<KeyBindings | null>(
    () => (props.keyBindings === false ? null : { ...DEFAULT_KEY_BINDINGS, ...props.keyBindings }),
    [props.keyBindings],
  );
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!bindings || e.defaultPrevented) return;
    const hit = (action: DiffAction) => bindings[action]?.some((b) => matchesBinding(e, b));
    let handled = true;
    if (hit('nextChange')) nextChange();
    else if (hit('previousChange')) previousChange();
    else if (hit('openSearch') && toolbarOn('search')) openSearch();
    else if (hit('nextMatch') && search.open) goToMatch(activeMatchIndex + 1);
    else if (hit('previousMatch') && search.open) goToMatch(activeMatchIndex - 1);
    else handled = false;
    if (handled) e.preventDefault();
  };

  useImperativeHandle(
    ref,
    () => ({
      get result() {
        return result;
      },
      nextChange,
      previousChange,
      goToChange,
      expandAll,
      collapseAll,
      openSearch,
      getUnifiedPatch: (o) => (result ? createUnifiedPatch(result, { ...patchOptions, ...o }) : ''),
      getReport: () => (result ? createDiffReport(result, { original: originalName, modified: modifiedName }) : null),
    }),
    [result, nextChange, previousChange, goToChange, expandAll, collapseAll, openSearch, patchOptions, originalName, modifiedName],
  );

  // ——— overview ————————————————————————————————————————————————
  const markers = useMemo<OverviewMarker[]>(() => {
    if (!result || !overview) return [];
    if (view === 'unified') {
      // One marker per run of added or removed patch lines (index = first line of the run).
      const out: OverviewMarker[] = [];
      const n = patchLines.length || 1;
      let prev = -2;
      for (let i = 0; i < patchLines.length; i++) {
        const line = patchLines[i];
        const c = line[0];
        if ((c !== '+' && c !== '-') || line.startsWith('+++') || line.startsWith('---')) continue;
        const kind = c === '+' ? 'added' : 'removed';
        const last = out[out.length - 1];
        if (last && last.kind === kind && prev === i - 1) last.height += 1 / n;
        else out.push({ top: i / n, height: 1 / n, kind, index: i });
        prev = i;
      }
      return out;
    }
    const totalItems = (view === 'inline' ? inlineItems.length : items.length) || 1;
    return result.changes.map((c) => {
      const first =
        view === 'inline'
          ? Math.min(...[inlineIndex.oldMap[c.rowStart], inlineIndex.newMap[c.rowStart]].filter((x) => x >= 0))
          : rowToItem[c.rowStart];
      const size = view === 'inline' ? c.oldCount + c.newCount : c.rowEnd - c.rowStart;
      return { top: first / totalItems, height: size / totalItems, kind: c.kind, index: c.index };
    });
  }, [result, overview, view, patchLines, items, inlineItems, rowToItem, inlineIndex]);

  const onViewport = useCallback((info: ViewportInfo) => overviewRef.current?.setViewport(info), []);

  // ——— derived display values ————————————————————————————————————
  const contentCh = useMemo(() => {
    const widest = (lines: string[] | undefined) => (lines ?? []).reduce((m, l) => Math.max(m, visualLength(l)), 0);
    return { original: widest(result?.original.lines), modified: widest(result?.modified.lines) };
  }, [result]);
  const itemCount = view === 'split' ? items.length : view === 'inline' ? inlineItems.length : patchLines.length;
  const autoHeight = height === 'auto';
  const shouldVirtualize = !autoHeight && (virtualize === 'auto' ? itemCount > AUTO_VIRTUALIZE_ROWS : virtualize);

  const toolbarCfg: ToolbarOptions | null =
    props.toolbar === false ? null : props.toolbar === true || props.toolbar === undefined ? {} : props.toolbar;
  function toolbarOn(key: keyof ToolbarOptions): boolean {
    if (!toolbarCfg) return false;
    const v = toolbarCfg[key];
    if (key === 'language') return v ?? !!highlighter;
    return v ?? true;
  }

  const originalTitle = props.originalLabel ?? originalName ?? 'Original';
  const modifiedTitle = props.modifiedLabel ?? modifiedName ?? 'Modified';
  const labels = {
    original: `Original: ${labelText(originalName, 'original text')}`,
    modified: `Modified: ${labelText(modifiedName, 'modified text')}`,
  };

  const stats = result?.stats;
  const summary = !result
    ? pending
      ? 'Comparing…'
      : ''
    : result.status === 'identical'
      ? 'No differences'
      : result.status === 'equivalent'
        ? 'Only ignored differences'
        : `${result.changes.length} ${result.changes.length === 1 ? 'difference' : 'differences'}`;

  const languageOptions = useMemo(() => {
    const ids = new Set<string>(['plaintext', ...(highlighter?.languages?.() ?? []), ...LANGUAGES.map((l) => l.id)]);
    if (highlighter?.detect) ids.add('auto');
    ids.add(language);
    return [...ids]
      .filter((id) => id === 'auto' || id === 'plaintext' || !highlighter || highlighter.resolve(id))
      .map((id) => ({ value: id, label: id === 'auto' ? 'Auto-detect' : languageLabel(id) }))
      .sort((a, b) => (a.value === 'auto' ? -1 : b.value === 'auto' ? 1 : a.label.localeCompare(b.label)));
  }, [highlighter, language]);

  const viewProps = {
    rowHeight,
    virtualize: shouldVirtualize,
    showLineNumbers,
    oldTokens: oldHl.source,
    newTokens: newHl.source,
    matchesByRow,
    activeMatch,
    activeChange,
    onExpandFold: expandFold,
    onViewport,
    labels,
    contentCh,
    renderFoldLabel: props.renderFoldLabel,
    rowClassName: classNames.row,
  };

  const header =
    props.renderHeader !== undefined ? (
      props.renderHeader({ result, view })
    ) : view === 'unified' ? null : (
      <div
        className={cx('m2d-header', view === 'inline' && 'm2d-header-inline', classNames.header)}
        style={
          view === 'split'
            ? { gridTemplateColumns: `minmax(0, ${ratio}fr) ${connectors ? CONNECTOR_WIDTH : 6}px minmax(0, ${1 - ratio}fr)` }
            : undefined
        }
      >
        {view === 'split' ? (
          <>
            <FileTitle title={originalTitle} missing={result ? !result.original.present : false} info={result?.original} />
            <span />
            <FileTitle title={modifiedTitle} missing={result ? !result.modified.present : false} info={result?.modified} />
          </>
        ) : (
          <span className="m2d-file">
            <span className="m2d-file-name">{originalTitle}</span>
            <span className="m2d-file-arrow" aria-hidden="true">
              →
            </span>
            <span className="m2d-file-name">{modifiedTitle}</span>
          </span>
        )}
      </div>
    );

  const warnings = result?.warnings ?? [];
  const hlNote =
    oldHl.status === 'loading' || newHl.status === 'loading'
      ? 'Loading syntax…'
      : oldHl.status === 'lazy' || newHl.status === 'lazy'
        ? 'Highlighting visible lines'
        : null;
  const eolNote = result
    ? result.original.eol === result.modified.eol
      ? describeEol(result.modified.eol)
      : `${describeEol(result.original.eol)} → ${describeEol(result.modified.eol)}`
    : '';
  const finalNewlineNote =
    result && result.original.present && result.modified.present && result.original.finalNewline !== result.modified.finalNewline
      ? result.modified.finalNewline
        ? 'Final newline added'
        : 'No newline at end of file'
      : null;

  return (
    <div
      ref={rootRef}
      className={cx('m2d-root', autoHeight && 'm2d-auto-height', props.className, classNames.root)}
      data-theme={theme}
      data-view={view}
      style={
        { ...(height !== undefined && !autoHeight ? { height } : null), '--m2d-row-h': `${rowHeight}px`, ...props.style } as CSSProperties
      }
      role="region"
      aria-label={props['aria-label'] ?? 'Comparison'}
      aria-busy={pending || undefined}
      onKeyDown={onKeyDown}
    >
      {toolbarCfg && (
        <div className={cx('m2d-toolbar', classNames.toolbar)} role="toolbar" aria-label="Comparison tools">
          {toolbarOn('navigation') && (
            <span className="m2d-group">
              <IconButton
                label={`Previous difference (${describeBinding(bindings?.previousChange[0] ?? 'Shift+F7')})`}
                onClick={previousChange}
                disabled={!total || current === 0}
              >
                <IconArrowUp />
              </IconButton>
              <IconButton
                label={`Next difference (${describeBinding(bindings?.nextChange[0] ?? 'F7')})`}
                onClick={nextChange}
                disabled={!total || current === total - 1}
              >
                <IconArrowDown />
              </IconButton>
            </span>
          )}
          {toolbarOn('view') && viewSettable && <Select label="View mode" value={viewSetting} options={VIEW_OPTIONS} onChange={setView} />}
          {toolbarOn('whitespace') && optionsSettable && (
            <Select
              label="Whitespace"
              value={options.ignoreWhitespace ?? 'none'}
              options={WHITESPACE_OPTIONS}
              onChange={(v) => setOptions({ ...options, ignoreWhitespace: v })}
            />
          )}
          {toolbarOn('intraline') && optionsSettable && view !== 'unified' && (
            <Select
              label="Change highlighting"
              value={options.intraline ?? 'word'}
              options={INTRALINE_OPTIONS}
              onChange={(v) => setOptions({ ...options, intraline: v })}
            />
          )}
          {(toolbarOn('collapse') || toolbarOn('settings')) && (
            <span className="m2d-group">
              {toolbarOn('collapse') && view !== 'unified' && (
                <IconButton
                  label={collapse && hiddenFolds ? 'Expand all unchanged lines' : 'Collapse unchanged lines'}
                  pressed={collapse && hiddenFolds > 0}
                  onClick={() => (collapse && hiddenFolds ? expandAll() : collapseAll())}
                >
                  {collapse && hiddenFolds ? <IconUnfold /> : <IconFold />}
                </IconButton>
              )}
              {toolbarOn('settings') && (
                <Popover label="Comparison settings" icon={<IconSettings />}>
                  {
                    <div className="m2d-settings">
                      {optionsSettable && (
                        <>
                          <label className="m2d-check">
                            <input
                              type="checkbox"
                              checked={!!options.ignoreCase}
                              onChange={(e) => setOptions({ ...options, ignoreCase: e.target.checked })}
                            />
                            Ignore case
                          </label>
                          <Select<LineEndingMode>
                            label="Line endings"
                            hideLabel={false}
                            value={options.lineEndings ?? 'normalize'}
                            options={[
                              { value: 'normalize', label: 'Ignore (CRLF = LF)' },
                              { value: 'preserve', label: 'Compare' },
                            ]}
                            onChange={(v) => setOptions({ ...options, lineEndings: v })}
                          />
                        </>
                      )}
                      <label className="m2d-check">
                        <input type="checkbox" checked={collapse} onChange={(e) => setCollapse(e.target.checked)} />
                        Collapse unchanged lines
                      </label>
                      <label className="m2d-number">
                        Context lines
                        <input
                          type="number"
                          min={0}
                          max={50}
                          value={contextLines}
                          onChange={(e) => setContextLines(Math.max(0, Math.min(50, Number(e.target.value) || 0)))}
                        />
                      </label>
                      {view === 'split' && (
                        <label className="m2d-check">
                          <input type="checkbox" checked={syncHorizontal} onChange={(e) => setSyncHorizontal(e.target.checked)} />
                          Sync horizontal scrolling
                        </label>
                      )}
                    </div>
                  }
                </Popover>
              )}
            </span>
          )}
          {(toolbarOn('search') || toolbarOn('export')) && (
            <span className="m2d-group">
              {toolbarOn('search') && (
                <IconButton
                  label={`Search (${describeBinding(bindings?.openSearch[0] ?? 'Mod+F')})`}
                  pressed={search.open}
                  onClick={() => (search.open ? closeSearch() : openSearch())}
                >
                  <IconSearch />
                </IconButton>
              )}
              {toolbarOn('export') && (
                <Popover label="Copy and export" icon={<IconExport />} kind="menu">
                  {
                    <div className="m2d-menu">
                      {(
                        [
                          ['copy-patch', 'Copy unified diff'],
                          ['copy-original', 'Copy original text'],
                          ['copy-modified', 'Copy modified text'],
                          ['download-diff', 'Download .diff'],
                          ['download-patch', 'Download .patch'],
                          ['download-report', 'Export statistics (JSON)'],
                        ] as const
                      ).map(([action, text]) => (
                        <button
                          key={action}
                          type="button"
                          className="m2d-menu-item"
                          disabled={!result || (PATCH_ACTIONS.has(action) && !result.changes.length)}
                          data-m2d-close={action.startsWith('download') || undefined}
                          onClick={() => void runExport(action)}
                        >
                          <span>{text}</span>
                          {copied === action && <IconCheck className="m2d-ok" />}
                        </button>
                      ))}
                    </div>
                  }
                </Popover>
              )}
            </span>
          )}
          <span className="m2d-spacer" />
          {toolbarOn('language') && languageSettable && (
            <Select
              label="Language"
              value={languageSetting === 'auto' ? 'auto' : language}
              options={languageOptions}
              onChange={setLanguage}
            />
          )}
          {props.toolbarEnd}
          {toolbarOn('summary') && (
            <span className="m2d-summary" data-status={result?.status}>
              {summary}
            </span>
          )}
        </div>
      )}

      {search.open && (
        <SearchBar
          inputRef={searchInput}
          query={search.query}
          onQuery={(q) => setSearch((s) => ({ ...s, query: q, active: 0 }))}
          scope={search.scope}
          onScope={(scope) => setSearch((s) => ({ ...s, scope, active: 0 }))}
          caseSensitive={search.caseSensitive}
          onCaseSensitive={(v) => setSearch((s) => ({ ...s, caseSensitive: v, active: 0 }))}
          regex={search.regex}
          onRegex={(v) => setSearch((s) => ({ ...s, regex: v, active: 0 }))}
          wholeWord={search.wholeWord}
          onWholeWord={(v) => setSearch((s) => ({ ...s, wholeWord: v, active: 0 }))}
          count={matches.length}
          active={activeMatchIndex}
          truncated={searchResult.truncated}
          error={searchResult.error}
          onNext={() => goToMatch(activeMatchIndex + 1)}
          onPrev={() => goToMatch(activeMatchIndex - 1)}
          onClose={closeSearch}
          showScope={view !== 'unified'}
        />
      )}

      {header}

      <div className={cx('m2d-body', classNames.body)}>
        {error && !result ? (
          <div className="m2d-error" role="alert">
            Comparison failed: {error.message}
          </div>
        ) : !result ? (
          <div className="m2d-empty">Comparing…</div>
        ) : view === 'split' ? (
          <SplitView
            ref={viewRef}
            result={result}
            items={items}
            syncHorizontal={syncHorizontal}
            ratio={ratio}
            onRatioChange={setRatio}
            connectors={connectors}
            onApplyChange={canApply ? applyChangeTo : undefined}
            {...viewProps}
          />
        ) : view === 'inline' ? (
          <InlineView ref={viewRef} result={result} items={inlineItems} {...viewProps} />
        ) : (
          <PatchView
            ref={viewRef}
            lines={patchLines}
            rowHeight={rowHeight}
            virtualize={shouldVirtualize}
            activeHunkLine={activeHunk >= 0 ? (hunkLines[activeHunk] ?? -1) : -1}
            onViewport={onViewport}
            label="Unified diff"
            rowClassName={classNames.row}
          />
        )}
        {overview && result && (
          <OverviewRuler
            ref={overviewRef}
            markers={markers}
            active={view === 'unified' ? -1 : activeChange}
            onJump={(f) => viewRef.current?.scrollToFraction(f)}
            onSelect={(i) =>
              view === 'unified' ? viewRef.current?.scrollToFraction(markers.find((m) => m.index === i)?.top ?? 0) : goToChange(i)
            }
          />
        )}
      </div>

      {statusBar && (
        <div className={cx('m2d-status', classNames.statusBar)}>
          {stats && (
            <>
              <span className="m2d-stat m2d-stat-add" title="Added lines">
                {`+${stats.additions.toLocaleString('en-US')}`}
              </span>
              <span className="m2d-stat m2d-stat-del" title="Removed lines">
                {`−${stats.deletions.toLocaleString('en-US')}`}
              </span>
              <span className="m2d-status-item">{summary}</span>
              {stats.modifiedLines > 0 && (
                <span className="m2d-status-item">
                  {stats.modifiedLines.toLocaleString('en-US')} modified {stats.modifiedLines === 1 ? 'line' : 'lines'}
                </span>
              )}
              {stats.ignoredLines > 0 && (
                <span className="m2d-status-item" title="Lines whose differences are ignored by the current options">
                  {stats.ignoredLines.toLocaleString('en-US')} ignored
                </span>
              )}
            </>
          )}
          <span className="m2d-spacer" />
          {pending && <span className="m2d-status-item">Comparing…</span>}
          {hlNote && <span className="m2d-status-item">{hlNote}</span>}
          {warnings.map((w) => (
            <span key={w.code} className="m2d-status-item m2d-warning" title={w.message}>
              <IconWarning /> {w.code === 'truncated' ? 'Truncated' : w.code === 'timeout' ? 'Simplified diff' : 'Partial highlighting'}
            </span>
          ))}
          {finalNewlineNote && <span className="m2d-status-item">{finalNewlineNote}</span>}
          {result && <span className="m2d-status-item">{languageLabel(language)}</span>}
          {result && eolNote && eolNote !== 'None' && <span className="m2d-status-item">{eolNote}</span>}
        </div>
      )}
      <div className="m2d-sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
});

function FileTitle({ title, missing, info }: { title: ReactNode; missing: boolean; info?: { lines: string[]; totalLines: number } }) {
  return (
    <span className="m2d-file">
      <span className="m2d-file-name">{title}</span>
      {missing ? (
        <span className="m2d-file-meta">(does not exist)</span>
      ) : info ? (
        <span className="m2d-file-meta">
          {info.totalLines.toLocaleString('en-US')} {info.totalLines === 1 ? 'line' : 'lines'}
        </span>
      ) : null}
    </span>
  );
}
