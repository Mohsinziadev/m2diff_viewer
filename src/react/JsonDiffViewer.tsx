'use client';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { formatJsonPath } from '../core/json/path';
import type { ValueDiffNode, ValueDiffOptions } from '../core/json/diff';
import { diffStructured, jsoncFormat, jsonFormat, type StructuredDiffResult, type StructuredFormat } from '../core/structured';
import type { DiffOptions } from '../core/types';
import { DiffViewer, type DiffViewerProps, type ThemeSetting } from './DiffViewer';
import { IconChevronRight, IconWarning } from './icons';
import { cx, useControllableState } from './utils';

export type StructuredView = 'tree' | 'text';

type Input = string | { value: unknown } | null | undefined;

export interface JsonDiffViewerProps extends ValueDiffOptions {
  /** JSON text, or `{ value }` for already-parsed data. `null`/`undefined` means missing. */
  original: Input;
  modified: Input;
  originalName?: string;
  modifiedName?: string;
  /** Accept comments and trailing commas. Ignored when `format` is given. */
  jsonc?: boolean;
  /** Any structured format (YAML, TOML, .env…) that parses to a value tree. Default JSON. */
  format?: StructuredFormat;
  /** Sort object keys in the text view so key order is not reported. Default true. */
  sortKeys?: boolean;
  /** Line-diff options for the text view. */
  textOptions?: DiffOptions;

  view?: StructuredView;
  defaultView?: StructuredView;
  onViewChange?: (view: StructuredView) => void;
  /** Show only changed paths in the tree. Default false (unchanged branches start collapsed). */
  changesOnly?: boolean;
  toolbar?: boolean;
  theme?: ThemeSetting;
  /** CSS height. Default 560px. */
  height?: number | string;
  className?: string;
  style?: CSSProperties;
  /** Props for the `DiffViewer` used by the text view (highlighter, toolbar…). */
  textViewProps?: Partial<DiffViewerProps>;
  onResult?: (result: StructuredDiffResult) => void;
}

const preview = (v: unknown, max = 120): string => {
  let s: string;
  try {
    s = v === undefined ? 'undefined' : JSON.stringify(v);
  } catch {
    s = String(v);
  }
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
};

const summary = (n: ValueDiffNode): string => {
  const t = n.newType ?? n.oldType;
  const v = n.status === 'removed' ? n.old : n.new !== undefined ? n.new : n.old;
  const count = n.children?.length ?? (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0);
  return t === 'array' ? `[${count}]` : `{${count}}`;
};

function hasChanges(n: ValueDiffNode): boolean {
  return n.status !== 'unchanged' || !!n.children?.some(hasChanges);
}

const SIGN: Record<string, string> = { added: '+', removed: '−', changed: '~', ignored: '≈', unchanged: '' };
const STATUS_TEXT: Record<string, string> = { added: 'added', removed: 'removed', changed: 'changed', ignored: 'ignored', unchanged: '' };

