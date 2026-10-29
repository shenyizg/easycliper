import { zipSync } from 'fflate';
import { defaultOptions, formatDef, type FormatId, type Quality, type Segment } from '../engine/formats';
import { onLangChange, t } from '../i18n';
import { composeFrames, cropPixels, exportFrames, extractThumbnails, type ExtractedFrame } from '../jobs';
import { store, type MediaItem } from '../state';
import { tasks } from '../tasks';
import { baseName, clamp, formatTime, h, select } from '../utils';
import { icon } from './icons';
import { toast } from './overlay';
import type { Player } from './player';

type Sampling = 'all' | 'every' | 'fps' | 'count';

interface Extraction {
  itemId: string;
  segment: Segment;
  step: number;
  frames: ExtractedFrame[];
}

const MAX_FRAMES = 3000;
const WARN_FRAMES = 800;

/** Manual frame picking: extract thumbnails, select by hand, export picks as images or an animation. */
export class FramesPanel {
  readonly el: HTMLElement;
  private sampling: Sampling = 'every';
  private values: Record<Exclude<Sampling, 'all'>, number> = { every: 5, fps: 5, count: 60 };
  private valueInput: HTMLInputElement;
  private valueLabel: HTMLElement;
  private estimate: HTMLElement;
  private extractBtn: HTMLButtonElement;
  private grid: HTMLElement;
  private toolbar: HTMLElement;
  private countLabel: HTMLElement;
  private exportBox: HTMLElement;
  private previewImg: HTMLImageElement;
  private data: Extraction | null = null;
  private selected = new Set<number>();
  private cells: HTMLElement[] = [];
  private anchor = -1;
  private paint: boolean | null = null;
  private previewTimer = 0;

  // export settings
  private imgFormat: 'png' | 'jpg' | 'webp' = 'png';
  private imgSize = 0;
  private animFormat: FormatId = 'gif';
  private animFps = 10;
  private animSize = 0;
  private animQuality: Quality = 'medium';
  private animLoop = true;
  private fpsInput: HTMLInputElement;

