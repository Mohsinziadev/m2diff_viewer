'use client';
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type UIEvent,
} from 'react';
import { splitPieces, FONT_BOLD, FONT_ITALIC, FONT_UNDERLINE, type Decoration, type TokenLine } from '../core/highlight';
import type { DisplayItem, FoldRegion } from '../core/fold';
import type { InlineItem } from '../core/inline';
import type { SearchMatch } from '../core/search';
import type { DiffChange, DiffResult, DiffSide, Range } from '../core/types';
import { IconChevronsLeft, IconChevronsRight } from './icons';
import type { TokenSource } from './useSyntaxTokens';
import { cx } from './utils';

// Server render uses the plain effect (layout effects warn there); the browser measures before paint.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const OVERSCAN = 12;

export interface ViewHandle {
  /** Scrolls so that `item` is visible (centred when it was off screen). */
  scrollToItem(item: number): void;
  /** Scrolls to a fraction (0–1) of the content height. */
  scrollToFraction(f: number): void;
  focus(): void;
}

export interface ViewportInfo {
  top: number;
  height: number;
  total: number;
}

// ——— line rendering ————————————————————————————————————————————————

const fontClass = (f: number | undefined) =>
  f ? cx((f & FONT_ITALIC) !== 0 && 'm2d-i', (f & FONT_BOLD) !== 0 && 'm2d-b', (f & FONT_UNDERLINE) !== 0 && 'm2d-u') : '';

export const LineText = memo(function LineText({
  text,
  tokens,
  decorations,
}: {
  text: string;
  tokens?: TokenLine;
  decorations?: Decoration[];
}) {
  if (!text) return null;
  if (!tokens && !decorations?.length) return <>{text}</>;
  return (
    <>
      {splitPieces(text, tokens, decorations).map((p, i) => {
        const t = p.token;
        const style =
          t && (t.color || t.darkColor) ? ({ '--m2d-tc': t.color, '--m2d-tcd': t.darkColor ?? t.color } as CSSProperties) : undefined;
        const className = cx(t?.className, style && 'm2d-tk', fontClass(t?.fontStyle), p.decorations);
        return className || style ? (
          <span key={i} className={className || undefined} style={style}>
            {p.text}
          </span>
        ) : (
          p.text
        );
      })}
    </>
  );
});

export function decorationsFor(
  ranges: Range[] | undefined,
  matches: SearchMatch[] | undefined,
  side: DiffSide,
  active: SearchMatch | null,
): Decoration[] | undefined {
  let out: Decoration[] | undefined;
  if (ranges?.length) out = ranges.map((r) => ({ start: r.start, end: r.end, className: 'm2d-chg' }));
  if (matches) {
    for (const m of matches) {
      if (m.side !== side) continue;
      (out ??= []).push({ start: m.start, end: m.end, className: m === active ? 'm2d-match m2d-match-active' : 'm2d-match' });
    }
  }
  return out;
}

// ——— virtual scroller ——————————————————————————————————————————————

interface Window {
  start: number;
  end: number;
}

function computeWindow(count: number, rowHeight: number, top: number, height: number, virtualize: boolean): Window {
  if (!virtualize) return { start: 0, end: count };
  const start = Math.max(0, Math.floor(top / rowHeight) - OVERSCAN);
  const end = Math.min(count, Math.ceil((top + Math.max(height, rowHeight * 20)) / rowHeight) + OVERSCAN);
  return { start, end };
}

function useWindow(count: number, rowHeight: number, virtualize: boolean) {
  const [win, setWin] = useState<Window>(() => computeWindow(count, rowHeight, 0, 600, virtualize));
  const last = useRef({ top: 0, height: 600 });
  const update = useCallback(
    (top: number, height: number) => {
      last.current = { top, height };
      const next = computeWindow(count, rowHeight, top, height, virtualize);
      setWin((w) => (w.start === next.start && w.end === next.end ? w : next));
    },
    [count, rowHeight, virtualize],
  );
  // Recompute when the item count or mode changes (e.g. a fold was expanded).
  useIsoLayoutEffect(() => update(last.current.top, last.current.height), [update]);
  // Until that effect runs, keep the stored window within the new bounds.
  const safe: Window = virtualize ? { start: Math.min(win.start, count), end: Math.min(win.end, count) } : { start: 0, end: count };
  return [safe, update] as const;
}

