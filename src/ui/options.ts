import {
  defaultOptions,
  FORMATS,
  formatDef,
  GROUP_ORDER,
  type EncodeOptions,
  type FormatGroup,
  type FormatId,
  type Quality,
} from '../engine/formats';
import type { MediaInfo } from '../engine/probe';
import { onLangChange, t } from '../i18n';
import { Emitter, h, select } from '../utils';

const RES = [0, 2160, 1440, 1080, 720, 480, 360, 240, -1];
const FPS = [0, 60, 50, 30, 25, 24, 20, 15, 12, 10, 8, 5];
const SPEED = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const LOSSLESS = new Set<FormatId>(['wav', 'flac', 'png', 'bmp', 'tiff']);

type Field = 'mode' | 'res' | 'width' | 'fps' | 'quality' | 'speed' | 'audio' | 'loop' | 'fast';
const H264 = new Set<FormatId>(['mp4', 'mov', 'mkv']);

/** Output format + encoding settings, shared by the clip and convert panels. */
export class OptionsForm {
  readonly el: HTMLElement;
  readonly changed = new Emitter<EncodeOptions>();
  opts: EncodeOptions;

  private formatSel: HTMLSelectElement;
  private rows = {} as Record<Field, HTMLElement>;
  private controls = {} as {
    mode: HTMLElement;
    res: HTMLSelectElement;
    width: HTMLInputElement;
    fps: HTMLSelectElement;
    quality: HTMLSelectElement;
    speed: HTMLSelectElement;
    audio: HTMLInputElement;
    loop: HTMLInputElement;
    fast: HTMLInputElement;
  };
  private hint: HTMLElement;
  private allowed: FormatGroup[] = GROUP_ORDER;
  private info?: MediaInfo;
  private touched = new Set<'res' | 'fps'>();
  private customWidth = false;

  constructor(initial: FormatId = 'mp4') {
    this.opts = defaultOptions(initial);

    this.formatSel = h('select', { class: 'format-select' });
    this.buildFormatOptions();
    this.formatSel.value = initial;
    this.formatSel.addEventListener('change', () => this.setFormat(this.formatSel.value as FormatId));
    onLangChange.on(() => {
      this.buildFormatOptions();
      this.sync();
    });

    const modeEncode = h('button', { type: 'button', class: 'seg-btn on', i18n: 'opt.modeEncode', onclick: () => this.set({ copy: false }) });
    const modeCopy = h('button', { type: 'button', class: 'seg-btn', i18n: 'opt.modeCopy', onclick: () => this.set({ copy: true }) });
    const mode = h('div', { class: 'segmented' }, modeEncode, modeCopy);

    const res = select(
      RES.map((r) => ({ value: r, label: r === 0 ? 'opt.original' : r === -1 ? 'opt.customWidth' : `${r}p`, raw: r > 0 })),
      0,
      (r) => {
        this.touched.add('res');
        this.customWidth = r === -1;
        if (r === -1) {
          const w = this.opts.width || this.info?.video?.displayWidth || 640;
          this.controls.width.value = String(w);
          this.set({ width: w, shortSide: 0 });
        } else this.set({ shortSide: r, width: 0 });
      },
    );
    const width = h('input', { type: 'number', min: 16, max: 7680, step: 2, class: 'num' });
    width.addEventListener('change', () => {
      const w = Math.round(Number(width.value));
      if (w >= 16) this.set({ width: w });
    });
    const fps = select(
      FPS.map((f) => ({ value: f, label: f === 0 ? 'opt.original' : `${f} fps`, raw: f > 0 })),
      0,
      (f) => {
        this.touched.add('fps');
        this.set({ fps: f });
      },
    );
    const quality = select<Quality>(
      [
        { value: 'high', label: 'opt.qHigh' },
        { value: 'medium', label: 'opt.qMedium' },
        { value: 'low', label: 'opt.qLow' },
      ],
      'medium',
      (q) => this.set({ quality: q }),
    );
    const speed = select(SPEED.map((s) => ({ value: s, label: `${s}×`, raw: true })), 1, (s) => this.set({ speed: s }));
    const audio = h('input', { type: 'checkbox', checked: true });
    audio.addEventListener('change', () => this.set({ audio: audio.checked }));
    const loop = h('input', { type: 'checkbox', checked: true });
    loop.addEventListener('change', () => this.set({ loop: loop.checked }));
    const fast = h('input', { type: 'checkbox' });
    fast.addEventListener('change', () => this.set({ fast: fast.checked }));
    this.controls = { mode, res, width, fps, quality, speed, audio, loop, fast };

    const row = (key: Field, labelKey: string, control: HTMLElement) =>
      (this.rows[key] = h('label', { class: 'field' }, h('span', { class: 'field-label', i18n: labelKey }), control));
    const check = (key: Field, labelKey: string, control: HTMLInputElement) =>
      (this.rows[key] = h('label', { class: 'field check' }, control, h('span', { i18n: labelKey })));

    this.rows.mode = h('div', { class: 'field wide', role: 'group' }, h('span', { class: 'field-label', i18n: 'opt.mode' }), mode);
    this.hint = h('p', { class: 'hint' });
    this.el = h(
      'div',
      { class: 'options' },
      h('label', { class: 'field wide' }, h('span', { class: 'field-label', i18n: 'opt.format' }), this.formatSel),
      this.rows.mode,
      row('res', 'opt.resolution', res),
      row('width', 'opt.width', width),
      row('fps', 'opt.fps', fps),
      row('quality', 'opt.quality', quality),
      row('speed', 'opt.speed', speed),
      check('audio', 'opt.audio', audio),
      check('loop', 'opt.loop', loop),
      check('fast', 'opt.fast', fast),
      this.hint,
    );
    this.sync();
  }

