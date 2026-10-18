'use client';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { IconCheck, IconCommand } from './icons';
import { cx } from './utils';

export interface PaletteCommand {
  id: string;
  /** Category shown before the title ("View", "Compare"…); part of what the query matches. */
  group: string;
  title: string;
  /** Extra words that match without being shown. */
  keywords?: string;
  /** Muted text on the right, e.g. a line range. */
  detail?: string;
  /** Human-readable shortcut. */
  shortcut?: string;
  /** Marks the current choice of a setting. */
  checked?: boolean;
  disabled?: boolean;
  /** Listed only once the user has typed something (long lists such as languages). */
  searchOnly?: boolean;
  /** Keep the palette open after running (for commands that switch its mode). */
  stay?: boolean;
  run: () => void;
}

export interface PaletteItem extends PaletteCommand {
  /** Matched character positions in `${group}: ${title}`. */
  indices?: number[];
}

/**
 * Subsequence match with a preference for consecutive characters and word starts (like an editor's
 * quick open). Returns `null` when some query character is missing.
 */
export function fuzzyMatch(query: string, text: string): { score: number; indices: number[] } | null {
  const q = query.toLowerCase().replace(/\s+/g, '');
  if (!q) return { score: 0, indices: [] };
  const t = text.toLowerCase();
  const wordStart = (i: number) => i === 0 || SEPARATOR.test(t[i - 1]);
  const indices: number[] = [];
  let score = 0;
  for (const ch of q) {
    const prev = indices.length ? indices[indices.length - 1] : -1;
    let at = t.indexOf(ch, prev + 1);
    if (at === -1) return null;
    // Unless it continues the previous match, jump to an occurrence that starts a word.
    if (at !== prev + 1) {
      for (let i = at; i !== -1; i = t.indexOf(ch, i + 1)) {
        if (wordStart(i)) {
          at = i;
          break;
        }
      }
    }
    score += 1 + (at === prev + 1 ? 3 : 0) + (wordStart(at) ? 4 : 0) - Math.min(3, (at - prev - 1) * 0.1);
    indices.push(at);
  }
  return { score: score - text.length * 0.01, indices };
}

const SEPARATOR = /[\s:/._()-]/;

/** Filters and ranks commands by a query; with no query, returns the non-search-only ones in order. */
export function filterCommands(commands: PaletteCommand[], query: string): PaletteItem[] {
  if (!query.trim()) return commands.filter((c) => !c.searchOnly);
  const ranked: Array<{ item: PaletteItem; score: number }> = [];
  for (const c of commands) {
    const label = `${c.group}: ${c.title}`;
    const m = fuzzyMatch(query, label);
    if (m) {
      ranked.push({ item: { ...c, indices: m.indices }, score: m.score });
      continue;
    }
    if (c.keywords && fuzzyMatch(query, c.keywords)) ranked.push({ item: c, score: -5 });
  }
  return ranked.sort((a, b) => b.score - a.score).map((r) => r.item);
}

function Label({ group, title, indices }: { group: string; title: string; indices?: number[] }) {
  const label = `${group}: ${title}`;
  const hit = new Set(indices);
  const pieces: ReactNode[] = [];
  let i = 0;
  while (i < label.length) {
    const matched = hit.has(i);
    const inGroup = i <= group.length;
    let j = i + 1;
    while (j < label.length && hit.has(j) === matched && j <= group.length === inGroup) j++;
    const text = label.slice(i, j);
    pieces.push(
      <span key={i} className={cx(inGroup && 'm2d-palette-group', matched && 'm2d-palette-hit')}>
        {text}
      </span>,
    );
    i = j;
  }
  return <span className="m2d-palette-label">{pieces}</span>;
}

/**
 * Keyboard-first command list (⌘K / Ctrl+Shift+P). The host supplies items for the current query,
 * which lets prefixes switch modes (`:` go to line, `#` differences).
 */
export function CommandPalette({
  query,
  onQuery,
  getItems,
  onClose,
}: {
  query: string;
  onQuery: (q: string) => void;
  /** Items (and a hint for the footer or an empty list) for the current query. */
  getItems: (query: string) => { items: PaletteItem[]; hint?: string };
  onClose: (ran?: PaletteItem) => void;
}) {
  const { items, hint } = getItems(query);
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [prevQuery, setPrevQuery] = useState(query);
  if (prevQuery !== query) {
    setPrevQuery(query);
    setActive(0);
  }
  const current = Math.min(active, Math.max(0, items.length - 1));

  useEffect(() => input.current?.focus(), []);
  useLayoutEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${current}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [current]);

  const run = (item: PaletteItem | undefined) => {
    if (!item || item.disabled) return;
    if (item.stay) {
      item.run();
      input.current?.focus();
    } else onClose(item);
  };

  const move = (delta: number) => {
    if (!items.length) return;
    setActive((current + delta + items.length) % items.length);
  };

  return (
    <div
      className="m2d-palette-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="m2d-palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="m2d-palette-input-wrap">
          <IconCommand className="m2d-palette-icon" />
          <input
            ref={input}
            className="m2d-palette-input"
            role="combobox"
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            aria-activedescendant={items.length ? `${id}-${current}` : undefined}
            aria-label="Command"
            placeholder="Type a command, : to go to a line, # for a difference"
            value={query}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              let handled = true;
              if (e.key === 'ArrowDown') move(1);
              else if (e.key === 'ArrowUp') move(-1);
              else if (e.key === 'PageDown') move(Math.min(8, items.length - 1 - current) || 1);
              else if (e.key === 'PageUp') move(-Math.min(8, current) || -1);
              else if (e.key === 'Enter') run(items[current]);
              else if (e.key === 'Escape') onClose();
              else if (e.key === 'Tab') {
                /* keep focus in the palette */
              } else handled = false;
              if (handled) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          />
        </div>
        <div id={`${id}-list`} ref={list} className="m2d-palette-list" role="listbox" aria-label="Commands">
          {items.map((item, i) => (
            <div
              key={item.id}
              id={`${id}-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === current}
              aria-disabled={item.disabled || undefined}
              className={cx('m2d-palette-item', i === current && 'm2d-palette-active')}
              onPointerMove={() => i !== current && setActive(i)}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => run(item)}
            >
              <Label group={item.group} title={item.title} indices={item.indices} />
              {item.detail && <span className="m2d-palette-detail">{item.detail}</span>}
              {item.checked && <IconCheck className="m2d-palette-check" aria-label="Current" />}
              {item.shortcut && <kbd className="m2d-kbd">{item.shortcut}</kbd>}
            </div>
          ))}
          {!items.length && <div className="m2d-palette-empty">{hint ?? 'No matching commands'}</div>}
        </div>
        <div className="m2d-palette-footer" aria-hidden="true">
          <span>
            <kbd className="m2d-kbd">↑</kbd>
            <kbd className="m2d-kbd">↓</kbd> navigate
          </span>
          <span>
            <kbd className="m2d-kbd">↵</kbd> run
          </span>
          <span>
            <kbd className="m2d-kbd">esc</kbd> close
          </span>
          <span className="m2d-spacer" />
          {items.length > 0 && hint && <span className="m2d-palette-hint">{hint}</span>}
        </div>
      </div>
    </div>
  );
}
