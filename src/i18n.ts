// Deliberately dependency-free: utils.ts imports from here.
type Dict = Record<string, string>;

const zh: Dict = {
  'app.tagline': '视频 / 动图剪辑 · 完全在浏览器本地运行',
  'app.local': '本地处理 · 文件不上传',
  'app.github': 'GitHub 源码',
  'app.unsupported': '当前浏览器缺少 WebAssembly 或模块 Worker 支持，请使用最新版 Chrome、Edge、Firefox 或 Safari。',
  'lang.switch': 'English',
  'help.button': '帮助与快捷键',
  'engine.idle': '引擎未加载',
  'engine.loading': '加载引擎 {pct}%',
  'engine.ready': '引擎就绪',
  'engine.error': '引擎加载失败，点击重试',
  'engine.hint': 'FFmpeg (WebAssembly) 约 30 MB，首次使用时下载，之后由浏览器缓存。点击可预加载。',
  'tab.clip': '剪辑导出',
  'tab.frames': '抽帧',
  'tab.convert': '格式转换',
  'drop.overlay': '松开鼠标导入文件',
  'common.close': '关闭',

  'library.title': '媒体库',
  'library.import': '导入文件',
  'library.dropHint': '拖入或点击选择视频、动图、图片、音频',
  'library.remove': '移除',
  'library.queued': '排队中',
  'library.failed': '导入失败',
  'library.processing': '处理中',
  'kind.video': '视频',
  'kind.animation': '动图',
  'kind.image': '图片',
  'kind.audio': '音频',

  'stage.analyzing': '正在分析',
  'stage.heic': '正在解码 HEIC',
  'stage.decodeFrames': '正在解码动图帧',
  'stage.probe': '正在读取媒体信息',
  'stage.preview': '正在准备预览',
  'stage.proxy': '浏览器无法直接播放，正在生成预览',
  'stage.zip': '正在打包',
  'note.heic': 'HEIC 已解码',
  'note.browserDecoded': '由浏览器解码',
  'note.proxy': '预览为低清代理，导出使用原文件',

  'player.empty': '导入视频、GIF、HEIC 等文件开始剪辑',
  'player.privacy': '所有处理都在你的设备上完成，文件不会上传到任何服务器。',
  'player.play': '播放 / 暂停（空格）',
  'player.prevFrame': '上一帧（←）',
  'player.nextFrame': '下一帧（→）',
  'player.loop': '循环播放选区',
  'player.rate': '播放速度',
  'player.snapshot': '截帧',
  'player.snapshotHint': '把当前帧保存为原尺寸 PNG（S）',
  'player.setIn': '设为起点',
  'player.setInHint': '把当前帧设为片段起点（I）',
  'player.setOut': '设为终点',
  'player.setOutHint': '把当前帧设为片段终点，包含该帧（O）',
  'player.resetRange': '重置为整段',
  'player.length': '时长',
  'player.frames': '{n} 帧',
  'player.frameNo': '第 {n} 帧 / 共 {total}',
  'player.dragIn': '拖动调整起点',
  'player.dragOut': '拖动调整终点',
  'crop.toggle': '裁切画面',
  'crop.hint': '在画面上拖动选框，只保留选中的区域',
  'crop.free': '自由比例',
  'crop.original': '原始比例',

  'opt.format': '输出格式',
  'opt.mode': '处理方式',
  'opt.modeEncode': '重新编码（精确）',
  'opt.modeCopy': '直接复制（极快）',
  'opt.resolution': '分辨率',
  'opt.width': '宽度 (px)',
  'opt.fps': '帧率',
  'opt.quality': '质量',
  'opt.speed': '速度',
  'opt.audio': '保留音频',
  'opt.loop': '循环播放',
  'opt.fast': '极速编码（约快 2 倍，文件更大）',
  'opt.original': '原始',
  'opt.customWidth': '自定义宽度',
  'opt.qHigh': '高',
  'opt.qMedium': '中（推荐）',
  'opt.qLow': '低（体积最小）',
  'opt.copyHint': '直接复制不重新编码：几乎瞬间完成且无画质损失，但起点会对齐到最近的关键帧，并且不能缩放、裁切或变速。',
  'opt.gifHint': 'GIF 最多 256 色、体积较大，建议 480p 以内、15 fps 左右。',
  'opt.apngHint': 'APNG 为无损格式，文件可能很大。',
  'group.video': '视频',
  'group.animation': '动图',
  'group.audio': '音频',
  'group.image': '图片',

  'clip.intro': '在上方播放器中设定起点和终点（可逐帧微调），可选裁切画面，然后选择格式导出。',
  'clip.export': '导出片段',
  'clip.noItem': '请先在左侧导入并选择一个文件',
  'clip.duration': '时长 {d}',
  'clip.copyNoCrop': '直接复制模式会忽略画面裁切',
  'clip.cropOn': '已启用画面裁切',

  'frames.intro': '从当前片段中抽取帧，点击或拖动选择需要的帧，再导出为图片，或合成新的动图 / 视频。双击缩略图可在播放器中查看该帧。',
  'frames.sampling': '抽取方式',
  'frames.all': '每一帧',
  'frames.everyN': '每隔 N 帧取一帧',
  'frames.perSecond': '每秒 N 张',
  'frames.total': '平均抽取 N 张',
  'frames.value.every': '间隔（帧）',
  'frames.value.fps': '每秒张数',
  'frames.value.count': '张数',
  'frames.estimate': '片段 {range}，约 {n} 张',
  'frames.notApplicable': '抽帧仅适用于视频和动图',
  'frames.extract': '抽取帧',
  'frames.tooMany': '将抽取 {n} 张，超过上限 {max}，请缩短片段或增大间隔。',
  'frames.confirmMany': '将抽取约 {n} 张缩略图，可能需要一些时间和内存，继续吗？',
  'frames.none': '没有抽取到帧',
  'frames.selected': '已选 {n} / {total}',
  'frames.selectAll': '全选',
  'frames.selectNone': '全不选',
  'frames.invert': '反选',
  'frames.tip': '点击选择 · 拖动连选 · Shift 范围选 · 双击预览',
  'frames.asImages': '导出为图片',
  'frames.exportImages': '导出所选帧',
  'frames.asAnimation': '合成动图 / 视频',
  'frames.playFps': '播放帧率',
  'frames.compose': '合成所选帧',
  'frames.pickFirst': '请先选择至少一帧',

  'convert.intro': '把整个文件转换为其他格式，可多选批量处理，例如 MOV → MP4、GIF → MP4、视频 → GIF、HEIC → JPG。',
  'convert.files': '选择文件',
  'convert.empty': '还没有导入文件',
  'convert.incompatible': '不能转换为该格式',
  'convert.applyEdits': '应用每个文件的片段区间和画面裁切',
  'convert.run': '开始转换',

  'outputs.title': '导出结果',
  'outputs.empty': '导出的文件会显示在这里。它们只保存在当前页面的内存中，刷新或关闭页面后会丢失，请及时下载。',
  'outputs.download': '下载',
  'outputs.preview': '预览',
  'outputs.remove': '删除',
  'outputs.downloadAll': '打包下载',
  'outputs.clear': '清空',
  'outputs.confirmClear': '确定清空所有导出结果吗？',

  'tray.queued': '等待中',
  'tray.done': '完成',
  'tray.cancel': '取消',
  'tray.dismiss': '关闭',
  'tray.more': '还有 {n} 个任务在排队',

  'task.import': '导入 {name}',
  'task.export': '导出 {name}',
  'task.convert': '转换 {name}',
  'task.extract': '抽帧 {name}',
  'task.exportFrames': '导出 {n} 帧',
  'task.compose': '合成 {name}',
  'task.snapshot': '截取第 {n} 帧',
  'task.zipAll': '打包 {n} 个文件',
  'task.cancelled': '已取消',

  'toast.exported': '已导出 {name}',
  'toast.snapshot': '当前帧已保存到导出结果',

  'err.noVideo': '该文件没有视频画面，无法导出为此格式',
  'err.noAudio': '该文件没有音轨',
  'err.unrecognized': '无法识别的文件格式',
  'err.crash': 'FFmpeg 内部出错（{detail}），引擎已自动重启。可以降低分辨率或换一种格式再试。',
  'err.noImageDecoder': '当前浏览器无法解码这种动图（需要支持 ImageDecoder 的新版 Chrome / Edge / Firefox）',

  'help.title': '帮助',
  'help.shortcuts': '快捷键',
  'help.k.play': '播放 / 暂停',
  'help.k.step': '上一帧 / 下一帧',
  'help.k.jump': '后退 / 前进 1 秒',
  'help.k.inout': '设为起点 / 终点',
  'help.k.edges': '跳到起点 / 终点',
  'help.k.snap': '截取当前帧',
  'help.formats': '支持的格式',
  'help.formatsIn':
    '输入：MP4、MOV、MKV、WebM、AVI、FLV、WMV、TS/MTS、3GP、MPEG、OGV 等视频；GIF、APNG、动态 WebP、AVIF 动图；HEIC/HEIF、JPG、PNG、WebP、BMP、TIFF 等图片；MP3、AAC、WAV、FLAC、OGG、Opus 等音频。',
  'help.formatsOut':
    '输出：MP4（H.264）、MOV、MKV、WebM（VP8）、AVI、OGV、GIF、动态 WebP、APNG、MP3、M4A、WAV、OGG、Opus、FLAC、PNG、JPG、WebP、BMP、TIFF。',
  'help.privacy': '隐私',
  'help.privacyText':
    'EasyCliper 是纯静态网页，所有解码和编码都由运行在你浏览器里的 FFmpeg（WebAssembly）完成，文件不会离开你的设备。首次加载后可离线使用。',
  'help.tips': '小贴士',
  'help.tip1': '只是去掉开头结尾，或只换封装（如 MOV → MP4）时，选择“直接复制”，几乎瞬间完成且无损。',
  'help.tip2': '浏览器无法直接播放的格式（AVI、WMV、FLV、ProRes 等）会先生成低清预览，导出时仍使用原文件。',
  'help.tip3': '编码在单线程 WebAssembly 中进行，长视频重新编码会比较慢；可以降低分辨率，或使用“直接复制”。',
  'help.tip4': '超大文件（> 2 GB）可能超出浏览器的内存限制。',
};