  private buildFormatOptions() {
    const current = this.formatSel.value;
    this.formatSel.replaceChildren();
    for (const g of GROUP_ORDER) {
      const og = h('optgroup');
      og.label = t(`group.${g}`);
      og.dataset.group = g;
      for (const f of FORMATS.filter((x) => x.group === g)) {
        const o = h('option', null, f.label);
        o.value = f.id;
        og.appendChild(o);
      }
      this.formatSel.appendChild(og);
    }
    if (current) this.formatSel.value = current;
    this.applyAllowed();
  }

  /** Restrict selectable formats to the given groups (depends on the source media). */
  setAllowed(groups: FormatGroup[]): void {
    this.allowed = groups.length ? groups : GROUP_ORDER;
    this.applyAllowed();
    const g = formatDef(this.opts.format).group;
    if (!this.allowed.includes(g)) {
      const first = FORMATS.find((f) => this.allowed.includes(f.group));
      if (first) this.setFormat(first.id);
    }
  }

  private applyAllowed() {
    for (const og of Array.from(this.formatSel.querySelectorAll('optgroup'))) {
      og.disabled = !this.allowed.includes(og.dataset.group as FormatGroup);
    }
  }

  /** Source info drives smart defaults (e.g. GIF size/fps). */
  setSource(info: MediaInfo | undefined): void {
    this.info = info;
    this.autoDefaults();
    this.sync();
  }

  setFormat(id: FormatId): void {
    const before = formatDef(this.opts.format).group;
    this.opts.format = id;
    this.formatSel.value = id;
    const def = formatDef(id);
    if (!def.copy) this.opts.copy = false;
    if (def.group !== before) this.autoDefaults();
    this.sync();
    this.changed.emit(this.opts);
  }

  private autoDefaults() {
    const group = formatDef(this.opts.format).group;
    const v = this.info?.video;
    if (!this.touched.has('res') && !this.customWidth) {
      const minSide = v ? Math.min(v.displayWidth, v.displayHeight) : 0;
      this.opts.shortSide = group === 'animation' && minSide > 480 ? 480 : 0;
    }
    if (!this.touched.has('fps')) {
      this.opts.fps = group === 'animation' && v && v.fps > 25 ? 15 : 0;
    }
  }

  private set(patch: Partial<EncodeOptions>) {
    Object.assign(this.opts, patch);
    this.sync();
    this.changed.emit(this.opts);
  }

  private sync() {
    const o = this.opts;
    const def = formatDef(o.format);
    const g = def.group;
    const copy = o.copy && !!def.copy;
    const c = this.controls;
    c.mode.children[0].classList.toggle('on', !copy);
    c.mode.children[1].classList.toggle('on', copy);
    c.res.value = String(this.customWidth ? -1 : RES.includes(o.shortSide) ? o.shortSide : 0);
    c.width.value = String(o.width || '');
    c.fps.value = String(FPS.includes(o.fps) ? o.fps : 0);
    c.quality.value = o.quality;
    c.speed.value = String(o.speed);
    c.audio.checked = o.audio;
    c.loop.checked = o.loop;
    c.fast.checked = o.fast;

    const show: Record<Field, boolean> = {
      mode: g === 'video' && !!def.copy,
      res: g !== 'audio' && !copy,
      width: g !== 'audio' && !copy && this.customWidth,
      fps: (g === 'video' || g === 'animation') && !copy,
      quality: !copy && !LOSSLESS.has(def.id) && def.id !== 'apng',
      speed: g !== 'image' && !copy,
      audio: g === 'video',
      loop: g === 'animation',
      fast: H264.has(def.id) && !copy,
    };
    for (const k of Object.keys(show) as Field[]) this.rows[k].hidden = !show[k];

    const hints: string[] = [];
    if (copy) hints.push(t('opt.copyHint'));
    if (def.id === 'gif') hints.push(t('opt.gifHint'));
    if (def.id === 'apng') hints.push(t('opt.apngHint'));
    this.hint.textContent = hints.join(' ');
    this.hint.hidden = hints.length === 0;
  }
}
