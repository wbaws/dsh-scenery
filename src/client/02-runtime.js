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
