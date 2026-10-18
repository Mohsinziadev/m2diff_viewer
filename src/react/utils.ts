'use client';
import { useCallback, useState } from 'react';

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

/**
 * Standard controlled/uncontrolled state: `value !== undefined` means controlled. `settable` is false
 * when the value is controlled without a change handler (UI that would change it is hidden).
 */
export function useControllableState<T>(value: T | undefined, defaultValue: T, onChange?: (v: T) => void) {
  const [inner, setInner] = useState(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? value : inner;
  const set = useCallback(
    (next: T) => {
      if (!controlled) setInner(next);
      onChange?.(next);
    },
    [controlled, onChange],
  );
  return [current, set, !controlled || !!onChange] as const;
}

/** Copies text, falling back to a hidden textarea where the async Clipboard API is unavailable. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  if (typeof document === 'undefined') return false;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok: boolean;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

/** Saves text as a file in the browser. Nothing is uploaded anywhere. */
export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/**
 * Matches a keyboard event against a binding like `Mod+Shift+G`, `Alt+ArrowDown` or `F7`.
 * `Mod` is ⌘ on Apple platforms and Ctrl elsewhere.
 */
export function matchesBinding(
  e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean },
  binding: string,
): boolean {
  const parts = binding.split('+').map((p) => p.trim());
  const key = parts.pop();
  if (!key) return false;
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  const mac = isMac();
  const wantCtrl = mods.has('ctrl') || (!mac && mods.has('mod'));
  const wantMeta = mods.has('meta') || mods.has('cmd') || (mac && mods.has('mod'));
  if (e.ctrlKey !== wantCtrl || e.metaKey !== wantMeta || e.altKey !== mods.has('alt') || e.shiftKey !== mods.has('shift')) return false;
  return e.key.toLowerCase() === key.toLowerCase();
}

/** Human-readable binding (`Mod+F` → `⌘F` on macOS, `Ctrl+F` elsewhere). */
export function describeBinding(binding: string): string {
  const mac = isMac();
  return binding
    .split('+')
    .map((p) => {
      const k = p.trim();
      if (k === 'Mod') return mac ? '⌘' : 'Ctrl';
      if (k === 'Alt') return mac ? '⌥' : 'Alt';
      if (k === 'Shift') return mac ? '⇧' : 'Shift';
      if (k === 'ArrowUp') return '↑';
      if (k === 'ArrowDown') return '↓';
      return k;
    })
    .join(mac ? '' : '+');
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