function scrollIntoRange(el: HTMLElement | null, item: number, rowHeight: number) {
  if (!el) return;
  const y = item * rowHeight;
  const view = el.clientHeight || 400;
  if (y >= el.scrollTop + rowHeight && y + rowHeight <= el.scrollTop + view - rowHeight) return;
  const target = Math.max(0, y - view / 3);
  el.scrollTop = target;
}

interface PaneProps {
  count: number;
  rowHeight: number;
  win: Window;
  contentCh: number;
  gutterCh: number;
  label: string;
  className?: string;
  children: ReactNode;
  onScroll: (e: UIEvent<HTMLDivElement>) => void;
  style?: CSSProperties;
}

const Pane = forwardRef<HTMLDivElement, PaneProps>(function Pane(
  { count, rowHeight, win, contentCh, gutterCh, label, className, children, onScroll, style },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx('m2d-scroller', className)}
      tabIndex={0}
      role="region"
      aria-label={label}
      onScroll={onScroll}
      style={style}
    >
      <div
        className="m2d-content"
        style={{ height: count * rowHeight, '--m2d-ln-w': `${gutterCh}ch`, '--m2d-content-ch': contentCh } as CSSProperties}
      >
        <div className="m2d-rows" style={{ transform: win.start ? `translateY(${win.start * rowHeight}px)` : undefined }}>
          {children}
        </div>
      </div>
    </div>
  );
});

// ——— fold row ——————————————————————————————————————————————————————

function FoldRow({
  fold,
  onExpand,
  interactive,
  renderLabel,
}: {
  fold: FoldRegion;
  onExpand: (id: number) => void;
  interactive: boolean;
  renderLabel?: (fold: FoldRegion) => ReactNode;
}) {
  const label = renderLabel?.(fold) ?? `${fold.count.toLocaleString('en-US')} unchanged ${fold.count === 1 ? 'line' : 'lines'}`;
  const range =
    fold.oldStart === fold.newStart
      ? `lines ${fold.oldStart}–${fold.oldStart + fold.count - 1}`
      : `lines ${fold.oldStart}–${fold.oldStart + fold.count - 1} → ${fold.newStart}–${fold.newStart + fold.count - 1}`;
  return (
    <div className="m2d-row m2d-fold" aria-hidden={interactive ? undefined : true}>
      <button
        type="button"
        className="m2d-fold-btn"
        tabIndex={interactive ? 0 : -1}
        aria-expanded={false}
        aria-label={`Expand ${fold.count} unchanged lines (${range})`}
        onClick={() => onExpand(fold.id)}
      >
        <span className="m2d-fold-icon" aria-hidden="true">
          ⋯
        </span>
        <span>{label}</span>
      </button>
    </div>
  );
}

// ——— shared view props ——————————————————————————————————————————————

export interface ViewProps {
  result: DiffResult;
  rowHeight: number;
  virtualize: boolean;
  showLineNumbers: boolean;
  oldTokens: TokenSource | null;
  newTokens: TokenSource | null;
  matchesByRow: Map<number, SearchMatch[]>;
  activeMatch: SearchMatch | null;
  activeChange: number;
  onExpandFold: (id: number) => void;
  onViewport: (info: ViewportInfo) => void;
  labels: { original: string; modified: string };
  contentCh: { original: number; modified: number };
  renderFoldLabel?: (fold: FoldRegion) => ReactNode;
  rowClassName?: string;
}

const SR_KIND: Record<string, string> = { removed: 'Removed', added: 'Added', modified: 'Modified' };

function digits(n: number) {
  return Math.max(2, String(n).length);
}

// ——— side-by-side ——————————————————————————————————————————————————

export interface SplitViewProps extends ViewProps {
  items: DisplayItem[];
  syncHorizontal: boolean;
  ratio: number;
  onRatioChange: (r: number) => void;
  /** Draw the bands and arrows linking each change across the two panes. */
  connectors: boolean;
  /** Makes the arrows buttons that copy a change onto `target`. */
  onApplyChange?: (changeIndex: number, target: DiffSide) => void;
}

/** Width in pixels of the strip between the panes when connectors are shown (matches `.m2d-connector`). */
export const CONNECTOR_WIDTH = 48;

