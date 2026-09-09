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