  constructor(private player: Player) {
    this.valueInput = h('input', { type: 'number', min: 1, class: 'num' });
    this.valueInput.addEventListener('input', () => {
      const v = Math.max(1, Math.round(Number(this.valueInput.value) || 1));
      if (this.sampling !== 'all') this.values[this.sampling] = v;
      this.renderEstimate();
    });
    const samplingSel = select<Sampling>(
      [
        { value: 'all', label: 'frames.all' },
        { value: 'every', label: 'frames.everyN' },
        { value: 'fps', label: 'frames.perSecond' },
        { value: 'count', label: 'frames.total' },
      ],
      this.sampling,
      (s) => {
        this.sampling = s;
        this.syncSampling();
      },
    );
    this.valueLabel = h('span', { class: 'field-label' });
    this.estimate = h('span', { class: 'muted small' });
    this.extractBtn = h('button', { class: 'btn primary', onclick: () => this.extract() }, icon('grid'), h('span', { i18n: 'frames.extract' }));

    this.countLabel = h('span', { class: 'mono' });
    const sizeInput = h('input', { type: 'range', min: 64, max: 240, value: 120, class: 'size-slider', 'aria-label': 'thumbnail size' });
    sizeInput.addEventListener('input', () => this.grid.style.setProperty('--thumb', `${sizeInput.value}px`));
    this.toolbar = h(
      'div',
      { class: 'frames-toolbar' },
      this.countLabel,
      h('button', { class: 'btn small', i18n: 'frames.selectAll', onclick: () => this.selectAll(true) }),
      h('button', { class: 'btn small', i18n: 'frames.selectNone', onclick: () => this.selectAll(false) }),
      h('button', { class: 'btn small', i18n: 'frames.invert', onclick: () => this.invert() }),
      h('span', { class: 'spacer' }),
      h('span', { class: 'muted small', i18n: 'frames.tip' }),
      sizeInput,
    );
    this.grid = h('div', { class: 'frame-grid' });
    this.grid.addEventListener('pointerdown', (e) => this.onGridDown(e));
    this.grid.addEventListener('pointerover', (e) => this.onGridOver(e));
    this.grid.addEventListener('dblclick', (e) => this.onGridDbl(e));
    window.addEventListener('pointerup', () => (this.paint = null));

    // export boxes
    this.fpsInput = h('input', { type: 'number', min: 1, max: 60, value: this.animFps, class: 'num' });
    this.fpsInput.addEventListener('change', () => {
      this.animFps = clamp(Math.round(Number(this.fpsInput.value) || 10), 1, 60);
      this.fpsInput.value = String(this.animFps);
      this.restartPreview();
    });
    const loop = h('input', { type: 'checkbox', checked: true });
    loop.addEventListener('change', () => (this.animLoop = loop.checked));
    const sizes = [0, 1080, 720, 480, 360, 240].map((s) => ({ value: s, label: s ? `${s}p` : 'opt.original', raw: s > 0 }));
    this.previewImg = h('img', { class: 'anim-preview', alt: '' });

    this.exportBox = h(
      'div',
      { class: 'frames-export' },
      h(
        'div',
        { class: 'export-card' },
        h('h3', null, icon('image'), h('span', { i18n: 'frames.asImages' })),
        h('div', { class: 'options compact-grid' },
          h('label', { class: 'field' }, h('span', { class: 'field-label', i18n: 'opt.format' }),
            select<'png' | 'jpg' | 'webp'>(
              [
                { value: 'png', label: 'PNG', raw: true },
                { value: 'jpg', label: 'JPG', raw: true },
                { value: 'webp', label: 'WebP', raw: true },
              ],
              'png',
              (f) => (this.imgFormat = f),
            )),
          h('label', { class: 'field' }, h('span', { class: 'field-label', i18n: 'opt.resolution' }), select(sizes, 0, (s) => (this.imgSize = s))),
        ),
        h('button', { class: 'btn primary', onclick: () => this.exportImages() }, icon('archive'), h('span', { i18n: 'frames.exportImages' })),
      ),
      h(
        'div',
        { class: 'export-card' },
        h('h3', null, icon('sparkles'), h('span', { i18n: 'frames.asAnimation' })),
        h('div', { class: 'anim-row' },
          this.previewImg,
          h('div', { class: 'options compact-grid' },
            h('label', { class: 'field' }, h('span', { class: 'field-label', i18n: 'opt.format' }),
              select<FormatId>(
                (['gif', 'webp_anim', 'apng', 'mp4', 'webm'] as FormatId[]).map((f) => ({ value: f, label: formatDef(f).label, raw: true })),
                'gif',
                (f) => (this.animFormat = f),
              )),
            h('label', { class: 'field' }, h('span', { class: 'field-label', i18n: 'frames.playFps' }), this.fpsInput),
            h('label', { class: 'field' }, h('span', { class: 'field-label', i18n: 'opt.resolution' }), select(sizes, 0, (s) => (this.animSize = s))),
            h('label', { class: 'field' }, h('span', { class: 'field-label', i18n: 'opt.quality' }),
              select<Quality>(
                [
                  { value: 'high', label: 'opt.qHigh' },
                  { value: 'medium', label: 'opt.qMedium' },
                  { value: 'low', label: 'opt.qLow' },
                ],
                'medium',
                (q) => (this.animQuality = q),
              )),
            h('label', { class: 'field check' }, loop, h('span', { i18n: 'opt.loop' })),
          ),
        ),
        h('button', { class: 'btn primary', onclick: () => this.exportAnimation() }, icon('sparkles'), h('span', { i18n: 'frames.compose' })),
      ),
    );

    this.el = h(
      'div',
      { class: 'panel-body frames-panel' },
      h('p', { class: 'muted small', i18n: 'frames.intro' }),
      h('div', { class: 'frames-controls' },
        h('label', { class: 'field' }, h('span', { class: 'field-label', i18n: 'frames.sampling' }), samplingSel),
        h('label', { class: 'field value-field' }, this.valueLabel, this.valueInput),
        this.estimate,
        h('span', { class: 'spacer' }),
        this.extractBtn,
      ),
      this.toolbar,
      this.grid,
      this.exportBox,
    );

    store.currentChanged.on(() => this.onItem());
    store.rangeChanged.on((item) => item === store.current && this.renderEstimate());
    store.itemsChanged.on(() => {
      if (this.data && !store.items.some((i) => i.id === this.data!.itemId)) this.reset();
    });
    onLangChange.on(() => {
      this.renderEstimate();
      this.renderCount();
    });
    this.syncSampling();
    this.onItem();
  }

  private get item(): MediaItem | null {
    const item = store.current;
    return item?.status === 'ready' && item.info?.video && (item.kind === 'video' || item.kind === 'animation') ? item : null;
  }

  private onItem() {
    const item = this.item;
    this.extractBtn.disabled = !item;
    if (this.data && this.data.itemId !== store.currentId) this.reset();
    this.renderEstimate();
  }

