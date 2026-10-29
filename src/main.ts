import './styles.css';
import { engine } from './engine/ffmpeg';
import { getLang, onLangChange, setLang, t } from './i18n';
import { importFiles } from './importer';
import { store } from './state';
import { tasks } from './tasks';
import { ClipPanel } from './ui/clip-panel';
import { ConvertPanel } from './ui/convert-panel';
import { FramesPanel } from './ui/frames-panel';
import { icon } from './ui/icons';
import { LibraryPanel } from './ui/library';
import { OutputsPanel } from './ui/outputs';
import { modal } from './ui/overlay';
import { Player } from './ui/player';
import { TaskTray } from './ui/tray';
import { h, storageGet, storageSet } from './utils';

const REPO_URL: string = import.meta.env.VITE_REPO_URL ?? '';

type Tab = 'clip' | 'frames' | 'convert';
const TABS: { id: Tab; icon: string }[] = [
  { id: 'clip', icon: 'scissors' },
  { id: 'frames', icon: 'grid' },
  { id: 'convert', icon: 'convert' },
];

const LOGO =
  '<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b8cff"/><stop offset="1" stop-color="#9b5bff"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#lg)"/><path d="M11 9.5v13l11-6.5z" fill="#fff"/><path d="M7 7h3M7 7v3M25 25h-3M25 25v-3" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>';

function engineChip(): HTMLElement {
  const chip = h('button', {
    class: 'chip engine',
    i18nTitle: 'engine.hint',
    onclick: () => {
      if (engine.status === 'idle' || engine.status === 'error') void engine.load().catch(() => undefined);
    },
  });
  const render = () => {
    const s = engine.status;
    chip.dataset.state = s;
    const label = s === 'loading' ? t('engine.loading', { pct: Math.round(engine.loadProgress * 100) }) : t(`engine.${s}`);
    chip.replaceChildren(icon('cpu', 15), h('span', null, label));
  };
  engine.statusChanged.on(render);
  onLangChange.on(render);
  render();
  return chip;
}

function showHelp() {
  const keys: [string[], string][] = [
    [['Space', 'K'], 'help.k.play'],
    [['←', '→'], 'help.k.step'],
    [['Shift + ←', 'Shift + →'], 'help.k.jump'],
    [['I', 'O'], 'help.k.inout'],
    [['Home', 'End'], 'help.k.edges'],
    [['S'], 'help.k.snap'],
  ];
  modal(
    t('help.title'),
    h(
      'div',
      { class: 'help' },
      h('h3', { i18n: 'help.shortcuts' }),
      h('dl', { class: 'keys' }, ...keys.flatMap(([k, d]) => [h('dt', null, ...k.map((x) => h('kbd', null, x))), h('dd', { i18n: d })])),
      h('h3', { i18n: 'help.formats' }),
      h('p', { i18n: 'help.formatsIn' }),
      h('p', { i18n: 'help.formatsOut' }),
      h('h3', { i18n: 'help.tips' }),
      h('ul', null, ...['help.tip1', 'help.tip2', 'help.tip3', 'help.tip4'].map((k) => h('li', { i18n: k }))),
      h('h3', { i18n: 'help.privacy' }),
      h('p', { i18n: 'help.privacyText' }),
    ),
  );
}

function isEditable(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && !!el.closest('input, textarea, select, [contenteditable="true"]');
}

function boot() {
  document.documentElement.lang = getLang() === 'zh' ? 'zh-CN' : 'en';
  const root = document.getElementById('app')!;
  if (typeof WebAssembly !== 'object') {
    root.append(h('p', { class: 'fatal', i18n: 'app.unsupported' }));
    return;
  }

  const player = new Player();
  const library = new LibraryPanel();
  const outputs = new OutputsPanel();
  const panels: Record<Tab, { el: HTMLElement }> = {
    clip: new ClipPanel(),
    frames: new FramesPanel(player),
    convert: new ConvertPanel(),
  };
  player.onImport = () => library.openPicker();

  const tabBody = h('div', { class: 'tab-body' });
  const tabButtons = TABS.map(({ id, icon: ic }) =>
    h('button', { class: 'tab', role: 'tab', 'data-tab': id, onclick: () => setTab(id) }, icon(ic), h('span', { i18n: `tab.${id}` })),
  );
  const saved = storageGet('easycliper.tab') as Tab | null;
  let tab: Tab = saved && saved in panels ? saved : 'clip';
  const setTab = (id: Tab) => {
    tab = id;
    storageSet('easycliper.tab', id);
    for (const b of tabButtons) {
      const on = b.dataset.tab === id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    }
    tabBody.replaceChildren(panels[id].el);
  };

  const header = h(
    'header',
    { class: 'topbar' },
    h('div', { class: 'brand' }, h('span', { class: 'logo' }), h('div', null, h('strong', null, 'EasyCliper'), h('span', { class: 'tagline', i18n: 'app.tagline' }))),
    h('span', { class: 'spacer' }),
    h('span', { class: 'chip local' }, icon('shield', 15), h('span', { i18n: 'app.local' })),
    engineChip(),
    h('button', { class: 'icon-btn', i18nTitle: 'help.button', onclick: showHelp }, icon('help')),
    h('button', { class: 'btn small ghost', onclick: () => setLang(getLang() === 'zh' ? 'en' : 'zh') }, icon('globe', 16), h('span', { i18n: 'lang.switch' })),
    REPO_URL ? h('a', { class: 'icon-btn', href: REPO_URL, target: '_blank', rel: 'noopener', i18nTitle: 'app.github' }, icon('github')) : null,
  );
  (header.querySelector('.logo') as HTMLElement).innerHTML = LOGO;

  const workspace = h(
    'main',
    { class: 'workspace' },
    player.el,
    h('section', { class: 'panel tabs-panel' }, h('nav', { class: 'tabs', role: 'tablist' }, ...tabButtons), tabBody),
  );
  root.append(header, h('div', { class: 'layout' }, library.el, workspace, outputs.el));

  const dropOverlay = h('div', { class: 'drop-overlay' }, h('div', null, icon('upload', 40), h('p', { i18n: 'drop.overlay' })));
  document.body.append(new TaskTray().el, dropOverlay);
  setTab(tab);

  // drag & drop anywhere
  const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
  let depth = 0;
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    depth++;
    dropOverlay.classList.add('show');
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (!depth) dropOverlay.classList.remove('show');
  });
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    dropOverlay.classList.remove('show');
    const files = Array.from(e.dataTransfer!.files);
    if (files.length) importFiles(files);
  });

  window.addEventListener('paste', (e) => {
    if (isEditable(e.target)) return;
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length) {
      e.preventDefault();
      importFiles(files);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || tab === 'convert') return;
    if (isEditable(e.target) || document.querySelector('.modal-backdrop')) return;
    if (e.target instanceof HTMLButtonElement && (e.key === ' ' || e.key === 'Enter')) return;
    if (player.handleKey(e)) e.preventDefault();
  });

  window.addEventListener('beforeunload', (e) => {
    if (store.outputs.length || tasks.active) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => undefined));
  }
}

boot();
