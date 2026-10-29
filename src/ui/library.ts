import { onLangChange, t } from '../i18n';
import { importFiles } from '../importer';
import { store, type MediaItem } from '../state';
import { formatBytes, formatTime, h } from '../utils';
import { icon } from './icons';
import { Timeline } from './timeline';

export const ACCEPT =
  'video/*,image/*,audio/*,.mov,.mkv,.avi,.flv,.wmv,.asf,.ts,.mts,.m2ts,.3gp,.3g2,.m4v,.mpg,.mpeg,.vob,.ogv,.webm,.gif,.apng,.webp,.avif,.heic,.heif,.hif,.tif,.tiff,.bmp,.mp3,.m4a,.aac,.wav,.flac,.ogg,.opus,.wma,.amr';

const KIND_ICON = { video: 'film', animation: 'sparkles', image: 'image', audio: 'music' } as const;

export class LibraryPanel {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private input: HTMLInputElement;
  private cards = new Map<string, HTMLElement>();

  constructor() {
    this.input = h('input', { type: 'file', multiple: true, accept: ACCEPT, hidden: true });
    this.input.addEventListener('change', () => {
      if (this.input.files?.length) importFiles(Array.from(this.input.files));
      this.input.value = '';
    });
    this.list = h('div', { class: 'lib-list' });
    this.el = h(
      'aside',
      { class: 'library panel' },
      h('div', { class: 'panel-head' },
        h('h2', { i18n: 'library.title' }),
        h('button', { class: 'btn primary small', onclick: () => this.openPicker() }, icon('plus', 16), h('span', { i18n: 'library.import' })),
      ),
      h('button', { class: 'dropzone', onclick: () => this.openPicker() }, icon('upload', 22), h('span', { i18n: 'library.dropHint' })),
      this.list,
      this.input,
    );
    store.itemsChanged.on(() => this.render());
    store.itemUpdated.on((item) => this.renderCard(item));
    store.currentChanged.on(() => this.markActive());
    onLangChange.on(() => this.render());
    this.render();
  }

  openPicker(): void {
    this.input.click();
  }

  private render() {
    for (const id of [...this.cards.keys()]) {
      if (!store.items.some((i) => i.id === id)) {
        this.cards.delete(id);
        Timeline.forget(id);
      }
    }
    this.list.replaceChildren();
    for (const item of store.items) {
      this.list.appendChild(this.renderCard(item));
    }
    this.markActive();
  }

  private renderCard(item: MediaItem): HTMLElement {
    let card = this.cards.get(item.id);
    if (!card) {
      card = h('div', {
        class: 'lib-card',
        tabindex: 0,
        role: 'button',
        onclick: () => store.select(item.id),
        onkeydown: (e: KeyboardEvent) => {
          if (e.key === 'Enter') store.select(item.id);
        },
      });
      this.cards.set(item.id, card);
    }
    const thumb = item.thumb
      ? h('img', { src: item.thumb, alt: '', draggable: false })
      : h('span', { class: 'lib-thumb-icon' }, icon(KIND_ICON[item.kind] ?? 'film', 22));
    const meta: string[] = [];
    if (item.status === 'ready') {
      meta.push(t(`kind.${item.kind}`));
      const v = item.info?.video;
      if (v) meta.push(`${v.displayWidth}×${v.displayHeight}`);
      if (item.kind !== 'image' && item.info) meta.push(formatTime(item.info.duration, false));
    }
    meta.push(formatBytes(item.file.size));

    let status: HTMLElement | null = null;
    if (item.status === 'processing' || item.status === 'pending') {
      const pct = item.progress != null ? Math.round(item.progress * 100) : null;
      status = h(
        'div',
        { class: 'lib-status' },
        h('span', { class: 'muted small' }, `${t(item.stage ?? 'library.queued')}${pct != null ? ` ${pct}%` : ''}`),
        h('div', { class: `bar${pct == null ? ' indeterminate' : ''}` }, h('i', { style: { width: `${pct ?? 30}%` } })),
      );
    } else if (item.status === 'error') {
      status = h('div', { class: 'lib-status error small' }, item.error ?? t('library.failed'));
    }

    card.replaceChildren(
      h('div', { class: 'lib-thumb' }, thumb),
      h(
        'div',
        { class: 'lib-info' },
        h('div', { class: 'lib-name', title: item.name }, item.name),
        h('div', { class: 'muted small' }, meta.join(' · ')),
        status,
      ),
      h(
        'button',
        {
          class: 'icon-btn lib-remove',
          title: t('library.remove'),
          onclick: (e: MouseEvent) => {
            e.stopPropagation();
            store.remove(item.id);
          },
        },
        icon('x', 16),
      ),
    );
    card.classList.toggle('error', item.status === 'error');
    return card;
  }

  private markActive() {
    for (const [id, card] of this.cards) card.classList.toggle('active', id === store.currentId);
  }
}
