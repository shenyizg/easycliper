import type { Segment } from '../engine/formats';
import { filmStrip } from '../media';
import { clamp, formatTime, h } from '../utils';

const TILE_COUNT = 24;
const stripCache = new Map<string, (HTMLCanvasElement | undefined)[]>();

/**
 * Scrubbable track with a film strip, in/out handles and a playhead.
 * Times are in seconds; snapping to frames is done by the owner via `snap`.
 */
export class Timeline {
  readonly el: HTMLElement;
  onSeek: (t: number) => void = () => {};
  onRange: (r: Segment, edge: 'start' | 'end') => void = () => {};
  snap: (t: number) => number = (t) => t;

  private track: HTMLElement;
  private canvas: HTMLCanvasElement;
  private rangeEl: HTMLElement;
  private shadeL: HTMLElement;
  private shadeR: HTMLElement;
  private playhead: HTMLElement;
  private hover: HTMLElement;
  private ruler: HTMLElement;
  private duration = 0;
  private range: Segment = { start: 0, end: 0 };
  private time = 0;
  private stripKey = '';
  private tiles: (HTMLCanvasElement | undefined)[] = [];
  private stripToken = 0;

  constructor() {
    this.canvas = h('canvas', { class: 'tl-strip' });
    this.shadeL = h('div', { class: 'tl-shade' });
    this.shadeR = h('div', { class: 'tl-shade' });
    const inHandle = h('div', { class: 'tl-handle tl-in', 'data-edge': 'start', i18nTitle: 'player.dragIn' });
    const outHandle = h('div', { class: 'tl-handle tl-out', 'data-edge': 'end', i18nTitle: 'player.dragOut' });
    this.rangeEl = h('div', { class: 'tl-range' }, inHandle, outHandle);
    this.playhead = h('div', { class: 'tl-playhead' });
    this.hover = h('div', { class: 'tl-hover' });
    this.track = h('div', { class: 'tl-track' }, this.canvas, this.shadeL, this.shadeR, this.rangeEl, this.playhead, this.hover);
    this.ruler = h('div', { class: 'tl-ruler' });
    this.el = h('div', { class: 'timeline' }, this.track, this.ruler);

    this.track.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.track.addEventListener('pointermove', (e) => this.showHover(e));
    this.track.addEventListener('pointerleave', () => (this.hover.style.display = 'none'));
    new ResizeObserver(() => {
      this.drawStrip();
      this.drawRuler();
    }).observe(this.track);
  }

  private timeAt(clientX: number): number {
    const r = this.track.getBoundingClientRect();
    return clamp((clientX - r.left) / Math.max(1, r.width), 0, 1) * this.duration;
  }

  private onPointerDown(e: PointerEvent) {
    if (!this.duration || e.button !== 0) return;
    e.preventDefault();
    const edge = (e.target as HTMLElement).dataset.edge as 'start' | 'end' | undefined;
    this.track.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const t = this.snap(this.timeAt(ev.clientX));
      if (edge === 'start') {
        this.onRange({ start: Math.min(t, this.range.end), end: this.range.end }, 'start');
      } else if (edge === 'end') {
        this.onRange({ start: this.range.start, end: Math.max(t, this.range.start) }, 'end');
      } else {
        this.onSeek(this.timeAt(ev.clientX));
      }
    };
    const up = () => {
      this.track.removeEventListener('pointermove', move);
      this.track.removeEventListener('pointerup', up);
      this.track.removeEventListener('pointercancel', up);
      this.track.classList.remove('dragging');
    };
    this.track.classList.add('dragging');
    this.track.addEventListener('pointermove', move);
    this.track.addEventListener('pointerup', up);
    this.track.addEventListener('pointercancel', up);
    move(e);
  }

  private showHover(e: PointerEvent) {
    if (!this.duration) return;
    const r = this.track.getBoundingClientRect();
    const t = this.timeAt(e.clientX);
    this.hover.style.display = 'block';
    this.hover.style.left = `${clamp(e.clientX - r.left, 0, r.width)}px`;
    this.hover.textContent = formatTime(t);
  }

  setDuration(d: number): void {
    this.duration = d > 0 ? d : 0;
    this.drawRuler();
    this.layout();
  }

  setRange(r: Segment): void {
    this.range = r;
    this.layout();
  }

  setTime(t: number): void {
    this.time = t;
    const p = this.duration ? clamp(t / this.duration, 0, 1) : 0;
    this.playhead.style.left = `${p * 100}%`;
  }

  private layout() {
    const d = this.duration || 1;
    const a = clamp(this.range.start / d, 0, 1) * 100;
    const b = clamp(this.range.end / d, 0, 1) * 100;
    this.rangeEl.style.left = `${a}%`;
    this.rangeEl.style.width = `${Math.max(0, b - a)}%`;
    this.shadeL.style.left = '0';
    this.shadeL.style.width = `${a}%`;
    this.shadeR.style.left = `${b}%`;
    this.shadeR.style.width = `${100 - b}%`;
    this.setTime(this.time);
  }

  private drawRuler() {
    this.ruler.replaceChildren();
    if (!this.duration) return;
    const width = this.track.clientWidth || 600;
    const target = Math.max(2, Math.floor(width / 90));
    const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
    const step = steps.find((s) => this.duration / s <= target) ?? 3600;
    for (let t = 0; t <= this.duration + 1e-6; t += step) {
      const text = this.duration < 60 ? `${+t.toFixed(step < 1 ? 2 : 0)}s` : formatTime(t, false);
      const label = h('span', { class: 'tl-tick' }, text);
      label.style.left = `${(t / this.duration) * 100}%`;
      this.ruler.appendChild(label);
    }
  }

  /** Loads (or reuses) the film strip for a preview URL. */
  loadStrip(key: string, url: string | undefined, duration: number): void {
    this.stripKey = key;
    const token = ++this.stripToken;
    if (!url) {
      this.tiles = [];
      this.drawStrip();
      return;
    }
    const cached = stripCache.get(key);
    if (cached) {
      this.tiles = cached;
      this.drawStrip();
      if (cached.every(Boolean)) return;
    }
    const tiles: (HTMLCanvasElement | undefined)[] = new Array(TILE_COUNT).fill(undefined);
    this.tiles = tiles;
    stripCache.set(key, tiles);
    this.drawStrip();
    void filmStrip(
      url,
      duration,
      TILE_COUNT,
      72,
      (i, tile) => {
        tiles[i] = tile;
        if (this.stripKey === key) this.drawStrip();
      },
      () => token !== this.stripToken,
    ).then(() => {
      // a cancelled run leaves holes; drop it so the next visit retries
      if (!tiles.every(Boolean)) stripCache.delete(key);
    });
  }

  static forget(key: string): void {
    stripCache.delete(key);
  }

  private drawStrip() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.track.clientWidth * dpr));
    const hgt = Math.max(1, Math.round(this.track.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== hgt) {
      this.canvas.width = w;
      this.canvas.height = hgt;
    }
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, hgt);
    const n = this.tiles.length;
    const sample = this.tiles.find(Boolean);
    if (!n || !sample) return;
    // lay frames out at their natural aspect, picking the nearest generated tile per slot
    const tileW = Math.max(8, (hgt * sample.width) / sample.height);
    const slots = Math.max(1, Math.ceil(w / tileW));
    for (let i = 0; i < slots; i++) {
      const tile = this.tiles[Math.min(n - 1, Math.floor(((i + 0.5) / slots) * n))];
      if (tile) ctx.drawImage(tile, 0, 0, tile.width, tile.height, Math.round(i * tileW), 0, Math.ceil(tileW), hgt);
    }
  }
}