function TreeNode({
  node,
  depth,
  expanded,
  toggle,
  changesOnly,
}: {
  node: ValueDiffNode;
  depth: number;
  expanded: Set<string>;
  toggle: (p: string) => void;
  changesOnly: boolean;
}) {
  const path = formatJsonPath(node.path);
  const isContainer = !!node.children;
  const open = expanded.has(path);
  const keyLabel = node.key === null ? '$' : typeof node.key === 'number' ? node.key : JSON.stringify(node.key);
  const kids = node.children?.filter((c) => !changesOnly || hasChanges(c));
  const leafChanged = node.status === 'changed' && !isContainer;
  const containerTypeChange = node.oldType !== node.newType && node.status === 'changed';

  let value: ReactNode;
  if (isContainer && !containerTypeChange) value = <span className="m2d-j-summary">{summary(node)}</span>;
  else if (leafChanged || containerTypeChange || (node.status === 'ignored' && node.old !== undefined && node.new !== undefined)) {
    value = (
      <>
        <span className="m2d-j-old">{preview(node.old)}</span>
        <span className="m2d-j-arrow" aria-label="changed to">
          →
        </span>
        <span className="m2d-j-new">{preview(node.new)}</span>
      </>
    );
  } else
    value = (
      <span className={cx('m2d-j-val', `m2d-j-${node.newType ?? node.oldType}`)}>
        {preview(node.status === 'removed' ? node.old : (node.new ?? node.old))}
      </span>
    );

  return (
    <li className={cx('m2d-j-node', `m2d-j-${node.status}`, isContainer ? 'm2d-j-container' : 'm2d-j-leaf')} data-path={path}>
      <div className="m2d-j-row" style={{ paddingInlineStart: `calc(${depth} * var(--m2d-indent))` }} title={path}>
        <span className="m2d-j-sign" aria-hidden="true">
          {SIGN[node.status]}
        </span>
        {isContainer && kids && kids.length > 0 ? (
          <button
            type="button"
            className="m2d-j-toggle"
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${path}`}
            onClick={() => toggle(path)}
          >
            <IconChevronRight className={open ? 'm2d-rot' : undefined} />
          </button>
        ) : (
          <span className="m2d-j-toggle-space" />
        )}
        <span className="m2d-j-key">{keyLabel}</span>
        <span className="m2d-j-colon">:</span>
        {value}
        {node.status !== 'unchanged' && <span className={cx('m2d-badge', `m2d-badge-${node.status}`)}>{STATUS_TEXT[node.status]}</span>}
        {node.status === 'changed' && isContainer && node.changeCount > 0 && (
          <span className="m2d-j-count">{`${node.changeCount} ${node.changeCount === 1 ? 'change' : 'changes'}`}</span>
        )}
      </div>
      {isContainer && open && kids && kids.length > 0 && (
        <ul>
          {kids.map((c) => (
            <TreeNode
              key={String(c.key) + (c.oldIndex ?? '') + ':' + (c.newIndex ?? '')}
              node={c}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              changesOnly={changesOnly}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function collectPaths(node: ValueDiffNode, pred: (n: ValueDiffNode) => boolean, out: Set<string>) {
  if (!node.children) return out;
  if (pred(node)) out.add(formatJsonPath(node.path));
  for (const c of node.children) collectPaths(c, pred, out);
  return out;
}

/**
 * Structural JSON comparison: a tree of added, removed and changed paths, with a normalised text
 * diff as the second view. Invalid input never throws; the error is shown with its line and column and
 * the raw texts are compared instead.
 */
export function JsonDiffViewer(props: JsonDiffViewerProps) {
  const {
    original,
    modified,
    ignorePaths,
    arrays,
    arrayKeys,
    sortKeys = true,
    textOptions,
    theme = 'auto',
    height,
    toolbar = true,
    onResult,
  } = props;
  const format = props.format ?? (props.jsonc ? jsoncFormat : jsonFormat);
  const [view, setView, viewSettable] = useControllableState<StructuredView>(props.view, props.defaultView ?? 'tree', props.onViewChange);
  const [changesOnly, setChangesOnly] = useState(props.changesOnly ?? false);
  // Text-view options are edited in the nested viewer's toolbar; ignored-path keys always come from the latest result.
  const [textState, setTextState] = useState<DiffOptions>(textOptions ?? {});

  const ignoreKey = JSON.stringify(ignorePaths ?? []);
  const keysKey = JSON.stringify(arrayKeys ?? {});
  const textKey = JSON.stringify(textOptions ?? {});
  const result = useMemo(
    () => diffStructured(original, modified, format, { ignorePaths, arrays, arrayKeys, sortKeys, text: textOptions }),
    // Option objects are compared by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [original, modified, format, ignoreKey, arrays, keysKey, sortKeys, textKey],
  );
  useEffect(() => {
    onResult?.(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const tree = result.structure?.tree;
  const defaultExpanded = useMemo(
    () => (tree ? collectPaths(tree, (n) => n.key === null || hasChanges(n), new Set()) : new Set<string>()),
    [tree],
  );
  const [expandedState, setExpandedState] = useState<{ for: unknown; set: Set<string> }>({ for: null, set: new Set() });
  const expanded = expandedState.for === tree ? expandedState.set : defaultExpanded;
  const toggle = (p: string) =>
    setExpandedState(() => {
      const next = new Set(expanded);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return { for: tree, set: next };
    });

  const effectiveView: StructuredView = result.ok ? view : 'text';
  const s = result.structure?.stats;
  const errors = [
    result.errors.original && ['Original', result.errors.original],
    result.errors.modified && ['Modified', result.errors.modified],
  ].filter(Boolean) as Array<[string, { message: string }]>;
  const patternErrors = result.structure?.patternErrors ?? [];

  return (
    <div
      className={cx('m2d-root m2d-structured', props.className)}
      data-theme={theme}
      style={{ ...(height !== undefined ? { height } : null), ...props.style }}
      role="region"
      aria-label={`${format.label} comparison`}
    >
      {toolbar && (
        <div className="m2d-toolbar" role="toolbar" aria-label={`${format.label} comparison tools`}>
          {viewSettable && (
            <span className="m2d-segmented" role="group" aria-label="View">
              <button
                type="button"
                className="m2d-btn"
                aria-pressed={effectiveView === 'tree'}
                disabled={!result.ok}
                onClick={() => setView('tree')}
              >
                Tree
              </button>
              <button type="button" className="m2d-btn" aria-pressed={effectiveView === 'text'} onClick={() => setView('text')}>
                Text
              </button>
            </span>
          )}
          {effectiveView === 'tree' && (
            <>
              <label className="m2d-check">
                <input type="checkbox" checked={changesOnly} onChange={(e) => setChangesOnly(e.target.checked)} />
                Changes only
              </label>
              <button
                type="button"
                className="m2d-btn"
                onClick={() => tree && setExpandedState({ for: tree, set: collectPaths(tree, () => true, new Set()) })}
              >
                Expand all
              </button>
              <button type="button" className="m2d-btn" onClick={() => setExpandedState({ for: tree, set: new Set(['$']) })}>
                Collapse all
              </button>
            </>
          )}
          <span className="m2d-spacer" />
          {s && (
            <span className="m2d-summary">
              <span className="m2d-stat-add">{`+${s.added}`}</span> <span className="m2d-stat-del">{`−${s.removed}`}</span>{' '}
              <span className="m2d-stat-mod">{`~${s.changed}`}</span>
              {s.ignored > 0 && <span className="m2d-muted"> · {s.ignored} ignored</span>}
            </span>
          )}
        </div>
      )}
      {(errors.length > 0 || patternErrors.length > 0) && (
        <div className="m2d-banner" role="alert">
          <IconWarning />
          <div>
            {errors.map(([side, e]) => (
              <div key={side}>
                <strong>{side}:</strong> invalid {format.label} — {e.message}. Showing a plain text comparison.
              </div>
            ))}
            {patternErrors.map((e) => (
              <div key={e}>{e}</div>
            ))}
          </div>
        </div>
      )}
      {effectiveView === 'tree' && tree ? (
        <div className="m2d-body">
          <div className="m2d-scroller m2d-tree-scroller" tabIndex={0} role="region" aria-label="Structure">
            {!hasChanges(tree) && result.structure!.stats.ignored === 0 ? (
              <div className="m2d-empty">No structural differences.</div>
            ) : (
              <ul className="m2d-tree">
                <TreeNode node={tree} depth={0} expanded={expanded} toggle={toggle} changesOnly={changesOnly} />
              </ul>
            )}
          </div>
        </div>
      ) : (
        <DiffViewer
          original={result.text.original}
          modified={result.text.modified}
          originalName={props.originalName}
          modifiedName={props.modifiedName}
          language={format.language ?? 'json'}
          options={{ ...textState, compareKeys: result.text.options.compareKeys }}
          onOptionsChange={({ compareKeys: _keys, ...rest }) => setTextState(rest)}
          theme={theme}
          className="m2d-nested"
          {...props.textViewProps}
        />
      )}
    </div>
  );
}
