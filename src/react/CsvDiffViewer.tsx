'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { diffCsv, type CsvDiffOptions, type CsvDiffResult, type CsvRowDiff } from '../core/csv/diff';
import type { ThemeSetting } from './DiffViewer';
import { IconWarning } from './icons';
import { Select } from './chrome';
import { cx } from './utils';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface CsvDiffViewerProps extends CsvDiffOptions {
  original: string | null | undefined;
  modified: string | null | undefined;
  /** Show only added, removed and modified rows. Default false. */
  changesOnly?: boolean;
  /** Offer a "match rows by" column picker in the toolbar. Default true. */
  toolbar?: boolean;
  theme?: ThemeSetting;
  /** CSS height. Default 560px. */
  height?: number | string;
  /** Row height in pixels. Default 28. */
  rowHeight?: number;
  className?: string;
  style?: CSSProperties;
  onResult?: (result: CsvDiffResult) => void;
}

const SIGN: Record<CsvRowDiff['kind'], string> = { added: '+', removed: '−', modified: '~', unchanged: '' };
const OVERSCAN = 10;

/**
 * Row- and cell-level CSV comparison in a virtualised table. Rows can be matched by position, as an
 * unordered set, or by key columns; columns are matched by header name.
 */
export function CsvDiffViewer(props: CsvDiffViewerProps) {
  const { original, modified, theme = 'auto', height, rowHeight = 28, toolbar = true, onResult } = props;
  const [changesOnly, setChangesOnly] = useState(props.changesOnly ?? false);
  const [keyOverride, setKeyOverride] = useState<string | null>(null);
  const [orderOverride, setOrderOverride] = useState<'ordered' | 'unordered' | null>(null);

  const keyColumns = keyOverride === null ? props.keyColumns : keyOverride === '' ? [] : [keyOverride];
  const rowOrder = orderOverride ?? props.rowOrder;
  const optsKey = JSON.stringify([
    props.header,
    props.delimiter,
    props.quote,
    keyColumns,
    rowOrder,
    props.ignoreColumns,
    props.ignoreCase,
    props.trimCells,
  ]);
  const result = useMemo(
    () => diffCsv(original, modified, { ...props, keyColumns, rowOrder }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [original, modified, optsKey],
  );
  useEffect(() => {
    onResult?.(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const rows = useMemo(() => (changesOnly ? result.rows.filter((r) => r.kind !== 'unchanged') : result.rows), [result, changesOnly]);

  // Column widths from content (bounded), so the table needs no layout pass.
  const template = useMemo(() => {
    const widths = result.columns.map((c, i) => {
      let w = c.name.length + 3;
      for (let r = 0; r < Math.min(result.rows.length, 500); r++) {
        const cell = result.rows[r].cells[i];
        const len = cell.changed ? (cell.old ?? '').length + (cell.new ?? '').length + 3 : (cell.new ?? cell.old ?? '').length;
        if (len > w) w = len;
      }
      return Math.min(48, Math.max(6, w + 3));
    });
    return `4ch 7ch 7ch ${widths.map((w) => `${w}ch`).join(' ')}`;
  }, [result]);

  const scroller = useRef<HTMLDivElement>(null);
  const [win, setWin] = useState({ start: 0, end: 60 });
  const virtual = rows.length > 300;
  const update = () => {
    const el = scroller.current;
    if (!el) return;
    const top = Math.max(0, el.scrollTop - rowHeight);
    const start = Math.max(0, Math.floor(top / rowHeight) - OVERSCAN);
    const end = Math.min(rows.length, Math.ceil((top + (el.clientHeight || 600)) / rowHeight) + OVERSCAN);
    setWin((w) => (w.start === start && w.end === end ? w : { start, end }));
  };

  useIsoLayoutEffect(update, [rows.length, rowHeight]);
  const start = virtual ? win.start : 0;
  const end = virtual ? Math.min(rows.length, win.end) : rows.length;

  const s = result.stats;
  const shared = result.columns.filter((c) => c.status === 'unchanged');
  const fatal = [...result.errors.original, ...result.errors.modified].filter((e) => e.fatal);
  const notes = [
    ...result.errors.original.slice(0, 3).map((e) => `Original: ${e.message}`),
    ...result.errors.modified.slice(0, 3).map((e) => `Modified: ${e.message}`),
    ...result.warnings,
  ];
  const keyValue = keyOverride ?? (typeof props.keyColumns?.[0] === 'string' && props.keyColumns.length === 1 ? props.keyColumns[0] : '');

  return (
    <div
      className={cx('m2d-root m2d-structured m2d-csv', props.className)}
      data-theme={theme}
      style={{ ...(height !== undefined ? { height } : null), ...props.style }}
      role="region"
      aria-label="CSV comparison"
    >
      {toolbar && (
        <div className="m2d-toolbar" role="toolbar" aria-label="CSV comparison tools">
          {props.header !== false && shared.length > 0 && (
            <Select
              label="Match rows by"
              hideLabel={false}
              value={keyValue}
              options={[{ value: '', label: 'Position' }, ...shared.map((c) => ({ value: c.name, label: c.name }))]}
              onChange={(v) => setKeyOverride(v)}
            />
          )}
          {!keyColumns?.length && (
            <Select<'ordered' | 'unordered'>
              label="Row order"
              value={rowOrder ?? 'ordered'}
              options={[
                { value: 'ordered', label: 'Order matters' },
                { value: 'unordered', label: 'Ignore row order' },
              ]}
              onChange={setOrderOverride}
            />
          )}
          <label className="m2d-check">
            <input type="checkbox" checked={changesOnly} onChange={(e) => setChangesOnly(e.target.checked)} />
            Changes only
          </label>
          <span className="m2d-spacer" />
          <span className="m2d-summary">
            <span className="m2d-stat-add">{`+${s.added}`}</span> <span className="m2d-stat-del">{`−${s.removed}`}</span>{' '}
            <span className="m2d-stat-mod">{`~${s.modified}`}</span>
            <span className="m2d-muted">
              {' '}
              · {s.changedCells} {s.changedCells === 1 ? 'cell' : 'cells'}
              {s.columnsAdded + s.columnsRemoved > 0 && ` · columns +${s.columnsAdded} −${s.columnsRemoved}`}
            </span>
          </span>
        </div>
      )}
      {notes.length > 0 && (
        <div className="m2d-banner" role={fatal.length ? 'alert' : 'status'}>
          <IconWarning />
          <div>
            {notes.map((n, i) => (
              <div key={i}>{n}</div>
            ))}
          </div>
        </div>
      )}
      <div className="m2d-body">
        <div className="m2d-scroller m2d-table-scroller" ref={scroller} onScroll={virtual ? update : undefined} tabIndex={0}>
          <div
            className="m2d-table"
            role="table"
            aria-label="Row comparison"
            aria-rowcount={rows.length + 1}
            style={{ '--m2d-cols': template, '--m2d-csv-row': `${rowHeight}px` } as CSSProperties}
          >
            <div className="m2d-tr m2d-th" role="row" aria-rowindex={1}>
              <span role="columnheader" className="m2d-td m2d-td-sign">
                <span className="m2d-sr-only">Change</span>
              </span>
              <span role="columnheader" className="m2d-td m2d-td-num" title="Row in the original">
                Old
              </span>
              <span role="columnheader" className="m2d-td m2d-td-num" title="Row in the modified file">
                New
              </span>
              {result.columns.map((c, i) => (
                <span
                  key={i}
                  role="columnheader"
                  className={cx('m2d-td', `m2d-col-${c.status}`, c.key && 'm2d-col-key', c.ignored && 'm2d-col-ignored')}
                  title={c.status !== 'unchanged' ? `Column ${c.status}` : c.ignored ? 'Ignored column' : undefined}
                >
                  {c.status === 'added' ? '+ ' : c.status === 'removed' ? '− ' : ''}
                  {c.name}
                  {c.key ? ' 🔑' : ''}
                </span>
              ))}
            </div>
            {virtual && start > 0 && <div className="m2d-tr-spacer" style={{ height: start * rowHeight }} aria-hidden="true" />}
            {rows.slice(start, end).map((r, k) => (
              <div
                key={start + k}
                role="row"
                aria-rowindex={start + k + 2}
                className={cx('m2d-tr', `m2d-tr-${r.kind}`)}
                style={{ height: rowHeight }}
              >
                <span role="cell" className="m2d-td m2d-td-sign" aria-label={r.kind === 'unchanged' ? undefined : r.kind}>
                  {SIGN[r.kind]}
                </span>
                <span role="cell" className="m2d-td m2d-td-num">
                  {r.oldRow ?? ''}
                </span>
                <span role="cell" className="m2d-td m2d-td-num">
                  {r.newRow ?? ''}
                </span>
                {r.cells.map((c, i) =>
                  c.changed ? (
                    <span key={i} role="cell" className="m2d-td m2d-cell-changed" title={`${c.old ?? ''} → ${c.new ?? ''}`}>
                      <span className="m2d-cell-old">{c.old}</span>
                      <span className="m2d-sr-only"> changed to </span>
                      <span className="m2d-cell-new">{c.new}</span>
                    </span>
                  ) : (
                    <span key={i} role="cell" className="m2d-td" title={(c.new ?? c.old ?? '').length > 30 ? (c.new ?? c.old) : undefined}>
                      {r.kind === 'removed' ? c.old : (c.new ?? c.old)}
                    </span>
                  ),
                )}
              </div>
            ))}
            {virtual && end < rows.length && (
              <div className="m2d-tr-spacer" style={{ height: (rows.length - end) * rowHeight }} aria-hidden="true" />
            )}
          </div>
          {!rows.length && <div className="m2d-empty">{result.rows.length ? 'No changed rows.' : 'No rows to compare.'}</div>}
        </div>
      </div>
    </div>
  );
}
