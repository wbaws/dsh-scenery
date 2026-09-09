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