  private syncSampling() {
    const s = this.sampling;
    (this.valueInput.parentElement as HTMLElement).hidden = s === 'all';
    if (s !== 'all') {
      this.valueInput.value = String(this.values[s]);
      const key = `frames.value.${s}`;
      this.valueLabel.dataset.i18n = key;
      this.valueLabel.textContent = t(key);
    }
    this.renderEstimate();
  }

  private stepFor(item: MediaItem): number {
    const v = item.info!.video!;
    const total = Math.max(1, Math.round((item.range.end - item.range.start) * v.fps));
    switch (this.sampling) {
      case 'all':
        return 1;
      case 'every':
        return Math.max(1, this.values.every);
      case 'fps':
        return Math.max(1, Math.round(v.fps / Math.max(1, this.values.fps)));
      case 'count':
        return Math.max(1, Math.floor(total / Math.max(1, this.values.count)));
    }
  }

  private renderEstimate() {
    const item = this.item;
    if (!item) {
      this.estimate.textContent = store.current?.kind === 'image' || store.current?.kind === 'audio' ? t('frames.notApplicable') : '';
      return;
    }
    const v = item.info!.video!;
    const total = Math.max(1, Math.round((item.range.end - item.range.start) * v.fps));
    const step = this.stepFor(item);
    this.estimate.textContent = t('frames.estimate', {
      n: Math.ceil(total / step),
      range: `${formatTime(item.range.start)} → ${formatTime(item.range.end)}`,
    });
  }

  private reset() {
    clearInterval(this.previewTimer);
    if (this.data) for (const f of this.data.frames) URL.revokeObjectURL(f.url);
    this.data = null;
    this.selected.clear();
    this.cells = [];
    this.grid.replaceChildren();
    this.el.classList.remove('has-frames');
    this.previewImg.removeAttribute('src');
  }

  private extract() {
    const item = this.item;
    if (!item) return;
    const v = item.info!.video!;
    const segment = { ...item.range };
    const step = this.stepFor(item);
    const est = Math.ceil(Math.max(1, Math.round((segment.end - segment.start) * v.fps)) / step);
    if (est > MAX_FRAMES) {
      toast(t('frames.tooMany', { n: est, max: MAX_FRAMES }), 'error', 5000);
      return;
    }
    if (est > WARN_FRAMES && !confirm(t('frames.confirmMany', { n: est }))) return;
    this.player.pause();
    void tasks
      .run(t('task.extract', { name: item.name }), (api) =>
        extractThumbnails(item, segment, step, api.signal, (r) => api.progress(r)),
      )
      .then((frames) => {
        if (!frames) return;
        if (store.currentId !== item.id) {
          for (const f of frames) URL.revokeObjectURL(f.url);
          return;
        }
        this.reset();
        this.data = { itemId: item.id, segment, step, frames };
        this.renderGrid();
        if (!frames.length) toast(t('frames.none'), 'error');
        this.animFps = clamp(Math.round(v.fps / step), 1, 30);
        this.fpsInput.value = String(this.animFps);
      });
  }

  private renderGrid() {
    const d = this.data;
    if (!d) return;
    this.el.classList.add('has-frames');
    this.cells = d.frames.map((f, i) =>
      h(
        'div',
        { class: 'frame-cell', 'data-i': i, title: `#${f.frame} · ${formatTime(f.time)}` },
        h('img', { src: f.url, alt: `#${f.frame}`, draggable: false, loading: 'lazy' }),
        h('span', { class: 'frame-check' }, icon('check', 14)),
        h('span', { class: 'frame-label mono' }, `#${f.frame}`, h('small', null, formatTime(f.time))),
      ),
    );
    this.grid.replaceChildren(...this.cells);
    this.renderCount();
  }

  private renderCount() {
    if (!this.data) return;
    this.countLabel.textContent = t('frames.selected', { n: this.selected.size, total: this.data.frames.length });
    this.exportBox.classList.toggle('disabled', this.selected.size === 0);
    this.restartPreview();
  }

  private setSel(i: number, on: boolean) {
    if (on) this.selected.add(i);
    else this.selected.delete(i);
    this.cells[i]?.classList.toggle('sel', on);
  }

  private cellIndex(e: Event): number {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('.frame-cell');
    return cell ? Number(cell.dataset.i) : -1;
  }