export const SplitView = forwardRef<ViewHandle, SplitViewProps>(function SplitView(props, ref) {
  const { items, result, rowHeight, virtualize, syncHorizontal, ratio, onRatioChange, onViewport, connectors } = props;
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const links = useRef<HTMLDivElement>(null);
  const skip = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  const [win, update] = useWindow(items.length, rowHeight, virtualize);

  const report = (el: HTMLElement) => {
    // The connector layer follows the panes directly, without waiting for a render.
    if (links.current) links.current.style.transform = `translateY(${-el.scrollTop}px)`;
    onViewport({ top: el.scrollTop, height: el.clientHeight, total: el.scrollHeight });
  };

  const syncFrom = (source: 'left' | 'right') => {
    const from = (source === 'left' ? left : right).current;
    const to = (source === 'left' ? right : left).current;
    if (!from) return;
    const other = source === 'left' ? 'right' : 'left';
    if (skip.current[source]) {
      skip.current[source] = false;
      return;
    }
    update(from.scrollTop, from.clientHeight);
    report(from);
    if (!to) return;
    const beforeTop = to.scrollTop;
    const beforeLeft = to.scrollLeft;
    to.scrollTop = from.scrollTop;
    if (syncHorizontal) to.scrollLeft = from.scrollLeft;
    // Only expect an echo event when the position actually changed.
    if (to.scrollTop !== beforeTop || to.scrollLeft !== beforeLeft) skip.current[other] = true;
  };

  useIsoLayoutEffect(() => {
    const el = left.current;
    if (!el) return;
    update(el.scrollTop, el.clientHeight);
    report(el);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      update(el.scrollTop, el.clientHeight);
      report(el);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);

  useImperativeHandle(ref, () => ({
    scrollToItem(item) {
      scrollIntoRange(left.current, item, rowHeight);
      if (right.current && left.current) right.current.scrollTop = left.current.scrollTop;
    },
    scrollToFraction(f) {
      if (!left.current) return;
      left.current.scrollTop = f * left.current.scrollHeight - left.current.clientHeight / 2;
    },
    focus: () => left.current?.focus(),
  }));

  // Resizable divider (pointer + keyboard).
  const drag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = body.current?.getBoundingClientRect();
    if (!box || !box.width) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const move = (ev: PointerEvent) => onRatioChange(Math.min(0.85, Math.max(0.15, (ev.clientX - box.left) / box.width)));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const keyResize = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.05;
    if (e.key === 'ArrowLeft') onRatioChange(Math.max(0.15, ratio - step));
    else if (e.key === 'ArrowRight') onRatioChange(Math.min(0.85, ratio + step));
    else if (e.key === 'Home') onRatioChange(0.15);
    else if (e.key === 'End') onRatioChange(0.85);
    else if (e.key === 'Enter') onRatioChange(0.5);
    else return;
    e.preventDefault();
  };

  const gutterOld = digits(result.original.lines.length);
  const gutterNew = digits(result.modified.lines.length);
  const leftRows: ReactNode[] = [];
  const rightRows: ReactNode[] = [];
  for (let i = win.start; i < win.end; i++) {
    const item = items[i];
    if (item.type === 'fold') {
      leftRows.push(
        <FoldRow key={`f${item.fold.id}`} fold={item.fold} onExpand={props.onExpandFold} interactive renderLabel={props.renderFoldLabel} />,
      );
      rightRows.push(
        <FoldRow
          key={`f${item.fold.id}`}
          fold={item.fold}
          onExpand={props.onExpandFold}
          interactive={false}
          renderLabel={props.renderFoldLabel}
        />,
      );
      continue;
    }
    leftRows.push(<SplitCell key={item.row} index={item.row} side="original" {...props} />);
    rightRows.push(<SplitCell key={item.row} index={item.row} side="modified" {...props} />);
  }

  return (
    <div className="m2d-split" ref={body} style={{ gridTemplateColumns: `minmax(0, ${ratio}fr) auto minmax(0, ${1 - ratio}fr)` }}>
      <Pane
        ref={left}
        count={items.length}
        rowHeight={rowHeight}
        win={win}
        contentCh={props.contentCh.original}
        gutterCh={gutterOld}
        label={props.labels.original}
        className="m2d-pane m2d-pane-old"
        onScroll={() => syncFrom('left')}
      >
        {leftRows}
      </Pane>
      <div className={cx('m2d-connector', connectors && 'm2d-connector-links')}>
        <div
          className="m2d-divider"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panes"
          aria-valuemin={15}
          aria-valuemax={85}
          aria-valuenow={Math.round(ratio * 100)}
          tabIndex={0}
          onPointerDown={drag}
          onKeyDown={keyResize}
          onDoubleClick={() => onRatioChange(0.5)}
        />
        {connectors && (
          <div className="m2d-links">
            <div ref={links} className="m2d-links-layer">
              <ChangeLinks
                items={items}
                result={result}
                win={win}
                rowHeight={rowHeight}
                activeChange={props.activeChange}
                onApplyChange={props.onApplyChange}
              />
            </div>
          </div>
        )}
      </div>
      <Pane
        ref={right}
        count={items.length}
        rowHeight={rowHeight}
        win={win}
        contentCh={props.contentCh.modified}
        gutterCh={gutterNew}
        label={props.labels.modified}
        className="m2d-pane m2d-pane-new"
        onScroll={() => syncFrom('right')}
      >
        {rightRows}
      </Pane>
    </div>
  );
});

