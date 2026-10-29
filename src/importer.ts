import { apngDuration } from './engine/png';
import { decodeAnimationWithBrowser, decodeHeic, decodeStillWithBrowser, sniff, type BrowserDecoded } from './engine/decoders';
import { CancelledError } from './engine/ffmpeg';
import type { MediaKind } from './engine/formats';
import { isStillImageFormat, probe, type MediaInfo } from './engine/probe';
import { t } from './i18n';
import { makeAudioProxy, makeVideoProxy, stillToPng } from './jobs';
import { canPlayAudio, canPlayVideo, canShowImage, imageThumb, videoThumb } from './media';
import { store, type MediaItem } from './state';
import { describeError, tasks, type TaskApi } from './tasks';
import { baseName, extName, uid } from './utils';

/** Abort handles for in-flight imports, so removing a card stops its work. */
const pending = new Map<string, AbortController>();
store.itemsChanged.on(() => {
  for (const [id, ctrl] of pending) {
    if (!store.items.some((i) => i.id === id)) {
      ctrl.abort();
      pending.delete(id);
    }
  }
});

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'apng', 'gif', 'webp', 'avif', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'hif', 'jxl', 'ico', 'svg']);
const FRAME_COUNT_EXT = new Set(['gif', 'png', 'apng']);

export function importFiles(files: File[]): void {
  for (const file of files) {
    const item: MediaItem = {
      id: uid('m'),
      name: file.name,
      file,
      source: file,
      kind: 'video',
      proxy: false,
      status: 'pending',
      notes: [],
      range: { start: 0, end: 0 },
      crop: null,
    };
    const ctrl = new AbortController();
    pending.set(item.id, ctrl);
    store.add(item);
    if (!store.currentId) store.select(item.id);
    void tasks
      .run(t('task.import', { name: file.name }), (api) => processItem(item, api), { quiet: true, signal: ctrl.signal })
      .then((ok) => {
        pending.delete(item.id);
        if (ok === undefined && item.status !== 'ready') {
          store.update(item, { status: 'error', error: item.error ?? t('task.cancelled'), stage: undefined });
        }
      });
  }
}

function stage(item: MediaItem, api: TaskApi, key: string, progress: number | null = null) {
  store.update(item, { stage: key, progress: progress ?? undefined });
  api.progress(progress, t(key));
}

async function processItem(item: MediaItem, api: TaskApi): Promise<true> {
  const { file } = item;
  const { signal } = api;
  const ext = extName(file.name);
  const base = baseName(file.name);
  const looksImage = file.type.startsWith('image/') || IMAGE_EXT.has(ext);
  store.update(item, { status: 'processing' });

  try {
    stage(item, api, 'stage.analyzing');
    let source = file;
    let animated = false;
    /** Exact duration when we built the intermediate ourselves. */
    let knownDuration = 0;
    const kind0 = await sniff(file, file.name);

    if (kind0 === 'heic') {
      stage(item, api, 'stage.heic');
      const png = await decodeHeic(file);
      source = new File([png], `${base}.png`, { type: 'image/png' });
      item.notes.push('note.heic');
    } else if (kind0 === 'webp-anim' || kind0 === 'avif') {
      const mime = kind0 === 'avif' ? 'image/avif' : 'image/webp';
      stage(item, api, 'stage.decodeFrames', 0);
      let decoded: BrowserDecoded | null = null;
      try {
        decoded = await decodeAnimationWithBrowser(file, mime, (r) => {
          store.update(item, { progress: r });
          api.progress(r);
        });
      } catch (err) {
        // AVIF is usually a still image: <img>-style decoding still works without ImageDecoder
        if (kind0 !== 'avif') throw err;
      }
      decoded ??= { kind: 'still', png: await decodeStillWithBrowser(file) };
      if (decoded.kind === 'animation') {
        source = new File([decoded.apng as BlobPart], `${base}.apng`, { type: 'image/apng' });
        animated = true;
        knownDuration = decoded.duration;
      } else {
        source = new File([decoded.png], `${base}.png`, { type: 'image/png' });
      }
      item.notes.push('note.browserDecoded');
    }

    stage(item, api, 'stage.probe');
    let info: MediaInfo;
    try {
      info = await probe(source, source.name, animated || FRAME_COUNT_EXT.has(ext) || file.type === 'image/gif', signal);
      if (!info.video && !info.audio) throw new Error('unrecognized');
    } catch (err) {
      if (err instanceof CancelledError || !looksImage || source !== file) throw err;
      // ffmpeg cannot read it, but the browser may (e.g. some AVIF/JXL/ICO/SVG)
      source = new File([await decodeStillWithBrowser(file)], `${base}.png`, { type: 'image/png' });
      item.notes.push('note.browserDecoded');
      info = await probe(source, source.name, false, signal);
    }

    // show the original format, not the intermediate we decoded it into
    if (info.video && source !== file) info.video.codec = kind0 === 'other' ? ext || 'image' : kind0 === 'webp-anim' ? 'webp' : kind0;
    if (knownDuration > 0) info.duration = knownDuration;
    else if (/(^|,)apng($|,)/.test(info.format)) {
      // ffprobe reports no duration for APNG: add up the frame delays ourselves
      const d = apngDuration(new Uint8Array(await source.arrayBuffer()));
      if (d > 0) info.duration = d;
    }

    const v = info.video;
    let kind: MediaKind;
    if (!v) kind = 'audio';
    else if (animated || /(^|,)(gif|apng)($|,)/.test(info.format)) kind = v.frames > 1 ? 'animation' : 'image';
    else if (isStillImageFormat(info.format) || (v.frames <= 1 && !info.audio && info.duration <= 0.1)) kind = 'image';
    else kind = 'video';

    store.update(item, { source, info, kind, range: { start: 0, end: info.duration } });

    // Preview
    stage(item, api, 'stage.preview');
    let previewUrl: string | undefined;
    let proxy = false;
    if (kind === 'image') {
      const url = URL.createObjectURL(source);
      if (await canShowImage(url)) previewUrl = url;
      else {
        URL.revokeObjectURL(url);
        previewUrl = URL.createObjectURL(await stillToPng(source, signal));
      }
    } else if (kind === 'audio') {
      const url = URL.createObjectURL(file);
      if (await canPlayAudio(url)) previewUrl = url;
      else {
        URL.revokeObjectURL(url);
        stage(item, api, 'stage.proxy', 0);
        previewUrl = URL.createObjectURL(
          await makeAudioProxy(source, info, signal, (r) => {
            store.update(item, { progress: r });
            api.progress(r);
          }),
        );
        proxy = true;
      }
    } else {
      const url = kind === 'video' ? URL.createObjectURL(file) : '';
      if (url && (await canPlayVideo(url))) previewUrl = url;
      else {
        if (url) URL.revokeObjectURL(url);
        stage(item, api, 'stage.proxy', 0);
        const blob = await makeVideoProxy(source, info, kind === 'video', signal, (r) => {
          store.update(item, { progress: r });
          api.progress(r);
        });
        previewUrl = URL.createObjectURL(blob);
        proxy = true;
        if (kind === 'video') item.notes.push('note.proxy');
      }
    }

    let thumb: string | undefined;
    if (kind === 'image') thumb = await imageThumb(previewUrl);
    else if (kind !== 'audio') thumb = await videoThumb(previewUrl, Math.min(1, info.duration * 0.1));

    store.update(item, { previewUrl, proxy, thumb, status: 'ready', stage: undefined, progress: undefined });
    return true;
  } catch (err) {
    store.update(item, { status: 'error', error: describeError(err), stage: undefined, progress: undefined });
    throw err;
  }
}