  private onGridDown(e: PointerEvent) {
    const i = this.cellIndex(e);
    if (i < 0 || e.button !== 0) return;
    if (e.shiftKey && this.anchor >= 0) {
      const [a, b] = this.anchor < i ? [this.anchor, i] : [i, this.anchor];
      for (let k = a; k <= b; k++) this.setSel(k, true);
    } else {
      const on = !this.selected.has(i);
      this.setSel(i, on);
      // mouse drag paints the same state over other cells
      if (e.pointerType === 'mouse') this.paint = on;
      this.anchor = i;
    }
    this.renderCount();
  }

  private onGridOver(e: PointerEvent) {
    if (this.paint === null || !(e.buttons & 1)) return;
    const i = this.cellIndex(e);
    if (i < 0 || this.selected.has(i) === this.paint) return;
    this.setSel(i, this.paint);
    this.renderCount();
  }

  private onGridDbl(e: MouseEvent) {
    const i = this.cellIndex(e);
    const f = this.data?.frames[i];
    if (!f) return;
    this.player.seek(f.time + 0.5 / (this.item?.info?.video?.fps || 30));
    this.player.el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  private selectAll(on: boolean) {
    if (!this.data) return;
    for (let i = 0; i < this.data.frames.length; i++) this.setSel(i, on);
    this.renderCount();
  }

  private invert() {
    if (!this.data) return;
    for (let i = 0; i < this.data.frames.length; i++) this.setSel(i, !this.selected.has(i));
    this.renderCount();
  }

  /** Loops the picked thumbnails at the chosen playback rate. */
  private restartPreview() {
    clearInterval(this.previewTimer);
    const d = this.data;
    const picks = [...this.selected].sort((a, b) => a - b);
    if (!d || !picks.length) {
      this.previewImg.removeAttribute('src');
      return;
    }
    let k = 0;
    const show = () => {
      this.previewImg.src = d.frames[picks[k % picks.length]].url;
      k++;
    };
    show();
    if (picks.length > 1) this.previewTimer = window.setInterval(show, 1000 / this.animFps);
  }

  private picks(): { item: MediaItem; d: Extraction; indices: number[] } | null {
    const d = this.data;
    const item = store.items.find((i) => i.id === d?.itemId);
    if (!d || !item || !this.selected.size) {
      toast(t('frames.pickFirst'), 'error');
      return null;
    }
    return { item, d, indices: [...this.selected].sort((a, b) => a - b) };
  }

  private exportImages() {
    const p = this.picks();
    if (!p) return;
    const { item, d, indices } = p;
    const def = formatDef(this.imgFormat);
    const base = baseName(item.name);
    const names = indices.map((i) => `${base}_frame${String(d.frames[i].frame).padStart(6, '0')}.${def.ext}`);
    const fmt = this.imgFormat;
    const size = this.imgSize;
    void tasks
      .run(t('task.exportFrames', { n: indices.length }), async (api) => {
        const files = await exportFrames(
          item, d.segment, d.step, indices,
          { format: fmt, shortSide: size, quality: 'high' },
          cropPixels(item), api.signal, (r) => api.progress(r),
        );
        if (files.length === 1) return [{ name: names[0], blob: new Blob([files[0] as BlobPart], { type: def.mime }) }];
        api.progress(null, t('stage.zip'));
        const entries: Record<string, Uint8Array> = {};
        files.forEach((f, i) => (entries[names[i] ?? `${base}_${i}.${def.ext}`] = f));
        const zip = zipSync(entries, { level: 0 });
        return [{ name: `${base}_frames.zip`, blob: new Blob([zip as BlobPart], { type: 'application/zip' }) }];
      })
      .then((outs) => {
        if (!outs) return;
        for (const o of outs) store.addOutput(o.name, o.blob, o.name.endsWith('.zip') ? 'zip' : 'image');
        toast(t('toast.exported', { name: outs[0].name }), 'success');
      });
  }

  private exportAnimation() {
    const p = this.picks();
    if (!p) return;
    const { item, d, indices } = p;
    const def = formatDef(this.animFormat);
    const opts = { ...defaultOptions(this.animFormat), shortSide: this.animSize, quality: this.animQuality, loop: this.animLoop };
    const rate = this.animFps;
    const name = `${baseName(item.name)}_${indices.length}frames.${def.ext}`;
    void tasks
      .run(t('task.compose', { name }), (api) =>
        composeFrames(item, d.segment, d.step, indices, opts, rate, cropPixels(item), api.signal, (r) => api.progress(r)),
      )
      .then((blob) => {
        if (!blob) return;
        store.addOutput(name, blob, def.group);
        toast(t('toast.exported', { name }), 'success');
      });
  }
}
