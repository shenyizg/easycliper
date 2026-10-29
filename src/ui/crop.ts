import type { CropRect } from '../state';
import { clamp, h } from '../utils';

const MIN = 0.04;
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type Handle = (typeof HANDLES)[number];

/** Draggable crop rectangle laid over the displayed media. Coordinates are normalized 0..1. */
export class CropOverlay {
  readonly el: HTMLElement;
  onChange: (r: CropRect) => void = () => {};
  private box: HTMLElement;
  private label: HTMLElement;
  private rect: CropRect = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
  /** Width/height ratio in display pixels, 0 = free. */
  private aspect = 0;
  private frameW = 1;
  private frameH = 1;

  constructor() {
    this.label = h('div', { class: 'crop-label' });
    this.box = h(
      'div',
      { class: 'crop-box', 'data-handle': 'move' },
      ...HANDLES.map((k) => h('div', { class: `crop-h crop-${k}`, 'data-handle': k })),
      this.label,
    );
    this.el = h('div', { class: 'crop-layer' }, this.box);
    this.box.addEventListener('pointerdown', (e) => this.onDown(e));
  }

  setFrame(w: number, hgt: number): void {
    this.frameW = Math.max(1, w);
    this.frameH = Math.max(1, hgt);
    this.render();
  }

  setRect(r: CropRect): void {
    this.rect = { ...r };
    this.render();
  }

  setAspect(a: number): void {
    this.aspect = a;
    this.box.classList.toggle('locked', a > 0);
    if (a > 0) {
      const rn = this.ratioNorm();
      const r = this.rect;
      let w = r.w;
      let hh = w / rn;
      if (hh > r.h) {
        hh = r.h;
        w = hh * rn;
      }
      if (w > 1) {
        w = 1;
        hh = w / rn;
      }
      if (hh > 1) {
        hh = 1;
        w = hh * rn;
      }
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      this.rect = { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - hh / 2, 0, 1 - hh), w, h: hh };
      this.render();
      this.onChange({ ...this.rect });
    }
  }

  /** Aspect expressed in normalized units (w_norm / h_norm). */
  private ratioNorm(): number {
    return (this.aspect * this.frameH) / this.frameW;
  }

  /** Positions the layer over the media's content box (CSS pixels, relative to the stage). */
  place(left: number, top: number, width: number, height: number): void {
    Object.assign(this.el.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
  }

  private render() {
    const r = this.rect;
    Object.assign(this.box.style, {
      left: `${r.x * 100}%`,
      top: `${r.y * 100}%`,
      width: `${r.w * 100}%`,
      height: `${r.h * 100}%`,
    });
    this.label.textContent = `${Math.round(r.w * this.frameW)} × ${Math.round(r.h * this.frameH)}`;
  }

  private onDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const handle = (e.target as HTMLElement).dataset.handle as Handle | 'move' | undefined;
    if (!handle) return;
    e.preventDefault();
    e.stopPropagation();
    const layer = this.el.getBoundingClientRect();
    const start = { ...this.rect };
    const x0 = e.clientX;
    const y0 = e.clientY;
    this.box.setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) / Math.max(1, layer.width);
      const dy = (ev.clientY - y0) / Math.max(1, layer.height);
      this.rect = handle === 'move' ? this.moved(start, dx, dy) : this.resized(start, handle, dx, dy);
      this.render();
      this.onChange({ ...this.rect });
    };
    const up = () => {
      this.box.removeEventListener('pointermove', move);
      this.box.removeEventListener('pointerup', up);
      this.box.removeEventListener('pointercancel', up);
    };
    this.box.addEventListener('pointermove', move);
    this.box.addEventListener('pointerup', up);
    this.box.addEventListener('pointercancel', up);
  }

  private moved(s: CropRect, dx: number, dy: number): CropRect {
    return { ...s, x: clamp(s.x + dx, 0, 1 - s.w), y: clamp(s.y + dy, 0, 1 - s.h) };
  }

  private resized(s: CropRect, handle: Handle, dx: number, dy: number): CropRect {
    const west = handle.includes('w');
    const north = handle.includes('n');
    const horiz = handle.includes('w') || handle.includes('e');
    const vert = handle.includes('n') || handle.includes('s');
    const anchorX = west ? s.x + s.w : s.x;
    const anchorY = north ? s.y + s.h : s.y;
    const availW = west ? anchorX : 1 - anchorX;
    const availH = north ? anchorY : 1 - anchorY;
    let w = s.w + (west ? -dx : dx);
    let hh = s.h + (north ? -dy : dy);

    if (this.aspect > 0) {
      const rn = this.ratioNorm();
      if (horiz && vert) {
        if (Math.abs(dx) >= Math.abs(dy * rn)) hh = w / rn;
        else w = hh * rn;
      } else if (horiz) hh = w / rn;
      else w = hh * rn;
      const maxW = Math.min(horiz ? availW : 1, (vert ? availH : 1) * rn);
      w = clamp(w, MIN, maxW);
      hh = w / rn;
      if (!horiz) {
        // top/bottom edge: grow symmetrically around the horizontal center
        const cx = s.x + s.w / 2;
        w = Math.min(w, 2 * Math.min(cx, 1 - cx));
        hh = w / rn;
        return { x: cx - w / 2, y: north ? anchorY - hh : anchorY, w, h: hh };
      }
      if (!vert) {
        const cy = s.y + s.h / 2;
        hh = Math.min(hh, 2 * Math.min(cy, 1 - cy));
        w = hh * rn;
        return { x: west ? anchorX - w : anchorX, y: cy - hh / 2, w, h: hh };
      }
    } else {
      w = horiz ? clamp(w, MIN, availW) : s.w;
      hh = vert ? clamp(hh, MIN, availH) : s.h;
    }
    return {
      x: horiz ? (west ? anchorX - w : anchorX) : s.x,
      y: vert ? (north ? anchorY - hh : anchorY) : s.y,
      w,
      h: hh,
    };
  }
}
