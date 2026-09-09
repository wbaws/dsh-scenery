/**
 * dsh-scenery - host half (Cordis plugin)
 *
 * Responsibilities
 * ----------------
 * Persist the scenery settings and the uploaded wallpaper image for the
 * browser half of the plugin, behind a small fenced HTTP prefix:
 *
 *   GET    /dsh-scenery-bg/config            -> user settings ({} when unset)
 *   PUT    /dsh-scenery-bg/config            -> save (sanitized) settings
 *   DELETE /dsh-scenery-bg/config            -> forget settings (image file kept)
 *   PUT    /dsh-scenery-bg/wallpaper         -> raw image body -> data dir
 *   GET    /dsh-scenery-bg/wallpaper/<name>  -> stream stored image
 *
 * Data lives in <dsh-home>/dsh-scenery/ (dsh-home defaults to ~/.dsh or
 * $DSH_HOME). The package deliberately depends on zero platform peer
 * modules on the host side: home resolution and file I/O use plain Node
 * builtins, so the plugin mounts on stock DSH profiles without extra
 * peer installs.
 *
 * All persistence is defensive: field whitelisting + numeric clamps, file
 * names constrained to /^wallpaper\.[a-z0-9]+$/i and every resolved path
 * verified to stay inside the data directory.
 */
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'scenery';
export const inject = ['webServer'];

/** Path of the shipped host file; its parent is the package root. */
const PACKAGE_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Fenced route prefix (arbitrary but stable; matches lib/client.js). */
const ROUTE_PREFIX = '/dsh-scenery-bg';

/** Where the plugin keeps its data inside the DSH home directory. */
const DATA_DIR_NAME = 'dsh-scenery';

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
};

const ALLOWED_EXTS = new Set(Object.keys(MIME_BY_EXT));

/* ------------------------------------------------------------------ */
/* Small http helpers                                                  */
/* ------------------------------------------------------------------ */

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req, limit = 32 * 1024 * 1024) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > limit) {
        rejectBody(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks)));
    req.on('error', rejectBody);
  });
}

