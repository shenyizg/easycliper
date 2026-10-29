/** Browser-side helpers: native playability checks and thumbnails. */

function waitEvent(target: EventTarget, ok: string[], fail: string[], timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      clearTimeout(timer);
      for (const e of ok) target.removeEventListener(e, onOk);
      for (const e of fail) target.removeEventListener(e, onFail);
      resolve(v);
    };
    const onOk = () => done(true);
    const onFail = () => done(false);
    for (const e of ok) target.addEventListener(e, onOk);
    for (const e of fail) target.addEventListener(e, onFail);
    const timer = setTimeout(() => done(false), timeoutMs);
  });
}

function release(media: HTMLMediaElement) {
  media.removeAttribute('src');
  media.load();
}

/** True when the browser can decode the video track (not just the container/audio). */
export async function canPlayVideo(url: string, timeoutMs = 8000): Promise<boolean> {
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  const loaded = await waitEvent(v, ['loadeddata'], ['error'], timeoutMs);
  const ok = loaded && v.videoWidth > 0 && v.videoHeight > 0;
  release(v);
  return ok;
}

export async function canPlayAudio(url: string, timeoutMs = 6000): Promise<boolean> {
  const a = document.createElement('audio');
  a.preload = 'auto';
  a.src = url;
  const ok = await waitEvent(a, ['loadeddata', 'canplay'], ['error'], timeoutMs);
  release(a);
  return ok;
}

export async function canShowImage(url: string): Promise<boolean> {
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    return img.naturalWidth > 0;
  } catch {
    return false;
  }
}

function drawThumb(src: CanvasImageSource, w: number, h: number, maxH = 96): string {
  const scale = Math.min(1, maxH / h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext('2d')!.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

export async function videoThumb(url: string, at: number): Promise<string | undefined> {
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  try {
    if (!(await waitEvent(v, ['loadeddata'], ['error'], 8000))) return undefined;
    if (at > 0 && Number.isFinite(v.duration)) {
      v.currentTime = Math.min(at, v.duration * 0.5);
      await waitEvent(v, ['seeked'], ['error'], 4000);
    }
    return drawThumb(v, v.videoWidth, v.videoHeight);
  } catch {
    return undefined;
  } finally {
    release(v);
  }
}

export async function imageThumb(url: string): Promise<string | undefined> {
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    return drawThumb(img, img.naturalWidth, img.naturalHeight);
  } catch {
    return undefined;
  }
}

/**
 * Seeks a hidden <video> through the clip and hands back evenly spaced frames,
 * used for the timeline film strip.
 */
export async function filmStrip(
  url: string,
  duration: number,
  count: number,
  tileH: number,
  onTile: (index: number, tile: HTMLCanvasElement) => void,
  isCancelled: () => boolean,
): Promise<void> {
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  try {
    if (!(await waitEvent(v, ['loadeddata'], ['error'], 8000))) return;
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : duration;
    const tileW = Math.max(1, Math.round((tileH * v.videoWidth) / v.videoHeight));
    for (let i = 0; i < count; i++) {
      if (isCancelled()) return;
      v.currentTime = Math.min(dur - 0.001, ((i + 0.5) * dur) / count);
      await waitEvent(v, ['seeked'], ['error'], 4000);
      if (isCancelled()) return;
      const c = document.createElement('canvas');
      c.width = tileW;
      c.height = tileH;
      c.getContext('2d')!.drawImage(v, 0, 0, tileW, tileH);
      onTile(i, c);
    }
  } finally {
    release(v);
  }
}
