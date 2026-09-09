// dsh-scenery client bundle — built artifact.
// Do not edit by hand: sources live in src/client/ and are concatenated by
// scripts/build.mjs (run `npm run build`). Served by DSH at
// /plugins/dsh-scenery/client.js (declared via dsh.client in package.json).
'use strict';
(() => {

//#region src/client/00-defs.js
// dsh-scenery client fragment 00 — defaults, clamps, i18n, shared bridge.
// All fragments of the client half are concatenated by scripts/build.mjs into
// one IIFE scope inside lib/client.js. Names are module-wide unique.

const SCENERY_API_BASE = '/dsh-scenery-bg';
const SCENERY_STORAGE_KEY = 'dsh-scenery:v1';

/** User-facing settings (mirror of the host sanitizer). */
const SCENERY_DEFAULTS = Object.freeze({
  version: 1,
  enabled: false,
  image: null, // { kind:'file', name, rev } | { kind:'url', url }
  fit: 'cover', // cover | contain | fill
  posX: 50,
  posY: 42,
  zoom: 1,
  opacity: 1, // overall background opacity (image + overlays together)
  gradientStrength: 0.9, // bottom black gradient peak alpha
  gradientHeight: 0.62, // how much of the stage height the gradient occupies from the bottom
  auraStrength: 0.82, // composer aura peak alpha
  auraScale: 1,
  auraOffsetX: 0,
  auraOffsetY: -16,
  blur: 0, // image-only gaussian blur, px
});

const clampNum = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const cloneSettings = (s) => ({
  ...SCENERY_DEFAULTS,
  ...(s || {}),
  image: s && s.image ? { ...s.image } : null,
});

/** Accept a dirty object and return a settings object clamped to valid ranges. */
function sanitizeClientSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const out = cloneSettings(SCENERY_DEFAULTS);
  out.version = 1;
  // NOTE: numeric fields must accept 0 as a real value — never `|| default`.
  const num = (v, fb) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
  };
  out.enabled = typeof s.enabled === 'boolean' ? s.enabled : out.enabled;
  if (s.image && typeof s.image === 'object') {
    if (s.image.kind === 'file' && typeof s.image.name === 'string' && /^wallpaper\.[a-z0-9]+$/i.test(s.image.name)) {
      const rev = num(s.image.rev, 1);
      out.image = { kind: 'file', name: s.image.name, rev: Math.max(1, Math.floor(rev)) };
    } else if (
      s.image.kind === 'url' &&
      typeof s.image.url === 'string' &&
      (/^https?:\/\//i.test(s.image.url) || /^data:image\/(png|jpeg|jpg|gif|webp|avif|bmp);base64,/i.test(s.image.url))
    ) {
      out.image = { kind: 'url', url: s.image.url };
    }
  }
  out.fit = ['cover', 'contain', 'fill'].includes(s.fit) ? s.fit : out.fit;
  out.posX = clampNum(num(s.posX, out.posX), 0, 100);
  out.posY = clampNum(num(s.posY, out.posY), 0, 100);
  out.zoom = clampNum(num(s.zoom, out.zoom), 0.25, 4);
  out.opacity = clampNum(num(s.opacity, out.opacity), 0, 1);
  out.gradientStrength = clampNum(num(s.gradientStrength, out.gradientStrength), 0, 1);
  out.gradientHeight = clampNum(num(s.gradientHeight, out.gradientHeight), 0.1, 1);
  out.auraStrength = clampNum(num(s.auraStrength, out.auraStrength), 0, 1);
  out.auraScale = clampNum(num(s.auraScale, out.auraScale), 0.25, 3);
  out.auraOffsetX = clampNum(num(s.auraOffsetX, out.auraOffsetX), -800, 800);
  out.auraOffsetY = clampNum(num(s.auraOffsetY, out.auraOffsetY), -800, 800);
  out.blur = Math.round(clampNum(num(s.blur, out.blur), 0, 120));
  return out;
}

const sceneryBridge = {
  current: cloneSettings(SCENERY_DEFAULTS),
  engine: null,
  api: null,
};

const logScenery = (msg) => {
  try {
    console.info('[dsh-scenery]', msg);
  } catch {
    /* noop */
  }
};

// ---- tiny i18n dictionary ------------------------------------------
const NS = 'scenery.config';

const SCENERY_ZH = {
  nav: '场景背景',
  intro: '挑选一张图片铺在会话工作区后面，并叠加大片柔和的底部黑色渐变与输入框周围的黑色光晕，让界面“坐”进画面里。纯外观插件，不改变任何现有布局与行为。',
  groupBackdrop: '背景图片',
  groupTreatment: '渐变处理（Capy 式合成）',
  groupAura: '输入框光晕',
  enable: '启用场景背景',
  enableHint: '默认关闭：安装后界面完全不变，打开此开关才开始合成。',
  image: '背景图片',
  imageNone: '尚未选择图片。上传本地图片，或粘贴图片 URL。',
  upload: '上传图片',
  uploading: '上传中…',
  urlPlaceholder: 'https://… 或 http://…',
  useUrl: '使用 URL',
  removeImage: '移除图片',
  fit: '铺放方式',
  fitCover: '铺满裁切 (cover)',
  fitContain: '完整显示 (contain)',
  fitFill: '拉伸填充 (fill)',
  posX: '水平位置 %',
  posY: '垂直位置 %',
  zoom: '缩放',
  opacity: '整体不透明度',
  gradStrength: '底部渐变强度',
  gradHeight: '底部渐变高度',
  auraStrength: '光晕强度',
  auraScale: '光晕大小',
  auraOffsetX: '光晕水平偏移 (px)',
  auraOffsetY: '光晕垂直偏移 (px)',
  blur: '图片模糊 (px)',
  blurHint: '仅模糊背景图片本身，界面文字保持清晰。',
  save: '保存',
  reset: '恢复默认',
  saved: '已保存，立即生效。',
  saveFailed: '保存失败',
  uploadFailed: '上传失败',
  uploadTooLarge: '图片过大（上限 25MB）',
  invalidUrl: 'URL 需以 http(s):// 开头',
  resetting: '确认恢复默认？会清掉当前图片与全部参数。',
};

const SCENERY_EN = {
  nav: 'Scenery background',
  intro: 'Put an image behind the conversation workspace and layer a huge soft bottom black gradient plus a radial “aura” around the composer on top of it, so the UI looks like it is sitting inside the scene. Appearance only - no existing layout or behaviour changes.',
  groupBackdrop: 'Backdrop image',
  groupTreatment: 'Gradient treatment (Capy-style compositing)',
  groupAura: 'Composer aura',
  enable: 'Enable scenery background',
  enableHint: 'Off by default: installing changes nothing until you flip this switch.',
  image: 'Background image',
  imageNone: 'No image yet. Upload a local picture or paste an image URL.',
  upload: 'Upload image',
  uploading: 'Uploading…',
  urlPlaceholder: 'https://… or http://…',
  useUrl: 'Use URL',
  removeImage: 'Remove image',
  fit: 'Fit',
  fitCover: 'Cover (crop to fill)',
  fitContain: 'Contain (whole image)',
  fitFill: 'Fill (stretch)',
  posX: 'Position X %',
  posY: 'Position Y %',
  zoom: 'Zoom',
  opacity: 'Overall opacity',
  gradStrength: 'Bottom gradient strength',
  gradHeight: 'Bottom gradient height',
  auraStrength: 'Aura strength',
  auraScale: 'Aura size',
  auraOffsetX: 'Aura offset X (px)',
  auraOffsetY: 'Aura offset Y (px)',
  blur: 'Image blur (px)',
  blurHint: 'Blurs only the background image itself; UI text stays crisp.',
  save: 'Save',
  reset: 'Reset to default',
  saved: 'Saved - applied immediately.',
  saveFailed: 'Save failed',
  uploadFailed: 'Upload failed',
  uploadTooLarge: 'Image too large (25MB cap)',
  invalidUrl: 'URL must start with http(s)://',
  resetting: 'Reset to default? This clears the current image and all parameters.',
};

//#endregion

//#region src/client/01-composite.js
// dsh-scenery client fragment 01 — pure compositing math.
//
// Produces the three Capy-style layers as CSS:
//   1. the wallpaper <img> (fit/position/zoom/blur/opacity)
//   2. a very large bottom black linear-gradient whose darkness grows slowly
//      at first and approaches black only in the last ~20-30% of the stage
//   3. an extremely soft radial/elliptical dark gradient centered on the
//      composer ("aura") that fades to nothing with no visible edge
//
// Everything is parameterized from settings, so the standalone preview page
// and the in-app engine share the exact same math (single source of truth).

const rgba = (r, g, b, a) => 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
const BLACK = (a) => rgba(0, 0, 0, a);

/** Alpha profile of the bottom gradient, 0..1 over its own zone (smooth, no banding). */
function bottomProfile(u, strength) {
  // Gentle entry, then a decisive ramp: near-black only in the final ~30% of
  // the gradient zone. Node multipliers tuned to read as one continuous falloff.
  const nodes = [
    [0, 0],
    [0.22, 0.05],
    [0.45, 0.17],
    [0.68, 0.42],
    [0.84, 0.72],
    [0.94, 0.92],
    [1, 1],
  ];
  let alpha = nodes[0][1];
  for (let i = 1; i < nodes.length; i++) {
    const [n0, a0] = nodes[i - 1];
    const [n1, a1] = nodes[i];
    if (u <= n1) {
      const t = (u - n0) / (n1 - n0 || 1);
      // smoothstep within the segment keeps corners invisible
      const s = t * t * (3 - 2 * t);
      alpha = a0 + (a1 - a0) * s;
      break;
    }
    alpha = a1;
  }
  return Math.min(1, alpha * strength);
}

/**
 * CSS for the bottom black gradient.
 * @returns {string} `linear-gradient(to bottom, …)` covering the stage.
 */
function composeBottomLayer(settings) {
  const s = settings;
  const Z = clampNum(s.gradientHeight, 0.1, 1); // fraction of stage height the gradient spans
  const from = 1 - Z;
  const stops = [];
  stops.push('rgba(0,0,0,0) ' + (from * 100).toFixed(2) + '%');
  const SEGMENTS = 9;
  for (let i = 1; i <= SEGMENTS; i++) {
    const u = i / SEGMENTS; // position inside the gradient zone
    const overall = from + u * Z;
    const a = bottomProfile(u, s.gradientStrength);
    stops.push(BLACK(a) + ' ' + (overall * 100).toFixed(2) + '%');
  }
  // Snap the very bottom to (near) black per spec: bottom ~20-30% should be
  // extremely dark. profile already reaches ~strength*0.92+ at the last stop;
  // force the final stop to full strength so the bottom edge is anchored.
  stops.push(BLACK(s.gradientStrength) + ' 100%');
  return 'linear-gradient(to bottom, ' + stops.join(', ') + ')';
}

/**
 * CSS for the composer "aura" radial gradient.
 * @param geo {w,h,cx,cy} stage size and aura center in stage-local px.
 * @returns {string} radial-gradient string or '' when auraStrength is 0.
 */
function composeAuraLayer(settings, geo) {
  const s = settings;
  if (!s.auraStrength || s.auraStrength <= 0.001) return '';
  const w = Math.max(1, geo.w || 1);
  const h = Math.max(1, geo.h || 1);
  const cx = Number.isFinite(geo.cx) ? geo.cx : w / 2;
  const cy = Number.isFinite(geo.cy) ? geo.cy : h * 0.84;
  const scale = clampNum(s.auraScale, 0.25, 3);
  // Radii in px: wide and tall enough to swallow the composer card area with
  // extremely soft falloff (shape reaches far beyond the "visible" darkness).
  const rX = Math.max(180, w * 0.62 * scale);
  const rY = Math.max(120, h * 0.3 * scale);
  const peak = s.auraStrength;
  const stops = [
    BLACK(peak) + ' 0%',
    BLACK(peak * 0.72) + ' 20%',
    BLACK(peak * 0.4) + ' 42%',
    BLACK(peak * 0.16) + ' 63%',
    BLACK(peak * 0.05) + ' 80%',
    'rgba(0,0,0,0) 100%',
  ];
  return (
    'radial-gradient(ellipse ' +
    rX.toFixed(0) +
    'px ' +
    rY.toFixed(0) +
    'px at ' +
    cx.toFixed(1) +
    'px ' +
    cy.toFixed(1) +
    'px, ' +
    stops.join(', ') +
    ')'
  );
}

/** Blur edge padding so a filtered image never shows a translucent rim. */
function blurPadPx(settings) {
  const b = clampNum(settings.blur, 0, 120);
  return b > 0 ? Math.ceil(b * 1.5) + 2 : 0;
}

/**
 * Resolve the wallpaper source URL.
 * @param {any} settings
 * @param {string} apiBase
 * @returns {string|null}
 */
function resolveImageSrc(settings, apiBase) {
  const img = settings.image;
  if (!img) return null;
  if (img.kind === 'url') return img.url;
  if (img.kind === 'file') {
    const rev = img.rev || 1;
    return apiBase + '/wallpaper/' + encodeURIComponent(img.name) + '?rev=' + rev;
  }
  return null;
}

//#endregion

//#region src/client/02-runtime.js
// dsh-scenery client fragment 02 — the runtime engine.
//
// The engine owns the DOM work:
//   - finds the conversation workspace (the center column's ConversationRoot,
//     addressable through the official `[data-slot="conversation"]` anchor) and
//     inserts a single absolutely-positioned, click-through stage BEHIND it
//     (z-index:-1 inside the host's own stacking context, so the image paints
//     above the host's flat background but under every message / panel);
//   - tracks layout (window resize + ResizeObserver) and the composer seat
//     (the sticky bottom bar) so the aura can follow the real input area;
//   - falls back to painting the whole AppFrame element's background layers
//     when the conversation seat is not (yet) mounted.
//
// Nothing is patched onto existing components: one neutral child element is
// added (or, in fallback, one element's background-image is extended) and
// every pointer event stays click-through. Pointer-events:none + aria-hidden
// keep the stage invisible to interaction and accessibility trees.

/** Find the conversation host. Returns {mode:'column'|'frame', el} or null. */
function sceneryFindHost() {
  const anchor = document.querySelector('[data-slot="conversation"]');
  if (anchor) {
    const node = anchor.firstElementChild;
    if (node && node.nodeType === 1) {
      const r = node.getBoundingClientRect();
      if (r.width > 60 && r.height > 60) {
        return { mode: 'column', el: node };
      }
    }
  }
  const overlay = document.querySelector('[data-shell-overlay]');
  if (overlay && overlay.parentElement) {
    const frame = overlay.parentElement;
    if (frame && frame.getClientRects().length) {
      return { mode: 'frame', el: frame };
    }
  }
  return null;
}

/** Find the sticky composer bar inside the host (cache-friendly). */
function sceneryLocateSeat(host, cached) {
  if (!host) return null;
  if (cached) {
    try {
      if (cached.isConnected) {
        const cs = getComputedStyle(cached);
        if (cs.position === 'sticky') return cached;
      }
    } catch {
      /* fall through to rescan */
    }
    return null;
  }
  // Deepest sticky-bottom element inside the conversation host is the
  // composer seat; message rows are not sticky so this is unambiguous.
  let found = null;
  try {
    const all = host.querySelectorAll('*');
    const limit = Math.min(all.length, 4000);
    for (let i = 0; i < limit; i++) {
      const el = all[i];
      if (!(el instanceof HTMLElement)) continue;
      const cs = getComputedStyle(el);
      if (cs.position === 'sticky' && cs.bottom === '0px') found = el; // later = deeper
    }
  } catch {
    /* querySelectorAll on hostile trees: give up quietly */
  }
  return found;
}

function sceneryMakeStage(host) {
  const stage = document.createElement('div');
  stage.setAttribute('data-dsh-scenery', 'stage');
  stage.setAttribute('aria-hidden', 'true');
  stage.style.position = 'absolute';
  stage.style.inset = '0';
  stage.style.zIndex = '-1';
  stage.style.overflow = 'hidden';
  stage.style.pointerEvents = 'none';

  const img = document.createElement('img');
  img.setAttribute('data-dsh-scenery', 'image');
  img.setAttribute('alt', '');
  img.draggable = false;
  img.style.position = 'absolute';
  img.style.objectFit = 'cover';

  const scrim = document.createElement('div');
  scrim.setAttribute('data-dsh-scenery', 'scrim');
  scrim.style.position = 'absolute';
  scrim.style.inset = '0';
  scrim.style.pointerEvents = 'none';

  stage.appendChild(img);
  stage.appendChild(scrim);
  host.insertBefore(stage, host.firstChild);
  return { stage, img, scrim };
}

function createSceneryEngine(deps) {
  const apiBase = deps.apiBase || SCENERY_API_BASE;
  const state = {
    settings: null,
    hostInfo: null,
    stageEls: null,
    observer: null,
    windowBound: null,
    raf: 0,
    seat: null,
    seatScanAt: 0,
    teardownRestore: null, // function restoring whatever we touched
    retryTimer: 0,
    frameSaved: null,
    hostSaved: null,
    warnedFrameBlur: false,
  };

  function schedulePaint() {
    if (state.raf) return;
    state.raf = requestAnimationFrame(() => {
      state.raf = 0;
      paint();
    });
  }

  /** Compute geometry for the current mode and paint the three layers. */
  function paint() {
    if (!state.settings || !state.settings.enabled) return;
    const hostInfo = ensureHost();
    if (!hostInfo) {
      state.retryTimer = setTimeout(paint, 900);
      return;
    }
    const s = state.settings;

    if (hostInfo.mode === 'column') {
      paintColumn(s, hostInfo);
    } else {
      paintFrame(s, hostInfo);
    }
  }

  /* ---- column mode: dedicated stage child under the chat ---- */
  function paintColumn(s, hostInfo) {
    const host = hostInfo.el;
    if (!state.stageEls || state.stageEls.stage.parentElement !== host) {
      if (state.stageEls && state.stageEls.stage.parentElement) {
        state.stageEls.stage.remove(); // stale stage from a previous host
      }
      state.stageEls = sceneryMakeStage(host);
    }
    const { stage, img, scrim } = state.stageEls;

    const stageRect = stage.getBoundingClientRect();
    if (stageRect.width < 20 || stageRect.height < 20) return;
    const w = stageRect.width;
    const h = stageRect.height;

    // composer-aware aura center (stage-local px)
    let cx = w / 2;
    let cy = h * 0.86;
    const seat = sceneryLocateSeat(host, state.seat);
    if (seat && seat.isConnected) {
      const r = seat.getBoundingClientRect();
      cx = r.left + r.width / 2 - stageRect.left;
      cy = r.top + r.height * 0.5 - stageRect.top;
    }
    state.seat = seat || null;
    cx += s.auraOffsetX || 0;
    cy += s.auraOffsetY || 0;

    // image element
    const src = resolveImageSrc(s, apiBase);
    const pad = blurPadPx(s);
    const hadSrc = img.getAttribute('data-dsh-scenery-src');
    if (src && src !== hadSrc) {
      img.setAttribute('data-dsh-scenery-src', src);
      img.src = src;
    }
    img.style.display = src ? 'block' : 'none';
    img.style.objectFit = s.fit;
    img.style.objectPosition = (s.posX || 50) + '% ' + (s.posY || 42) + '%';
    img.style.transform = 'scale(' + (s.zoom || 1) + ')';
    img.style.transformOrigin = 'center';
    img.style.filter = s.blur > 0 ? 'blur(' + s.blur + 'px)' : 'none';
    if (pad > 0) {
      img.style.left = '-' + pad + 'px';
      img.style.top = '-' + pad + 'px';
      img.style.width = 'calc(100% + ' + 2 * pad + 'px)';
      img.style.height = 'calc(100% + ' + 2 * pad + 'px)';
    } else {
      img.style.left = '0';
      img.style.top = '0';
      img.style.width = '100%';
      img.style.height = '100%';
    }

    // overlays: aura + bottom gradient
    const aura = composeAuraLayer(s, { w, h, cx, cy });
    const bottom = composeBottomLayer(s);
    const layers = [aura, bottom].filter(Boolean);
    scrim.style.background = layers.length ? layers.join(', ') : 'none';

    stage.style.opacity = String(clampNum(s.opacity, 0, 1));
  }

  /* ---- frame fallback: extend the AppFrame background layers ---- */
  function paintFrame(s, hostInfo) {
    const frame = hostInfo.el;
    const r = frame.getBoundingClientRect();
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);
    const src = resolveImageSrc(s, apiBase);

    let cx = w / 2;
    let cy = h * 0.86;
    const seat = sceneryLocateSeat(frame, state.seat);
    if (seat && seat.isConnected) {
      const sr = seat.getBoundingClientRect();
      cx = sr.left + sr.width / 2 - r.left;
      cy = sr.top + sr.height * 0.5 - r.top;
    }
    state.seat = seat || null;
    cx += s.auraOffsetX || 0;
    cy += s.auraOffsetY || 0;

    if (s.blur > 0 && !state.warnedFrameBlur) {
      state.warnedFrameBlur = true;
      logScenery('image blur is only available when the conversation workspace is mounted; ignoring blur in frame fallback');
    }

    if (!state.frameSaved) {
      state.frameSaved = {
        image: frame.style.backgroundImage,
        size: frame.style.backgroundSize,
        position: frame.style.backgroundPosition,
        repeat: frame.style.backgroundRepeat,
      };
    }
    const aura = composeAuraLayer(s, { w, h, cx, cy });
    const bottom = composeBottomLayer(s);
    const images = [];
    const sizes = [];
    const positions = [];
    const repeats = [];
    if (aura) {
      images.push(aura);
      sizes.push('auto');
      positions.push('0 0');
      repeats.push('no-repeat');
    }
    if (bottom) {
      images.push(bottom);
      sizes.push('auto');
      positions.push('0 0');
      repeats.push('no-repeat');
    }
    if (src) {
      images.push('url("' + src.replace(/"/g, '%22') + '")');
      sizes.push('cover');
      positions.push((s.posX || 50) + '% ' + (s.posY || 42) + '%');
      repeats.push('no-repeat');
    }
    if (!images.length) {
      frame.style.backgroundImage = state.frameSaved.image;
      frame.style.backgroundSize = state.frameSaved.size;
      frame.style.backgroundPosition = state.frameSaved.position;
      frame.style.backgroundRepeat = state.frameSaved.repeat;
      return;
    }
    frame.style.backgroundImage = images.join(', ');
    frame.style.backgroundSize = sizes.join(', ');
    frame.style.backgroundPosition = positions.join(', ');
    frame.style.backgroundRepeat = repeats.join(', ');
    // The AppFrame keeps its own opaque theme colour UNDER these layers, so
    // letterboxed edges / transparent image regions still look native.
    void s.opacity; // frame mode keeps the theme colour: overall opacity handled by gradients
  }

  /** (Re)attach column or frame host; returns hostInfo or null. */
  function ensureHost() {
    if (state.hostInfo && state.hostInfo.el && state.hostInfo.el.isConnected) {
      // conversation host may mount later; keep trying to upgrade frame -> column
      if (state.hostInfo.mode === 'frame') {
        const better = sceneryFindHost();
        if (better && better.mode === 'column') {
          restoreHost();
          state.hostInfo = better;
          prepareHost(state.hostInfo);
        }
      }
      return state.hostInfo;
    }
    const info = sceneryFindHost();
    if (!info) return null;
    state.hostInfo = info;
    prepareHost(info);
    return info;
  }

  function prepareHost(info) {
    if (info.mode === 'column') {
      const host = info.el;
      const cs = getComputedStyle(host);
      state.hostSaved = {
        position: host.style.position,
        isolation: host.style.isolation,
      };
      if (cs.position === 'static') host.style.position = 'relative';
      if (cs.isolation === 'auto') host.style.isolation = 'isolate';
      // Stage will be inserted lazily on first paint.
    }
  }

  function restoreHost() {
    try {
      if (state.stageEls) {
        state.stageEls.stage.remove();
        state.stageEls = null;
      }
      if (state.hostSaved) {
        const host = state.hostInfo && state.hostInfo.el;
        if (host && host.isConnected) {
          host.style.position = state.hostSaved.position;
          host.style.isolation = state.hostSaved.isolation;
        }
        state.hostSaved = null;
      }
      if (state.frameSaved) {
        const host = state.hostInfo && state.hostInfo.el;
        if (host && host.isConnected) {
          host.style.backgroundImage = state.frameSaved.image;
          host.style.backgroundSize = state.frameSaved.size;
          host.style.backgroundPosition = state.frameSaved.position;
          host.style.backgroundRepeat = state.frameSaved.repeat;
        }
        state.frameSaved = null;
      }
    } catch {
      /* noop */
    }
  }

  function start() {
    if (state.observer) return;
    // visibility of the host geometry
    const ro = new ResizeObserver(() => schedulePaint());
    state.observer = ro;
    const onWindow = () => schedulePaint();
    window.addEventListener('resize', onWindow);
    state.windowBound = onWindow;
    try {
      ro.observe(document.body);
    } catch {
      /* noop */
    }
    paint();
    // retry while the app shell mounts seats lazily
    state.retryTimer = setTimeout(paint, 800);
  }

  function apply(settings) {
    state.settings = sanitizeClientSettings(settings);
    if (!state.settings.enabled) {
      restoreHost();
      return;
    }
    paint();
  }

  function stop() {
    if (state.raf) {
      cancelAnimationFrame(state.raf);
      state.raf = 0;
    }
    if (state.retryTimer) {
      clearTimeout(state.retryTimer);
      state.retryTimer = 0;
    }
    if (state.observer) {
      try {
        state.observer.disconnect();
      } catch {
        /* noop */
      }
      state.observer = null;
    }
    if (state.windowBound) {
      window.removeEventListener('resize', state.windowBound);
      state.windowBound = null;
    }
    restoreHost();
    state.hostInfo = null;
    state.settings = null;
  }

  return { start, apply, stop };
}

//#endregion

//#region src/client/03-settings-ui.js
// dsh-scenery client fragment 03 — the settings page section.
//
// Registered into the official `settings.section` slot (id `scenery-config`).
// Follows the design language of the Settings shell (max-width 720px, dsw
// alias tokens, save/reset buttons) and applies every change live through
// the engine (instant preview), persisting only on Save.

/** Plain-XML-ish helpers bound to react jsx at factory time. */
function makeScenerySettingsSection(rt) {
  const { h, useState, useEffect, useRef, t } = rt;

  const inputStyle = {
    boxSizing: 'border-box',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: '8px',
    background: 'var(--dsw-alias-bg-layer-1)',
    color: 'var(--dsw-alias-label-primary)',
    padding: '5px 10px',
    fontSize: '13px',
    minHeight: '28px',
    outline: 'none',
  };
  const sliderStyle = { flex: '1', accentColor: 'var(--dsw-alias-state-business-primary)' };
  const labelStyle = { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', minWidth: '150px' };

  /** One labeled range slider with a live numeric readout. */
  function rangeRow(key, value, onChange, min, max, step, fmt) {
    return h('div', {
      style: { display: 'flex', alignItems: 'center', gap: '10px' },
      children: [
        h('span', { style: labelStyle, children: t(key) }),
        h('input', {
          type: 'range',
          min: String(min),
          max: String(max),
          step: String(step),
          value: String(value),
          onChange: (e) => onChange(Number(e.target.value)),
          style: sliderStyle,
        }),
        h('span', {
          style: { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)', minWidth: '46px', textAlign: 'right' },
          children: String(fmt ? fmt(value) : Math.round(value * 100) / 100),
        }),
      ],
    });
  }

  /** One labeled select. */
  function selectRow(key, value, options, onChange) {
    return h('div', {
      style: { display: 'flex', alignItems: 'center', gap: '10px' },
      children: [
        h('span', { style: { ...labelStyle, minWidth: '150px' }, children: t(key) }),
        h('select', {
          value,
          onChange: (e) => onChange(e.target.value),
          style: { ...inputStyle, width: '220px' },
          children: options.map((o) => h('option', { key: o.value, value: o.value, children: o.label })),
        }),
      ],
    });
  }

  /** Rounded group card used for the three control groups. */
  function group(title, children) {
    return h('div', {
      style: {
        marginTop: '10px',
        padding: '12px 14px',
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      },
      children: [
        h('div', {
          style: { fontSize: '13px', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' },
          children: title,
        }),
        ...children,
      ],
    });
  }

  function hint(text) {
    return h('span', {
      style: { fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)', lineHeight: '16px' },
      children: text,
    });
  }

  return function SceneryConfigSection() {
    const [draft, setDraft] = useState(() => sanitizeClientSettings(sceneryBridge.current));
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState({ kind: '', text: '' });
    const [confirmReset, setConfirmReset] = useState(false);
    const [imgUrl, setImgUrl] = useState('');
    const fileInputRef = useRef(null);

    useEffect(() => {
      setDraft(sanitizeClientSettings(sceneryBridge.current));
    }, []);

    /** Update one field, preview live through the engine, keep draft. */
    const update = (patch) => {
      const next = sanitizeClientSettings({ ...draft, ...patch });
      setDraft(next);
      if (sceneryBridge.engine) {
        try {
          sceneryBridge.engine.apply(next);
        } catch (err) {
          logScenery('live preview failed: ' + (err && err.message));
        }
      }
    };

    const persist = async (settings) => {
      setBusy(true);
      setMsg({ kind: '', text: '' });
      try {
        const res = await fetch(SCENERY_API_BASE + '/config', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(settings),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        sceneryBridge.current = sanitizeClientSettings(settings);
        try {
          localStorage.setItem(SCENERY_STORAGE_KEY, JSON.stringify(sceneryBridge.current));
        } catch {
          /* private mode */
        }
        if (sceneryBridge.engine) sceneryBridge.engine.apply(sceneryBridge.current);
        setMsg({ kind: 'ok', text: t('saved') });
      } catch {
        setMsg({ kind: 'err', text: t('saveFailed') });
      } finally {
        setBusy(false);
      }
    };

    const save = () => void persist(draft);

    const reset = async () => {
      if (!confirmReset) {
        setConfirmReset(true);
        return;
      }
      setConfirmReset(false);
      const next = sanitizeClientSettings(SCENERY_DEFAULTS);
      setDraft(next);
      setImgUrl('');
      await persist(next);
    };

    const uploadImage = async (file) => {
      if (!file) return;
      if (file.size > 25 * 1024 * 1024) {
        setMsg({ kind: 'err', text: t('uploadTooLarge') });
        return;
      }
      setBusy(true);
      setMsg({ kind: '', text: '' });
      try {
        const map = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/bmp': '.bmp', 'image/avif': '.avif' };
        const wanted = map[file.type];
        let ext = wanted || '';
        if (!ext) {
          const m = /\.([a-z0-9]+)$/i.exec(file.name || '');
          if (m) ext = '.' + m[1].toLowerCase();
        }
        const res = await fetch(SCENERY_API_BASE + '/wallpaper?ext=' + encodeURIComponent(ext), {
          method: 'PUT',
          headers: { 'content-type': file.type || 'application/octet-stream' },
          body: file,
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.name) throw new Error('HTTP ' + res.status);
        update({ image: { kind: 'file', name: j.name, rev: j.rev || 1 } });
        setMsg({ kind: 'ok', text: t('saved') });
      } catch {
        setMsg({ kind: 'err', text: t('uploadFailed') });
      } finally {
        setBusy(false);
      }
    };

    const useUrl = () => {
      const u = imgUrl.trim();
      if (!/^https?:\/\//i.test(u)) {
        setMsg({ kind: 'err', text: t('invalidUrl') });
        return;
      }
      setMsg({ kind: '', text: '' });
      update({ image: { kind: 'url', url: u } });
    };

    const btnStyle = {
      border: '1px solid var(--dsw-alias-border-l2)',
      background: 'transparent',
      color: 'var(--dsw-alias-label-primary)',
      borderRadius: '8px',
      padding: '4px 14px',
      fontSize: '12px',
      cursor: 'pointer',
    };

    const img = draft.image;
    const hasImage = img !== null;

    return h('section', {
      style: { maxWidth: '720px', color: 'var(--dsw-alias-label-primary)', display: 'flex', flexDirection: 'column', gap: '6px' },
      children: [
        h('h2', { style: { margin: 0, fontSize: '16px', fontWeight: 500, lineHeight: '24px' }, children: t('nav') }),
        h('p', { style: { margin: 0, fontSize: '13px', color: 'var(--dsw-alias-label-tertiary)', lineHeight: '20px' }, children: t('intro') }),

        // master switch
        h('label', {
          style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px', fontSize: '13px', cursor: 'pointer' },
          children: [
            h('input', {
              type: 'checkbox',
              checked: !!draft.enabled,
              disabled: busy,
              onChange: (e) => update({ enabled: e.target.checked }),
              style: { width: '16px', height: '16px', accentColor: 'var(--dsw-alias-state-business-primary)' },
            }),
            h('span', { children: t('enable') }),
            hint(t('enableHint')),
          ],
        }),

        // backdrop group
        group(t('groupBackdrop'), [
          hasImage
            ? h('div', {
                style: {
                  display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                  padding: '6px 10px', border: '1px dashed var(--dsw-alias-border-l2)', borderRadius: '8px', fontSize: '12px',
                },
                children: [
                  h('span', { style: { color: 'var(--dsw-alias-label-secondary)', wordBreak: 'break-all' }, children: img.kind === 'file' ? img.name : img.url }),
                  h('button', {
                    type: 'button',
                    disabled: busy,
                    onClick: () => { update({ image: null }); setImgUrl(''); },
                    style: { ...btnStyle, borderColor: 'var(--dsw-alias-state-error-secondary)', color: 'var(--dsw-alias-state-error-primary)' },
                    children: t('removeImage'),
                  }),
                ],
              })
            : h('p', { style: { margin: 0, fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' }, children: t('imageNone') }),

          h('div', {
            style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
            children: [
              h('input', {
                ref: fileInputRef,
                type: 'file',
                accept: 'image/*',
                style: { display: 'none' },
                onChange: (e) => {
                  const f = e.target.files && e.target.files[0];
                  e.target.value = '';
                  void uploadImage(f);
                },
              }),
              h('button', {
                type: 'button',
                disabled: busy,
                onClick: () => { const el = fileInputRef.current; if (el) el.click(); },
                style: { ...btnStyle, borderColor: 'var(--dsw-alias-button-info-fill)', background: 'var(--dsw-alias-button-info-fill)', color: '#fff' },
                children: busy ? t('uploading') : t('upload'),
              }),
              h('input', {
                type: 'text',
                placeholder: t('urlPlaceholder'),
                value: imgUrl,
                disabled: busy,
                onChange: (e) => setImgUrl(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Enter') useUrl(); },
                style: { ...inputStyle, width: '300px', maxWidth: '60%' },
              }),
              h('button', { type: 'button', disabled: busy || !imgUrl.trim(), onClick: useUrl, style: btnStyle, children: t('useUrl') }),
            ],
          }),
          selectRow('fit', draft.fit, [
            { value: 'cover', label: t('fitCover') },
            { value: 'contain', label: t('fitContain') },
            { value: 'fill', label: t('fitFill') },
          ], (v) => update({ fit: v })),
          rangeRow('posX', draft.posX, (v) => update({ posX: v }), 0, 100, 1, (v) => v + '%'),
          rangeRow('posY', draft.posY, (v) => update({ posY: v }), 0, 100, 1, (v) => v + '%'),
          rangeRow('zoom', draft.zoom, (v) => update({ zoom: v }), 0.5, 3, 0.05, (v) => v.toFixed(2) + 'x'),
          rangeRow('opacity', draft.opacity, (v) => update({ opacity: v }), 0, 1, 0.01, (v) => Math.round(v * 100) + '%'),
          rangeRow('blur', draft.blur, (v) => update({ blur: v }), 0, 120, 1, (v) => v + 'px'),
          hint(t('blurHint')),
        ]),

        // gradient treatment
        group(t('groupTreatment'), [
          rangeRow('gradStrength', draft.gradientStrength, (v) => update({ gradientStrength: v }), 0, 1, 0.01, (v) => Math.round(v * 100) + '%'),
          rangeRow('gradHeight', draft.gradientHeight, (v) => update({ gradientHeight: v }), 0.1, 1, 0.01, (v) => Math.round(v * 100) + '%'),
        ]),

        // composer aura
        group(t('groupAura'), [
          rangeRow('auraStrength', draft.auraStrength, (v) => update({ auraStrength: v }), 0, 1, 0.01, (v) => Math.round(v * 100) + '%'),
          rangeRow('auraScale', draft.auraScale, (v) => update({ auraScale: v }), 0.25, 2.5, 0.05, (v) => v.toFixed(2) + 'x'),
          rangeRow('auraOffsetX', draft.auraOffsetX, (v) => update({ auraOffsetX: v }), -400, 400, 4, (v) => v + 'px'),
          rangeRow('auraOffsetY', draft.auraOffsetY, (v) => update({ auraOffsetY: v }), -400, 400, 4, (v) => v + 'px'),
        ]),

        // actions
        h('div', {
          style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px' },
          children: [
            h('button', {
              type: 'button',
              disabled: busy,
              onClick: save,
              style: { ...btnStyle, borderColor: 'var(--dsw-alias-button-info-fill)', background: 'var(--dsw-alias-button-info-fill)', color: '#fff', opacity: busy ? 0.6 : 1 },
              children: t('save'),
            }),
            h('button', {
              type: 'button',
              disabled: busy,
              onClick: () => void reset(),
              style: {
                ...btnStyle,
                borderColor: confirmReset ? 'var(--dsw-alias-state-error-secondary)' : 'var(--dsw-alias-border-l2)',
                color: confirmReset ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-primary)',
              },
              children: confirmReset ? t('resetting') : t('reset'),
            }),
            msg.text
              ? h('span', {
                  style: {
                    fontSize: '12px',
                    color: msg.kind === 'err' ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-ok-primary)',
                    marginLeft: '4px',
                  },
                  children: msg.text,
                })
              : null,
          ],
        }),
      ],
    });
  };
}

//#endregion

//#region src/client/04-entry.js
// dsh-scenery client fragment 04 — assembly + entry.
//
// The built lib/client.js is a plain side-effect script:
//   - when loaded inside DSH (window.__ModuleLoader__ exists) it registers the
//     plugin bundle `dsh-scenery`;
//   - anywhere else (the standalone preview page) it only exposes
//     window.SceneryCore — the shared defaults / compositing math — so the
//     preview and the plugin can never drift apart.

function sceneryRegisterClient(require) {
  const module = { exports: {} };

  const react = require('react');
  const { useState, useEffect, useRef } = react;
  const { jsx: h } = require('react/jsx-runtime');

  const name = 'scenery';
  const inject = ['slots', 'locale'];

  function apply(ctx) {
    ctx.effect(
      () => ctx.locale.register(NS, { zh: SCENERY_ZH, en: SCENERY_EN }),
      'dsh-scenery: dictionaries',
    );
    const t = ctx.locale.bind(NS);

    // engine + bridge wiring
    const engine = createSceneryEngine({ apiBase: SCENERY_API_BASE });
    sceneryBridge.engine = engine;

    ctx.effect(() => {
      engine.start();
      // 1) instant start from the last-known settings (no flash of default UI)
      try {
        const raw = localStorage.getItem(SCENERY_STORAGE_KEY);
        if (raw) {
          const cached = sanitizeClientSettings(JSON.parse(raw));
          sceneryBridge.current = cached;
          engine.apply(cached);
        }
      } catch {
        /* ignore corrupted cache */
      }
      // 2) reconcile with the host-persisted config
      fetch(SCENERY_API_BASE + '/config')
        .then((r) => (r.ok ? r.json() : {}))
        .then((cfg) => {
          const s = sanitizeClientSettings(cfg);
          sceneryBridge.current = s;
          engine.apply(s);
          try {
            localStorage.setItem(SCENERY_STORAGE_KEY, JSON.stringify(s));
          } catch {
            /* private mode */
          }
        })
        .catch(() => {
          /* keep cached settings */
        });
      return () => engine.stop();
    }, 'dsh-scenery: background engine');

    // settings page section
    const Section = makeScenerySettingsSection({ h, useState, useEffect, useRef, t });
    ctx.slots.inject('settings.section', function* () {
      yield ctx.slots.register(
        { name: 'settings.section', id: 'scenery-config', order: 40, label: () => t('nav'), inject: () => ({ t }) },
        Section,
      );
    });
  }

  module.exports = { apply, inject, name };
  return module.exports;
}

// ---- standalone core (preview page + debugging) ----------------------
const SceneryCore = {
  DEFAULTS: SCENERY_DEFAULTS,
  defaults: () => sanitizeClientSettings(SCENERY_DEFAULTS),
  sanitize: sanitizeClientSettings,
  composeBottomLayer,
  composeAuraLayer,
  resolveImageSrc,
  blurPadPx,
  SCENERY_API_BASE,
};

// ---- DSH module loader entry (browser only) --------------------------
if (typeof window !== 'undefined' && window.__ModuleLoader__) {
  window.__ModuleLoader__.load({
    id: 'dsh-scenery',
    factory: sceneryRegisterClient,
  });
} else if (typeof window !== 'undefined') {
  window.SceneryCore = SceneryCore;
}

//#endregion

})();