// ——— change connectors ————————————————————————————————————————————————

const LINK_KIND: Record<DiffChange['kind'], string> = {
  added: 'm2d-link-added',
  removed: 'm2d-link-removed',
  modified: 'm2d-link-modified',
};

const lineSpan = (start: number, count: number) =>
  count === 0 ? 'nothing' : count === 1 ? `line ${start}` : `lines ${start}–${start + count - 1}`;

/**
 * Bands joining each visible change block in the left pane to its counterpart in the right pane, with
 * » / « arrows at the top of the block (like an IDE merge gutter). A side without lines narrows to a point.
 */
function ChangeLinks({
  items,
  result,
  win,
  rowHeight,
  activeChange,
  onApplyChange,
}: {
  items: DisplayItem[];
  result: DiffResult;
  win: Window;
  rowHeight: number;
  activeChange: number;
  onApplyChange?: (changeIndex: number, target: DiffSide) => void;
}) {
  const w = CONNECTOR_WIDTH;
  const shapes: ReactNode[] = [];
  const arrows: ReactNode[] = [];
  const seen = new Set<number>();
  for (let i = win.start; i < win.end; i++) {
    const item = items[i];
    if (item.type !== 'row') continue;
    const c = result.rows[item.row].change;
    if (c < 0 || seen.has(c)) continue;
    seen.add(c);
    const change = result.changes[c];
    // Change rows are never folded, so the block occupies consecutive items.
    const top = (i - (item.row - change.rowStart)) * rowHeight;
    // Each edge spans the block's rows down to the last one holding a line on that side.
    let oldRows = 0;
    let newRows = 0;
    for (let r = change.rowStart; r < change.rowEnd; r++) {
      if (result.rows[r].old) oldRows = r - change.rowStart + 1;
      if (result.rows[r].new) newRows = r - change.rowStart + 1;
    }
    const lb = top + oldRows * rowHeight;
    const rb = top + newRows * rowHeight;
    const kind = cx(LINK_KIND[change.kind], c === activeChange && 'm2d-link-current');
    shapes.push(
      <g key={c} className={kind}>
        <path className="m2d-link-fill" d={`M0 ${top}H${w}V${rb}C${w / 2} ${rb} ${w / 2} ${lb} 0 ${lb}Z`} />
        <path
          className="m2d-link-edge"
          d={`M0 ${top + 0.5}H${w}M0 ${lb - 0.5}C${w / 2} ${lb - 0.5} ${w / 2} ${rb - 0.5} ${w} ${rb - 0.5}`}
        />
      </g>,
    );
    const style = { top, height: rowHeight } as CSSProperties;
    const oldSpan = lineSpan(change.oldStart, change.oldCount);
    const newSpan = lineSpan(change.newStart, change.newCount);
    if (onApplyChange) {
      arrows.push(
        <button
          key={`r${c}`}
          type="button"
          className={cx('m2d-arrow m2d-arrow-old', kind)}
          style={style}
          title="Apply left to right"
          aria-label={`Difference ${c + 1}: replace modified ${newSpan} with original ${oldSpan}`}
          onClick={() => onApplyChange(c, 'modified')}
        >
          <IconChevronsRight />
        </button>,
        <button
          key={`l${c}`}
          type="button"
          className={cx('m2d-arrow m2d-arrow-new', kind)}
          style={style}
          title="Apply right to left"
          aria-label={`Difference ${c + 1}: replace original ${oldSpan} with modified ${newSpan}`}
          onClick={() => onApplyChange(c, 'original')}
        >
          <IconChevronsLeft />
        </button>,
      );
    } else {
      arrows.push(
        <span key={`r${c}`} className={cx('m2d-arrow m2d-arrow-old', kind)} style={style} aria-hidden="true">
          <IconChevronsRight />
        </span>,
        <span key={`l${c}`} className={cx('m2d-arrow m2d-arrow-new', kind)} style={style} aria-hidden="true">
          <IconChevronsLeft />
        </span>,
      );
    }
  }
  return (
    <>
      <svg className="m2d-links-svg" width={w} height={1} aria-hidden="true" focusable="false">
        {shapes}
      </svg>
      {arrows}
    </>
  );
}

