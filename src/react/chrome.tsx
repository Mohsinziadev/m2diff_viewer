'use client';
import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react';
import type { SearchScope } from '../core/search';
import { IconArrowDown, IconArrowUp, IconCaseSensitive, IconClose, IconRegex, IconWholeWord } from './icons';
import type { ViewportInfo } from './views';
import { cx } from './utils';

export const IconButton = forwardRef<HTMLButtonElement, { label: string; pressed?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>>(
  function IconButton({ label, pressed, children, className, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className={cx('m2d-btn m2d-icon-btn', className)}
        aria-label={label}
        title={label}
        aria-pressed={pressed}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  hideLabel = true,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
  className?: string;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <span className={cx('m2d-field', className)}>
      <label htmlFor={id} className={hideLabel ? 'm2d-sr-only' : 'm2d-field-label'}>
        {label}
      </label>
      <select id={id} className="m2d-select" value={value} onChange={(e) => onChange(e.target.value as T)} title={label}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}

/**
 * Disclosure popover: Escape or an outside click closes it and focus returns to the trigger.
 * Clicking an element marked `data-m2d-close` inside the panel also closes it.
 */
export function Popover({
  label,
  icon,
  children,
  kind = 'dialog',
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
  kind?: 'dialog' | 'menu';
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('button, input, select, [tabindex="0"]')?.focus();
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);
  return (
    <span className="m2d-popover-wrap" ref={wrap}>
      <IconButton
        ref={button}
        label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-haspopup={kind === 'menu' ? 'true' : 'dialog'}
        onClick={() => setOpen((o) => !o)}
        data-open={open || undefined}
      >
        {icon}
      </IconButton>
      {open && (
        <div
          id={id}
          ref={panel}
          className="m2d-popover"
          role={kind === 'menu' ? 'group' : 'dialog'}
          aria-label={label}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
            }
          }}
          onClick={(e) => {
            if ((e.target as Element).closest?.('[data-m2d-close]')) close();
          }}
        >
          {children}
        </div>
      )}
    </span>
  );
}

export interface SearchBarProps {
  query: string;
  onQuery: (q: string) => void;
  scope: SearchScope;
  onScope: (s: SearchScope) => void;
  caseSensitive: boolean;
  onCaseSensitive: (v: boolean) => void;
  regex: boolean;
  onRegex: (v: boolean) => void;
  wholeWord: boolean;
  onWholeWord: (v: boolean) => void;
  count: number;
  active: number;
  truncated: boolean;
  error?: string;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  showScope: boolean;
}

export function SearchBar({ inputRef, ...p }: SearchBarProps) {
  const summary = p.error
    ? 'Invalid pattern'
    : !p.query
      ? ''
      : p.count
        ? `${p.active + 1} of ${p.count.toLocaleString('en-US')}${p.truncated ? '+' : ''}`
        : 'No results';
  return (
    <div
      className="m2d-search"
      role="search"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          p.onClose();
        }
      }}
    >
      <span className="m2d-search-box" data-invalid={p.error ? true : undefined}>
        <input
          ref={inputRef}
          className="m2d-search-input"
          type="search"
          placeholder="Search"
          aria-label="Search text"
          aria-invalid={p.error ? true : undefined}
          value={p.query}
          onChange={(e) => p.onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (e.shiftKey) p.onPrev();
              else p.onNext();
            }
          }}
          spellCheck={false}
          autoComplete="off"
        />
        <IconButton label="Match case" pressed={p.caseSensitive} onClick={() => p.onCaseSensitive(!p.caseSensitive)} className="m2d-toggle">
          <IconCaseSensitive />
        </IconButton>
        <IconButton label="Match whole word" pressed={p.wholeWord} onClick={() => p.onWholeWord(!p.wholeWord)} className="m2d-toggle">
          <IconWholeWord />
        </IconButton>
        <IconButton label="Use regular expression" pressed={p.regex} onClick={() => p.onRegex(!p.regex)} className="m2d-toggle">
          <IconRegex />
        </IconButton>
      </span>
      {p.showScope && (
        <Select<SearchScope>
          label="Search in"
          value={p.scope}
          onChange={p.onScope}
          options={[
            { value: 'both', label: 'Both sides' },
            { value: 'original', label: 'Original' },
            { value: 'modified', label: 'Modified' },
          ]}
        />
      )}
      <span className="m2d-search-count" aria-live="polite" title={p.error}>
        {summary}
      </span>
      <IconButton label="Previous match (Shift+Enter)" onClick={p.onPrev} disabled={!p.count}>
        <IconArrowUp />
      </IconButton>
      <IconButton label="Next match (Enter)" onClick={p.onNext} disabled={!p.count}>
        <IconArrowDown />
      </IconButton>
      <IconButton label="Close search (Escape)" onClick={p.onClose}>
        <IconClose />
      </IconButton>
    </div>
  );
}

export interface OverviewMarker {
  top: number;
  height: number;
  kind: 'added' | 'removed' | 'modified';
  index: number;
}

export interface OverviewHandle {
  setViewport(info: ViewportInfo): void;
}

/** Change overview along the right edge (like an editor's scrollbar markers). Mouse convenience; keyboard users navigate with the change shortcuts. */
export const OverviewRuler = forwardRef<
  OverviewHandle,
  { markers: OverviewMarker[]; active: number; onJump: (fraction: number) => void; onSelect: (index: number) => void }
>(function OverviewRuler({ markers, active, onJump, onSelect }, ref) {
  const thumb = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    setViewport({ top, height, total }) {
      // Content shorter than the viewport: markers cover only the part of the ruler beside the content.
      if (track.current) track.current.style.height = total && height && total < height ? `${(total / height) * 100}%` : '100%';
      const el = thumb.current;
      if (!el) return;
      if (!total || height >= total) {
        el.style.display = 'none';
        return;
      }
      el.style.display = '';
      el.style.top = `${(top / total) * 100}%`;
      el.style.height = `${Math.max(2, (height / total) * 100)}%`;
    },
  }));
  return (
    <div
      className="m2d-overview"
      aria-hidden="true"
      onPointerDown={(e) => {
        const box = (track.current ?? e.currentTarget).getBoundingClientRect();
        if (box.height) onJump(Math.min(1, (e.clientY - box.top) / box.height));
      }}
    >
      <div className="m2d-overview-track" ref={track}>
        <div className="m2d-overview-thumb" ref={thumb} />
        {markers.map((m) => (
          <div
            key={m.index}
            className={cx('m2d-mark', `m2d-mark-${m.kind}`, m.index === active && 'm2d-mark-active')}
            style={{ top: `${m.top * 100}%`, height: `max(3px, ${m.height * 100}%)` }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelect(m.index);
            }}
          />
        ))}
      </div>
    </div>
  );
});
