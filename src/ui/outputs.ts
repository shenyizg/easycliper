import { zipSync } from 'fflate';
import { onLangChange, t } from '../i18n';
import { store, type OutputItem } from '../state';
import { tasks } from '../tasks';
import { append, downloadBlob, formatBytes, h } from '../utils';
import { icon } from './icons';
import { modal } from './overlay';

const isImageLike = (o: OutputItem) => o.group === 'image' || o.group === 'animation';

function previewEl(o: OutputItem, full: boolean): HTMLElement {
  if (isImageLike(o)) return h('img', { src: o.url, alt: o.name, draggable: false });
  if (o.group === 'video') {
    const v = h('video', { src: o.url, muted: !full, controls: full, playsInline: true, preload: 'metadata', loop: full });
    if (full) v.autoplay = true;
    return v;
  }
  if (o.group === 'audio') return full ? h('audio', { src: o.url, controls: true, autoplay: true }) : h('span', { class: 'out-icon' }, icon('music', 26));
  return h('span', { class: 'out-icon' }, icon('archive', 26));
}

export class OutputsPanel {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private head: HTMLElement;

  constructor() {
    this.list = h('div', { class: 'out-list' });
    this.head = h('div', { class: 'panel-head' });
    this.el = h('aside', { class: 'outputs panel' }, this.head, this.list);
    store.outputsChanged.on(() => this.render());
    onLangChange.on(() => this.render());
    this.render();
  }

  private render() {
    const outs = store.outputs;
    this.head.replaceChildren();
    append(this.head, [
      h('h2', null, t('outputs.title'), outs.length ? h('span', { class: 'count' }, String(outs.length)) : null),
      h('span', { class: 'spacer' }),
      outs.length > 1 ? h('button', { class: 'btn small', onclick: () => this.downloadAll() }, icon('archive', 16), h('span', { i18n: 'outputs.downloadAll' })) : null,
      outs.length ? h('button', { class: 'icon-btn', i18nTitle: 'outputs.clear', onclick: () => this.clear() }, icon('trash', 16)) : null,
    ]);
    this.list.replaceChildren();
    if (!outs.length) {
      this.list.append(h('p', { class: 'muted small empty', i18n: 'outputs.empty' }));
      return;
    }
    for (const o of outs) {
      const canPreview = o.group !== 'zip';
      this.list.append(
        h(
          'div',
          { class: 'out-card' },
          h('button', { class: 'out-thumb', disabled: !canPreview, onclick: () => this.preview(o), i18nTitle: 'outputs.preview' }, previewEl(o, false)),
          h(
            'div',
            { class: 'out-info' },
            h('div', { class: 'out-name', title: o.name }, o.name),
            h('div', { class: 'muted small' }, formatBytes(o.blob.size)),
            h(
              'div',
              { class: 'out-actions' },
              h('a', { class: 'btn small primary', href: o.url, download: o.name }, icon('download', 15), h('span', { i18n: 'outputs.download' })),
              h('button', { class: 'icon-btn', i18nTitle: 'outputs.remove', onclick: () => store.removeOutput(o.id) }, icon('trash', 15)),
            ),
          ),
        ),
      );
    }
  }

  private preview(o: OutputItem) {
    const body = h(
      'div',
      { class: 'out-preview' },
      previewEl(o, true),
      h('div', { class: 'muted small' }, `${o.name} · ${formatBytes(o.blob.size)}`),
      h('a', { class: 'btn primary', href: o.url, download: o.name }, icon('download', 16), h('span', { i18n: 'outputs.download' })),
    );
    modal(o.name, body, { wide: true });
  }

  private clear() {
    if (confirm(t('outputs.confirmClear'))) store.clearOutputs();
  }

  private downloadAll() {
    const outs = [...store.outputs];
    void tasks
      .run(t('task.zipAll', { n: outs.length }), async (api) => {
        const entries: Record<string, Uint8Array> = {};
        const used = new Set<string>();
        for (let i = 0; i < outs.length; i++) {
          let name = outs[i].name;
          for (let k = 2; used.has(name); k++) name = outs[i].name.replace(/(\.[^.]+)?$/, `_${k}$1`);
          used.add(name);
          entries[name] = new Uint8Array(await outs[i].blob.arrayBuffer());
          api.progress((i + 1) / outs.length);
        }
        return new Blob([zipSync(entries, { level: 0 }) as BlobPart], { type: 'application/zip' });
      })
      .then((zip) => zip && downloadBlob(zip, 'easycliper-exports.zip'));
  }
}
