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