async function sendFile(res, file, contentType) {
  const { size } = await stat(file);
  res.writeHead(200, {
    'content-type': contentType,
    'content-length': size,
    'cache-control': 'public, max-age=31536000, immutable',
  });
  const stream = createReadStream(file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

/* ------------------------------------------------------------------ */
/* Sanitizers                                                          */
/* ------------------------------------------------------------------ */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Coerce one setting field with a range; returns undefined on wrong type. */
function pickNum(raw, key, lo, hi, fallback) {
  const n = Number(raw[key]);
  return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
}

function pickBool(raw, key, fallback) {
  const v = raw[key];
  return typeof v === 'boolean' ? v : fallback;
}

function pickStr(raw, key, allowed, fallback) {
  const v = raw[key];
  return typeof v === 'string' && allowed.includes(v) ? v : fallback;
}

function sanitizeImage(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object') return null;
  const kind = raw.kind;
  if (kind === 'file') {
    const name = String(raw.name ?? '');
    if (!/^wallpaper\.[a-z0-9]+$/i.test(name)) return null;
    const rev = Number(raw.rev);
    return {
      kind: 'file',
      name,
      rev: Number.isFinite(rev) ? Math.max(1, Math.floor(rev)) : 1,
    };
  }
  if (kind === 'url') {
    const url = String(raw.url ?? '');
    if (!/^https?:\/\//i.test(url) || url.length > 4096) return null;
    return { kind: 'url', url };
  }
  return null;
}

/** Accepts an unknown payload and returns a clean settings object or null. */
function sanitizeConfig(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const fit = pickStr(o, 'fit', ['cover', 'contain', 'fill'], 'cover');
  const clean = {
    version: 1,
    enabled: pickBool(o, 'enabled', false),
    image: sanitizeImage(o.image),
    fit,
    posX: pickNum(o, 'posX', 0, 100, 50),
    posY: pickNum(o, 'posY', 0, 100, 45),
    zoom: pickNum(o, 'zoom', 0.25, 4, 1),
    opacity: pickNum(o, 'opacity', 0, 1, 1),
    gradientStrength: pickNum(o, 'gradientStrength', 0, 1, 0.88),
    gradientHeight: pickNum(o, 'gradientHeight', 0.1, 1, 0.62),
    auraStrength: pickNum(o, 'auraStrength', 0, 1, 0.8),
    auraScale: pickNum(o, 'auraScale', 0.25, 3, 1),
    auraOffsetX: pickNum(o, 'auraOffsetX', -800, 800, 0),
    auraOffsetY: pickNum(o, 'auraOffsetY', -800, 800, -18),
    blur: Math.round(pickNum(o, 'blur', 0, 120, 0)),
  };
  return clean;
}

/* ------------------------------------------------------------------ */
/* Path helpers (defense in depth against traversal)                   */
/* ------------------------------------------------------------------ */

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh');
}

function dataRoot() {
  return join(dshHome(), DATA_DIR_NAME);
}

/** Resolve `rel` under `root`, refusing anything that escapes the root. */
function resolveInside(root, rel) {
  const candidate = normalize(join(root, rel));
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  if (candidate !== root && !candidate.startsWith(rootWithSep)) return null;
  return candidate;
}

/* ------------------------------------------------------------------ */
/* Plugin body                                                         */
/* ------------------------------------------------------------------ */

/**
 * @param {any} ctx - DSH cordis context (injects: webServer).
 */
export function apply(ctx) {
  const dir = dataRoot();

  /** @type {(req:any,res:any)=>Promise<void>} shared route handler */
  const handler = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const rest = decodeURIComponent(url.pathname.slice(ROUTE_PREFIX.length + 1));

    /* ---- settings: /config ---- */
    if (rest === 'config') {
      const configPath = join(dir, 'config.json');
      if (req.method === 'GET') {
        try {
          const raw = await readFile(configPath, 'utf8');
          sendJson(res, 200, JSON.parse(raw));
        } catch {
          sendJson(res, 200, {}); // no user config yet -> defaults win client-side
        }
        return;
      }
      if (req.method === 'PUT') {
        try {
          const body = JSON.parse(await readBody(req));
          const clean = sanitizeConfig(body);
          if (clean === null) {
            sendJson(res, 400, { error: 'invalid scenery config payload' });
            return;
          }
          await mkdir(dir, { recursive: true });
          await writeFile(configPath, JSON.stringify(clean, null, 2), 'utf8');
          sendJson(res, 200, { ok: true });
        } catch {
          sendJson(res, 400, { error: 'invalid JSON body' });
        }
        return;
      }
      if (req.method === 'DELETE') {
        try {
          await rm(configPath, { force: true });
        } catch {
          /* missing is fine */
        }
        sendJson(res, 200, { ok: true });
        return;
      }
      sendJson(res, 405, { error: 'method not allowed' });
      return;
    }

    /* ---- wallpaper upload: PUT /wallpaper (raw bytes) ---- */
    if (rest === 'wallpaper' && req.method === 'PUT') {
      try {
        const body = await readBody(req, 25 * 1024 * 1024);
        if (body.length === 0) {
          sendJson(res, 400, { error: 'empty upload' });
          return;
        }
        // Extension hints: explicit query first, then content-type, else sniff.
        const wanted = url.searchParams.get('ext');
        let ext = wanted && wanted.startsWith('.') ? wanted.toLowerCase() : '.' + String(wanted ?? '').toLowerCase();
        if (!ALLOWED_EXTS.has(ext)) {
          const ct = String(req.headers['content-type'] ?? '');
          ext = ct.includes('png')
            ? '.png'
            : ct.includes('jpeg') || ct.includes('jpg')
              ? '.jpg'
              : ct.includes('gif')
                ? '.gif'
                : ct.includes('webp')
                  ? '.webp'
                  : null;
        }
        if (!ext) {
          sendJson(res, 400, { error: 'unsupported image type; pass ?ext=.png|.jpg|.gif|.webp…' });
          return;
        }
        const file = join(dir, 'wallpaper' + ext);
        await mkdir(dir, { recursive: true });
        await writeFile(file, body);
        const rev = Math.floor(Date.now() / 1000);
        sendJson(res, 200, { ok: true, name: 'wallpaper' + ext, rev });
      } catch (e) {
        const msg = e instanceof Error && /too large/.test(e.message) ? 'upload too large (25MB cap)' : 'upload failed';
        sendJson(res, 413, { error: msg });
      }
      return;
    }

    /* ---- wallpaper stream: GET /wallpaper/<name> ---- */
    if (rest.startsWith('wallpaper/')) {
      const name = rest.slice('wallpaper/'.length);
      if (!/^wallpaper\.[a-z0-9]+$/i.test(name)) {
        sendJson(res, 400, { error: 'invalid wallpaper name' });
        return;
      }
      const file = resolveInside(dir, name);
      if (!file || !existsSync(file)) {
        sendJson(res, 404, { error: 'wallpaper not found' });
        return;
      }
      const ext = extname(file).toLowerCase();
      await sendFile(res, file, MIME_BY_EXT[ext] ?? 'application/octet-stream');
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  };

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler,
      }),
    'dsh-scenery: /dsh-scenery-bg persistence routes',
  );
}
