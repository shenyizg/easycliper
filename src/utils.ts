import { t } from './i18n';

export type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, unknown>;

/** Tiny hyperscript helper. `i18n` / `i18nTitle` props bind translated text that updates on language change. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'i18n') {
        el.dataset.i18n = String(v);
        el.textContent = t(String(v));
      } else if (k === 'i18nTitle') {
        el.dataset.i18nTitle = String(v);
        el.title = t(String(v));
      } else if (k === 'i18nPlaceholder') {
        el.dataset.i18nPlaceholder = String(v);
        el.setAttribute('placeholder', t(String(v)));
      } else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2), v as EventListener);
      } else if (k in el && typeof v !== 'string') {
        (el as unknown as Record<string, unknown>)[k] = v;
      } else {
        el.setAttribute(k, v === true ? '' : String(v));
      }
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(parent, c);
    else parent.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** <select> with translated option labels. */
export function select<T extends string | number>(
  options: { value: T; label: string; raw?: boolean }[],
  value: T,
  onChange: (v: T) => void,
): HTMLSelectElement {
  const el = h('select');
  for (const o of options) {
    const opt = h('option', o.raw ? null : { i18n: o.label });
    if (o.raw) opt.textContent = o.label;
    opt.value = String(o.value);
    el.appendChild(opt);
  }
  el.value = String(value);
  el.addEventListener('change', () => {
    const found = options.find((o) => String(o.value) === el.value);
    if (found) onChange(found.value);
  });
  return el;
}

export class Emitter<T = void> {
  private fns = new Set<(v: T) => void>();
  on(fn: (v: T) => void): () => void {
    this.fns.add(fn);
    return () => this.fns.delete(fn);
  }
  emit(v: T): void {
    for (const fn of [...this.fns]) fn(v);
  }
}

let uidCounter = 0;
export const uid = (prefix = 'id'): string => `${prefix}${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** 75.5 -> "01:15.500", 3725 -> "1:02:05.000" */
export function formatTime(sec: number, ms = true): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const totalMs = Math.round(sec * 1000);
  const h = Math.floor(totalMs / 3_600_000);
  const m = Math.floor((totalMs % 3_600_000) / 60_000);
  const s = Math.floor((totalMs % 60_000) / 1000);
  const frac = totalMs % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const base = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  return ms ? `${base}.${pad(frac, 3)}` : base;
}

/** Accepts "12.5", "01:12.5", "1:02:03.25". Returns NaN when invalid. */
export function parseTime(text: string): number {
  const parts = text.trim().split(':');
  if (parts.length === 0 || parts.length > 3) return NaN;
  let total = 0;
  for (const p of parts) {
    if (!/^\d*\.?\d+$/.test(p.trim())) return NaN;
    total = total * 60 + parseFloat(p);
  }
  return total;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

export function baseName(name: string): string {
  const i = name.lastIndexOf('.');
  return (i > 0 ? name.slice(0, i) : name).replace(/[\\/:*?"<>|]+/g, '_');
}

export function extName(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode etc. */
  }
}

export function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