function SplitCell(props: ViewProps & { index: number; side: DiffSide }) {
  const { result, index, side, showLineNumbers, matchesByRow, activeMatch, activeChange, rowHeight } = props;
  const row = result.rows[index];
  const line = side === 'original' ? row.old : row.new;
  if (!line) return <div className={cx('m2d-row m2d-filler', props.rowClassName)} style={{ height: rowHeight }} aria-hidden="true" />;
  const kind = row.kind === 'equal' ? 'equal' : row.kind === 'modified' ? 'modified' : side === 'original' ? 'removed' : 'added';
  const tokens = (side === 'original' ? props.oldTokens : props.newTokens)?.get(line.number - 1);
  const ranges = side === 'original' ? row.oldRanges : row.newRanges;
  const sign = kind === 'equal' ? (row.ignored ? '≈' : '') : side === 'original' ? '−' : '+';
  return (
    <div
      className={cx(
        'm2d-row',
        `m2d-${kind}`,
        kind === 'modified' && (side === 'original' ? 'm2d-mod-old' : 'm2d-mod-new'),
        row.ignored && 'm2d-ignored',
        row.change >= 0 && row.change === activeChange && 'm2d-current',
        props.rowClassName,
      )}
      style={{ height: rowHeight }}
      data-row={index}
    >
      <span
        className="m2d-gutter"
        data-n={showLineNumbers ? line.number : undefined}
        data-sign={sign}
        title={row.ignored ? 'Differs only in ignored content' : undefined}
      />
      <span className="m2d-code">
        {kind !== 'equal' && <span className="m2d-sr-only">{SR_KIND[kind]}: </span>}
        <LineText text={line.text} tokens={tokens} decorations={decorationsFor(ranges, matchesByRow.get(index), side, activeMatch)} />
      </span>
    </div>
  );
}

// ——— inline ————————————————————————————————————————————————————————

export interface InlineViewProps extends ViewProps {
  items: InlineItem[];
}

function useSingleScroller(count: number, rowHeight: number, virtualize: boolean, onViewport: (i: ViewportInfo) => void) {
  const el = useRef<HTMLDivElement>(null);
  const [win, update] = useWindow(count, rowHeight, virtualize);
  const onScroll = () => {
    const s = el.current;
    if (!s) return;
    update(s.scrollTop, s.clientHeight);
    onViewport({ top: s.scrollTop, height: s.clientHeight, total: s.scrollHeight });
  };
  useIsoLayoutEffect(() => {
    const s = el.current;
    if (!s) return;
    update(s.scrollTop, s.clientHeight);
    onViewport({ top: s.scrollTop, height: s.clientHeight, total: s.scrollHeight });
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => update(s.scrollTop, s.clientHeight));
    ro.observe(s);
    return () => ro.disconnect();
  }, [update]);
  const handle: ViewHandle = {
    scrollToItem: (item) => scrollIntoRange(el.current, item, rowHeight),
    scrollToFraction: (f) => {
      if (el.current) el.current.scrollTop = f * el.current.scrollHeight - el.current.clientHeight / 2;
    },
    focus: () => el.current?.focus(),
  };
  return { el, win, onScroll, handle };
}

