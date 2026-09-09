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