const en: Dict = {
  'app.tagline': 'Video & GIF clipping that runs entirely in your browser',
  'app.local': 'Local only · nothing is uploaded',
  'app.github': 'Source on GitHub',
  'app.unsupported': 'This browser lacks WebAssembly or module worker support. Please use a recent Chrome, Edge, Firefox or Safari.',
  'lang.switch': '中文',
  'help.button': 'Help & shortcuts',
  'engine.idle': 'Engine not loaded',
  'engine.loading': 'Loading engine {pct}%',
  'engine.ready': 'Engine ready',
  'engine.error': 'Engine failed to load — click to retry',
  'engine.hint': 'FFmpeg (WebAssembly) is ~30 MB, downloaded on first use and cached by the browser. Click to preload.',
  'tab.clip': 'Trim & export',
  'tab.frames': 'Frames',
  'tab.convert': 'Convert',
  'drop.overlay': 'Drop files to import',
  'common.close': 'Close',

  'library.title': 'Library',
  'library.import': 'Import',
  'library.dropHint': 'Drop or pick videos, GIFs, images, audio',
  'library.remove': 'Remove',
  'library.queued': 'Queued',
  'library.failed': 'Import failed',
  'library.processing': 'Processing',
  'kind.video': 'Video',
  'kind.animation': 'Animation',
  'kind.image': 'Image',
  'kind.audio': 'Audio',

  'stage.analyzing': 'Analyzing',
  'stage.heic': 'Decoding HEIC',
  'stage.decodeFrames': 'Decoding animation frames',
  'stage.probe': 'Reading media info',
  'stage.preview': 'Preparing preview',
  'stage.proxy': 'Browser cannot play this, building a preview',
  'stage.zip': 'Zipping',
  'note.heic': 'HEIC decoded',
  'note.browserDecoded': 'Decoded by browser',
  'note.proxy': 'Low-res preview; exports use the original',

  'player.empty': 'Import a video, GIF, HEIC… to start',
  'player.privacy': 'Everything happens on your device. Files are never uploaded.',
  'player.play': 'Play / pause (Space)',
  'player.prevFrame': 'Previous frame (←)',
  'player.nextFrame': 'Next frame (→)',
  'player.loop': 'Loop selection',
  'player.rate': 'Playback speed',
  'player.snapshot': 'Snapshot',
  'player.snapshotHint': 'Save the current frame as a full-size PNG (S)',
  'player.setIn': 'Set start',
  'player.setInHint': 'Use the current frame as the clip start (I)',
  'player.setOut': 'Set end',
  'player.setOutHint': 'Use the current frame as the clip end, inclusive (O)',
  'player.resetRange': 'Reset to full length',
  'player.length': 'Length',
  'player.frames': '{n} frames',
  'player.frameNo': 'Frame {n} / {total}',
  'player.dragIn': 'Drag to move the start',
  'player.dragOut': 'Drag to move the end',
  'crop.toggle': 'Crop',
  'crop.hint': 'Drag the box on the picture to keep only that area',
  'crop.free': 'Free',
  'crop.original': 'Original',

  'opt.format': 'Format',
  'opt.mode': 'Mode',
  'opt.modeEncode': 'Re-encode (exact)',
  'opt.modeCopy': 'Stream copy (instant)',
  'opt.resolution': 'Resolution',
  'opt.width': 'Width (px)',
  'opt.fps': 'Frame rate',
  'opt.quality': 'Quality',
  'opt.speed': 'Speed',
  'opt.audio': 'Keep audio',
  'opt.loop': 'Loop forever',
  'opt.fast': 'Fast encode (~2× faster, larger file)',
  'opt.original': 'Original',
  'opt.customWidth': 'Custom width',
  'opt.qHigh': 'High',
  'opt.qMedium': 'Medium',
  'opt.qLow': 'Low (smallest)',
  'opt.copyHint': 'Stream copy skips re-encoding: near-instant and lossless, but the start snaps to the nearest keyframe and scaling, cropping and speed changes are not possible.',
  'opt.gifHint': 'GIF is limited to 256 colors and gets large; ≤ 480p at ~15 fps is a good start.',
  'opt.apngHint': 'APNG is lossless and can be very large.',
  'group.video': 'Video',
  'group.animation': 'Animation',
  'group.audio': 'Audio',
  'group.image': 'Image',

  'clip.intro': 'Set the start and end in the player above (frame-accurate), optionally crop, then pick a format and export.',
  'clip.export': 'Export clip',
  'clip.noItem': 'Import and select a file on the left first',
  'clip.duration': 'length {d}',
  'clip.copyNoCrop': 'Stream copy ignores the crop',
  'clip.cropOn': 'Crop enabled',

  'frames.intro': 'Extract frames from the current selection, click or drag to pick the ones you want, then save them as images or build a new animation / video. Double-click a thumbnail to view it in the player.',
  'frames.sampling': 'Sampling',
  'frames.all': 'Every frame',
  'frames.everyN': 'Every Nth frame',
  'frames.perSecond': 'N per second',
  'frames.total': 'N evenly spaced',
  'frames.value.every': 'Interval (frames)',
  'frames.value.fps': 'Per second',
  'frames.value.count': 'Count',
  'frames.estimate': 'Selection {range}, ~{n} frames',
  'frames.notApplicable': 'Frame extraction works on videos and animations',
  'frames.extract': 'Extract frames',
  'frames.tooMany': '{n} frames is over the limit of {max}. Shorten the selection or increase the interval.',
  'frames.confirmMany': 'About {n} thumbnails will be extracted; this can take a while and use memory. Continue?',
  'frames.none': 'No frames were extracted',
  'frames.selected': '{n} / {total} selected',
  'frames.selectAll': 'All',
  'frames.selectNone': 'None',
  'frames.invert': 'Invert',
  'frames.tip': 'Click to pick · drag to paint · Shift for a range · double-click to preview',
  'frames.asImages': 'Save as images',
  'frames.exportImages': 'Export picked frames',
  'frames.asAnimation': 'Build animation / video',
  'frames.playFps': 'Playback fps',
  'frames.compose': 'Build from picked frames',
  'frames.pickFirst': 'Pick at least one frame first',

  'convert.intro': 'Convert whole files to another format, several at once: MOV → MP4, GIF → MP4, video → GIF, HEIC → JPG…',
  'convert.files': 'Files',
  'convert.empty': 'Nothing imported yet',
  'convert.incompatible': 'Cannot convert to this format',
  'convert.applyEdits': "Apply each file's selection range and crop",
  'convert.run': 'Convert',

  'outputs.title': 'Exports',
  'outputs.empty': 'Exported files show up here. They only live in this page’s memory and are lost on reload, so download them.',
  'outputs.download': 'Download',
  'outputs.preview': 'Preview',
  'outputs.remove': 'Delete',
  'outputs.downloadAll': 'Download all',
  'outputs.clear': 'Clear',
  'outputs.confirmClear': 'Remove all exported files?',

  'tray.queued': 'Waiting',
  'tray.done': 'Done',
  'tray.cancel': 'Cancel',
  'tray.dismiss': 'Dismiss',
  'tray.more': '{n} more queued',

  'task.import': 'Import {name}',
  'task.export': 'Export {name}',
  'task.convert': 'Convert {name}',
  'task.extract': 'Extract frames of {name}',
  'task.exportFrames': 'Export {n} frames',
  'task.compose': 'Build {name}',
  'task.snapshot': 'Snapshot of frame {n}',
  'task.zipAll': 'Zip {n} files',
  'task.cancelled': 'Cancelled',

  'toast.exported': 'Exported {name}',
  'toast.snapshot': 'Frame saved to Exports',

  'err.noVideo': 'This file has no video track, so it cannot be exported to that format',
  'err.noAudio': 'This file has no audio track',
  'err.unrecognized': 'Unrecognized file format',
  'err.crash': 'FFmpeg crashed ({detail}); the engine was restarted. Try a lower resolution or another format.',
  'err.noImageDecoder': 'This browser cannot decode this animation (needs a recent Chrome / Edge / Firefox with ImageDecoder)',

  'help.title': 'Help',
  'help.shortcuts': 'Keyboard shortcuts',
  'help.k.play': 'Play / pause',
  'help.k.step': 'Previous / next frame',
  'help.k.jump': 'Back / forward 1 s',
  'help.k.inout': 'Set start / end',
  'help.k.edges': 'Jump to start / end',
  'help.k.snap': 'Snapshot current frame',
  'help.formats': 'Formats',
  'help.formatsIn':
    'In: MP4, MOV, MKV, WebM, AVI, FLV, WMV, TS/MTS, 3GP, MPEG, OGV video; GIF, APNG, animated WebP, AVIF; HEIC/HEIF, JPG, PNG, WebP, BMP, TIFF images; MP3, AAC, WAV, FLAC, OGG, Opus audio.',
  'help.formatsOut':
    'Out: MP4 (H.264), MOV, MKV, WebM (VP8), AVI, OGV, GIF, animated WebP, APNG, MP3, M4A, WAV, OGG, Opus, FLAC, PNG, JPG, WebP, BMP, TIFF.',
  'help.privacy': 'Privacy',
  'help.privacyText':
    'EasyCliper is a static web page. All decoding and encoding is done by FFmpeg compiled to WebAssembly, running in your browser; files never leave your device. After the first visit it also works offline.',
  'help.tips': 'Tips',
  'help.tip1': 'To just cut the ends off or change the container (e.g. MOV → MP4), use “Stream copy”: near-instant and lossless.',
  'help.tip2': 'Formats the browser cannot play (AVI, WMV, FLV, ProRes…) get a low-res preview first; exports still use the original.',
  'help.tip3': 'Encoding runs in single-threaded WebAssembly, so re-encoding long videos is slow; lower the resolution or use stream copy.',
  'help.tip4': 'Very large files (> 2 GB) may exceed the browser’s memory limits.',
};

const dicts = { zh, en };
export type Lang = keyof typeof dicts;

const STORAGE_KEY = 'easycliper.lang';

// English by default; Chinese is opt-in via the header toggle and remembered.
function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    /* storage unavailable */
  }
  return 'en';
}

let lang: Lang = initialLang();
const listeners = new Set<() => void>();

export const onLangChange = {
  on(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function t(key: string, vars?: Record<string, string | number>): string {
  let s = dicts[lang][key] ?? en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
  return s;
}

export const has = (key: string): boolean => key in en;

export const getLang = (): Lang => lang;

export function applyI18n(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n!)));
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => (el.title = t(el.dataset.i18nTitle!)));
  root
    .querySelectorAll<HTMLElement>('[data-i18n-placeholder]')
    .forEach((el) => el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder!)));
}

export function setLang(next: Lang): void {
  lang = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* storage unavailable */
  }
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  applyI18n(document.body);
  for (const fn of [...listeners]) fn();
}