export const InlineView = forwardRef<ViewHandle, InlineViewProps>(function InlineView(props, ref) {
  const { items, result, rowHeight, virtualize, showLineNumbers, matchesByRow, activeMatch, activeChange } = props;
  const { el, win, onScroll, handle } = useSingleScroller(items.length, rowHeight, virtualize, props.onViewport);
  useImperativeHandle(ref, () => handle);
  const g = Math.max(digits(result.original.lines.length), digits(result.modified.lines.length));
  const rows: ReactNode[] = [];
  for (let i = win.start; i < win.end; i++) {
    const item = items[i];
    if (item.type === 'fold') {
      rows.push(
        <FoldRow key={`f${item.fold.id}`} fold={item.fold} onExpand={props.onExpandFold} interactive renderLabel={props.renderFoldLabel} />,
      );
      continue;
    }
    const side: DiffSide = item.kind === 'removed' ? 'original' : 'modified';
    const lineNo = side === 'original' ? item.oldNumber! : item.newNumber!;
    const tokens = (side === 'original' ? props.oldTokens : props.newTokens)?.get(lineNo - 1);
    const kindClass = cx(`m2d-${item.kind}`, item.edited && 'm2d-edited');
    rows.push(
      <div
        key={`${item.kind}${item.row}`}
        className={cx(
          'm2d-row',
          kindClass,
          item.ignored && 'm2d-ignored',
          item.change >= 0 && item.change === activeChange && 'm2d-current',
          props.rowClassName,
        )}
        style={{ height: rowHeight }}
        data-row={item.row}
      >
        <span
          className="m2d-gutter m2d-gutter-2"
          data-n={showLineNumbers && item.oldNumber !== undefined ? item.oldNumber : undefined}
          data-n2={showLineNumbers && item.newNumber !== undefined ? item.newNumber : undefined}
        >
          <span className="m2d-sign" data-sign={item.kind === 'removed' ? '−' : item.kind === 'added' ? '+' : item.ignored ? '≈' : ''} />
        </span>
        <span className="m2d-code">
          {item.kind !== 'equal' && <span className="m2d-sr-only">{item.kind === 'removed' ? 'Removed' : 'Added'}: </span>}
          <LineText
            text={item.text}
            tokens={tokens}
            decorations={decorationsFor(item.ranges, matchesByRow.get(item.row), side, activeMatch)}
          />
        </span>
      </div>,
    );
  }
  return (
    <div className="m2d-single">
      <Pane
        ref={el}
        count={items.length}
        rowHeight={rowHeight}
        win={win}
        contentCh={Math.max(props.contentCh.original, props.contentCh.modified)}
        gutterCh={g}
        label={`${props.labels.original} → ${props.labels.modified}`}
        className="m2d-pane m2d-pane-inline"
        onScroll={onScroll}
      >
        {rows}
      </Pane>
    </div>
  );
});

// ——— unified patch ——————————————————————————————————————————————————

export interface PatchViewProps {
  lines: string[];
  rowHeight: number;
  virtualize: boolean;
  activeHunkLine: number;
  onViewport: (info: ViewportInfo) => void;
  label: string;
  rowClassName?: string;
}

const patchClass = (line: string) =>
  line.startsWith('+++') || line.startsWith('---')
    ? 'm2d-p-file'
    : line.startsWith('@@')
      ? 'm2d-p-hunk'
      : line[0] === '+'
        ? 'm2d-added'
        : line[0] === '-'
          ? 'm2d-removed'
          : line[0] === '\\'
            ? 'm2d-p-meta'
            : 'm2d-equal';

export const PatchView = forwardRef<ViewHandle, PatchViewProps>(function PatchView(
  { lines, rowHeight, virtualize, activeHunkLine, onViewport, label, rowClassName },
  ref,
) {
  const { el, win, onScroll, handle } = useSingleScroller(lines.length, rowHeight, virtualize, onViewport);
  useImperativeHandle(ref, () => handle);
  const width = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const rows: ReactNode[] = [];
  for (let i = win.start; i < win.end; i++) {
    const line = lines[i];
    rows.push(
      <div
        key={i}
        className={cx('m2d-row m2d-patch-line', patchClass(line), i === activeHunkLine && 'm2d-current', rowClassName)}
        style={{ height: rowHeight }}
      >
        <span className="m2d-code">{line}</span>
      </div>,
    );
  }
  if (!lines.length) {
    return (
      <div className="m2d-single">
        <div className="m2d-empty">No differences to show.</div>
      </div>
    );
  }
  return (
    <div className="m2d-single">
      <Pane
        ref={el}
        count={lines.length}
        rowHeight={rowHeight}
        win={win}
        contentCh={width}
        gutterCh={0}
        label={label}
        className="m2d-pane m2d-pane-patch"
        onScroll={onScroll}
      >
        {rows}
      </Pane>
    </div>
  );
});
