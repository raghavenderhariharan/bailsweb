/* BAIL'S Cricket Ground: admin panel */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let data = { honours: [], events: [], media: [], instagram: [], bookings: [], settings: {} };
  const TABS = ['calendar', 'events', 'honours', 'media', 'instagram', 'settings'];
  let tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'calendar';
  let editingId = null;

  // ------------------------------------------------------------ api
  async function api(method, url, body, isForm = false) {
    const opts = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      if (isForm) opts.body = body;
      else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    }
    const res = await fetch(url, opts);
    const json = await res.json().catch(() => ({}));
    if (res.status === 401 && url !== '/api/login') { showLogin(); throw new Error('Session expired. Please sign in again.'); }
    if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
    return json;
  }

  function toast(msg, error = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('is-error', error);
    t.classList.add('is-on');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('is-on'), 3200);
  }

  // ------------------------------------------------------------ config
  const today = () => new Date().toISOString().slice(0, 10);
  const CONFIG = {
    honours: {
      title: 'Honour Board',
      hint: 'Record every century and five-wicket haul scored at Bails. Entries appear on the gold honour board straight away.',
      defaults: () => ({ type: 'century', date: today() }),
      fields: [
        { name: 'type', label: 'Achievement', type: 'select', options: [['century', 'Century (100+ runs)'], ['fivefor', 'Five-wicket haul']], required: true },
        { name: 'player', label: 'Player name', required: true, placeholder: 'e.g. R. Sharma' },
        [{ name: 'team', label: 'Playing for' }, { name: 'versus', label: 'Against' }],
        [{ name: 'date', label: 'Match date', type: 'date', required: true }, { name: 'format', label: 'Format', placeholder: 'T20 / 40 overs / ODI', list: ['T20', 'T10', '25 overs', '30 overs', '40 overs', 'ODI (50 overs)', 'Two-day'] }],
        { name: 'tournament', label: 'Tournament / match', placeholder: 'e.g. Elite Corporate League S17' },
        [{ name: 'runs', label: 'Runs', type: 'number', min: 100, show: (v) => v.type === 'century', required: true }, { name: 'balls', label: 'Balls faced', type: 'number', min: 1, show: (v) => v.type === 'century' }],
        [{ name: 'fours', label: '4s', type: 'number', min: 0, show: (v) => v.type === 'century' }, { name: 'sixes', label: '6s', type: 'number', min: 0, show: (v) => v.type === 'century' }],
        { name: 'notOut', label: 'Not out', type: 'checkbox', show: (v) => v.type === 'century' },
        [{ name: 'wickets', label: 'Wickets', type: 'number', min: 5, max: 10, show: (v) => v.type === 'fivefor', required: true }, { name: 'runsConceded', label: 'Runs conceded', type: 'number', min: 0, show: (v) => v.type === 'fivefor', required: true }],
        { name: 'overs', label: 'Overs bowled', placeholder: 'e.g. 4 or 9.3', show: (v) => v.type === 'fivefor' },
        { name: 'photo', label: 'Player photo', type: 'upload', accept: 'image/*' },
        { name: 'link', label: 'Scorecard link', placeholder: 'https://cricheroes.com/…' },
        { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Any highlight worth remembering' },
      ],
      columns: ['Player', 'Figures', 'For / vs', 'Date'],
      row: (h) => [
        `<strong>${esc(h.player)}</strong> <span class="badge ${h.type === 'century' ? 'badge--gold' : ''}">${h.type === 'century' ? '100' : '5W'}</span>`,
        h.type === 'century' ? `${h.runs}${h.notOut ? '*' : ''}${h.balls ? ` (${h.balls})` : ''}` : `${h.wickets}/${h.runsConceded}${h.overs ? ` (${h.overs})` : ''}`,
        `${esc(h.team || '—')}<br><small>v ${esc(h.versus || '—')}</small>`,
        esc(h.date),
      ],
      sort: (a, b) => b.date.localeCompare(a.date),
      text: (h) => [h.player, h.team, h.versus, h.tournament].join(' '),
    },
    events: {
      title: 'Events & Fixtures',
      hint: 'Add tournaments (shown as feature cards) and individual match fixtures. Times are in IST.',
      defaults: () => ({ kind: 'match', format: 'T20', active: true }),
      fields: [
        { name: 'kind', label: 'Type', type: 'select', options: [['match', 'Match fixture'], ['tournament', 'Tournament'], ['event', 'Other event (camp, trials, corporate day…)']], required: true },
        { name: 'title', label: 'Title', required: true, placeholder: 'Auto-filled from team names for matches', hint: 'For matches, leave blank to use "Team A vs Team B"' },
        [{ name: 'teamA', label: 'Team A', show: (v) => v.kind === 'match' }, { name: 'teamB', label: 'Team B', show: (v) => v.kind === 'match' }],
        { name: 'tournament', label: 'Tournament name', listFrom: 'tournaments', hint: 'Use the same name on matches and their tournament card to link them' },
        [{ name: 'round', label: 'Round / stage', placeholder: 'League, Super League, Final…' }, { name: 'format', label: 'Format', list: ['T20', 'T10', '25 overs', '30 overs', '40 overs', 'ODI (50 overs)', 'Two-day'] }],
        [{ name: 'start', label: 'Starts (IST)', type: 'datetime-local', required: true }, { name: 'end', label: 'Ends (date)', type: 'date', show: (v) => v.kind !== 'match' }],
        { name: 'description', label: 'Description', type: 'textarea', show: (v) => v.kind !== 'match' },
        { name: 'poster', label: 'Cover / background image', type: 'upload', accept: 'image/*', show: (v) => v.kind !== 'match' },
        { name: 'flyer', label: 'Flyer / poster (portrait)', type: 'upload', accept: 'image/*', show: (v) => v.kind !== 'match', hint: 'Adding a flyer or bracket shows the tournament as a large spotlight card' },
        { name: 'bracket', label: 'Bracket / format image', type: 'upload', accept: 'image/*', show: (v) => v.kind !== 'match' },
        [{ name: 'fee', label: 'Entry fee', placeholder: '₹49,999 per team · Early bird ₹46,999', show: (v) => v.kind !== 'match' }, { name: 'contact', label: 'Registration contacts', placeholder: 'Raghu 99080 76230 · Aravind 97048 72506', show: (v) => v.kind !== 'match' }],
        { name: 'highlights', label: 'Highlights (one per line)', type: 'textarea', show: (v) => v.kind !== 'match', placeholder: 'Professional umpires\n360° camera coverage' },
        { name: 'link', label: 'Link (registration / live scores)', placeholder: 'https://…' },
        { name: 'active', label: 'Active (shown on the website)', type: 'checkbox', default: true },
        { name: 'tentative', label: 'Dates are tentative (shown as "Tentative start")', type: 'checkbox', show: (v) => v.kind !== 'match' },
        { name: 'featured', label: 'Feature on home page', type: 'checkbox', show: (v) => v.kind !== 'match' },
      ],
      columns: ['When (IST)', 'Event', 'Type', 'Status'],
      row: (e) => [
        esc(e.start.replace('T', ' ')),
        `<strong>${esc(e.title)}</strong>${e.tournament && e.kind === 'match' ? `<br><small>${esc(e.tournament)}${e.round ? ' · ' + esc(e.round) : ''}</small>` : ''}`,
        `<span class="badge ${e.kind === 'tournament' ? 'badge--gold' : e.kind === 'event' ? '' : 'badge--muted'}">${esc(e.kind)}</span>${e.chMatchId ? ' <span class="badge badge--ch" title="Imported from CricHeroes">CricHeroes</span>' : ''}${new Date(e.start + ':00+05:30') < new Date() ? ' <span class="badge badge--muted">past</span>' : ''}`,
        `<button class="status-toggle ${e.active === false ? 'is-off' : 'is-on'}" type="button" data-toggle-active="${esc(e.id)}" aria-pressed="${e.active !== false}" title="${e.active === false ? 'Hidden from the website. Click to activate.' : 'Shown on the website. Click to deactivate.'}"><span></span>${e.active === false ? 'Inactive' : 'Active'}</button>`,
      ],
      sort: (a, b) => a.start.localeCompare(b.start),
      text: (e) => [e.title, e.tournament, e.teamA, e.teamB].join(' '),
      beforeSave: (v) => {
        if (v.kind === 'match' && !v.title && v.teamA && v.teamB) v.title = `${v.teamA} vs ${v.teamB}`;
        return v;
      },
    },
    media: {
      title: 'Gallery & Videos',
      hint: 'Upload photos or MP4 videos. Use the arrows to change the gallery order.',
      defaults: () => ({ kind: 'image' }),
      fields: [
        { name: 'kind', label: 'Type', type: 'select', options: [['image', 'Photo'], ['video', 'Video file (MP4/WebM)']], required: true },
        { name: 'src', label: 'File or link', type: 'upload', required: true, acceptFrom: (v) => (v.kind === 'video' ? 'video/*' : 'image/*'), hint: 'Upload a file, or paste an https:// link' },
        { name: 'thumb', label: 'Thumbnail / poster (optional)', type: 'upload', accept: 'image/*', show: (v) => v.kind === 'video' },
        { name: 'caption', label: 'Caption' },
      ],
      columns: ['', 'Caption', 'Type', 'Order'],
      row: (m, i, list) => [
        m.kind === 'image' ? `<img class="thumb" src="${esc(m.thumb || m.src)}" alt="">` : m.thumb ? `<img class="thumb" src="${esc(m.thumb)}" alt="">` : '<span class="thumb" style="display:grid;place-items:center">▶</span>',
        esc(m.caption || '—'),
        `<span class="badge">${esc(m.kind)}</span>`,
        `<button class="btn btn--ghost btn--sm" data-move="-1" data-id="${esc(m.id)}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button><button class="btn btn--ghost btn--sm" data-move="1" data-id="${esc(m.id)}" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>`,
      ],
      text: (m) => m.caption || '',
    },
    instagram: {
      title: 'Instagram posts',
      hint: 'Paste links to posts or reels from instagram.com/bailscricket. They are embedded on the home page using Instagram\'s official embed.',
      defaults: () => ({}),
      fields: [
        { name: 'url', label: 'Post or reel link', required: true, placeholder: 'https://www.instagram.com/p/XXXXXXXX/' },
        { name: 'caption', label: 'Short caption (fallback text)' },
      ],
      columns: ['Link', 'Caption'],
      row: (p) => [`<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url.replace('https://www.instagram.com', ''))}</a>`, esc(p.caption || '—')],
      text: (p) => p.url + ' ' + (p.caption || ''),
    },
  };

  const SETTINGS_FIELDS = [
    { name: 'announcement', label: 'Announcement bar', hint: 'Shown under the hero. Leave blank to hide.' },
    [{ name: 'phone1', label: 'Phone 1' }, { name: 'phone2', label: 'Phone 2' }],
    { name: 'contacts', label: 'Contact people', type: 'textarea', hint: 'One per line, as "Name - number". Shown under "Contact us" with tap-to-call links.' },
    { name: 'whatsapp', label: 'WhatsApp number', hint: 'Digits only, with country code, e.g. 919032599139' },
    { name: 'bookingNote', label: 'Booking note', type: 'textarea' },
    { name: 'instagramUrl', label: 'Instagram URL' },
    { name: 'facebookUrl', label: 'Facebook page URL', hint: 'Leave blank to hide the Facebook button' },
    { name: 'youtubeUrl', label: 'YouTube channel URL' },
    { name: 'cricheroesGroundId', label: 'CricHeroes ground ID', placeholder: '750279', hint: 'From the ground page link: cricheroes.com/cricket-ground-detail/<ID>/…' },
    { name: 'cricheroesAuto', label: 'Check CricHeroes for new matches automatically (every 6 hours)', type: 'checkbox', default: true },
    { name: 'cricheroesExclude', label: 'Skip CricHeroes tournaments containing', placeholder: 'Octa, Practice', hint: 'Comma-separated. Matches from these tournaments are not imported.', default: 'Octa' },
    { name: 'gwSportsUrl', label: 'GW Sports booking page', placeholder: 'https://www.gwsportsapp.in/hyderabad/cricket/booking-sports-online-venue/…', hint: 'Online slot booking. Paste the Bails venue page from gwsportsapp.in once it is listed. Leave blank to hide the GW Sports buttons.' },
  ];

  // ------------------------------------------------------------ form builder
  const flat = (fields) => fields.flat();
  function fieldHtml(f, v) {
    const id = `f_${f.name}`;
    const val = v[f.name] ?? f.default ?? '';
    const req = f.required ? ' <span aria-hidden="true">*</span>' : '';
    const hint = f.hint ? `<small>${esc(f.hint)}</small>` : '';
    const hidden = f.show && !f.show(v) ? ' hidden' : '';
    const wrap = (inner) => `<label for="${id}" data-field="${f.name}"${hidden}><span class="lbl">${esc(f.label)}${req}</span>${inner}${hint}</label>`;
    switch (f.type) {
      case 'select':
        return wrap(`<select id="${id}" name="${f.name}">${f.options.map(([k, l]) => `<option value="${esc(k)}" ${k === val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`);
      case 'textarea':
        return wrap(`<textarea id="${id}" name="${f.name}" placeholder="${esc(f.placeholder || '')}">${esc(val)}</textarea>`);
      case 'checkbox':
        return `<label class="check" data-field="${f.name}"${hidden}><input type="checkbox" id="${id}" name="${f.name}" ${val ? 'checked' : ''}> ${esc(f.label)}</label>`;
      case 'upload': {
        const accept = f.acceptFrom ? f.acceptFrom(v) : f.accept || '*/*';
        const isImg = val && /\.(jpe?g|png|webp|gif)$/i.test(val);
        return wrap(`<div class="upload"><input type="text" id="${id}" name="${f.name}" value="${esc(val)}" placeholder="/uploads/… or https://…"><span class="btn btn--ghost btn--sm upload__btn">Upload<input type="file" data-upload="${f.name}" accept="${esc(accept)}"></span></div>${isImg ? `<img class="preview" src="${esc(val)}" alt="">` : ''}`);
      }
      default: {
        const listId = f.list || f.listFrom ? `dl_${f.name}` : '';
        const opts = f.listFrom === 'tournaments' ? [...new Set(data.events.map((e) => e.tournament).filter(Boolean))] : f.list || [];
        const dl = listId ? `<datalist id="${listId}">${opts.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>` : '';
        const type = f.type || 'text';
        const attrs = [f.min !== undefined ? `min="${f.min}"` : '', f.max !== undefined ? `max="${f.max}"` : '', listId ? `list="${listId}"` : ''].join(' ');
        return wrap(`<input type="${type}" id="${id}" name="${f.name}" value="${esc(val)}" placeholder="${esc(f.placeholder || '')}" ${attrs}>${dl}`);
      }
    }
  }

  function buildForm(form, fields, values, { submitLabel, onCancel }) {
    form.innerHTML = fields.map((f) => (Array.isArray(f)
      ? `<div class="row${f.length === 3 ? ' row--3' : ''}">${f.map((x) => fieldHtml(x, values)).join('')}</div>`
      : fieldHtml(f, values))).join('')
      + `<p class="field-error" id="${form.id}_err" role="alert"></p>
         <div class="form__actions"><button class="btn btn--primary" type="submit">${esc(submitLabel)}</button>${onCancel ? '<button class="btn btn--ghost" type="button" data-cancel>Cancel</button>' : ''}</div>`;
    if (onCancel) $('[data-cancel]', form).addEventListener('click', onCancel);
    // re-evaluate conditional fields on change
    form.oninput = form.onchange = (e) => {
      if (e.target.type === 'file') return;
      const v = readForm(form, fields);
      flat(fields).forEach((f) => {
        const el = $(`[data-field="${f.name}"]`, form);
        if (el && f.show) el.hidden = !f.show(v);
        if (f.acceptFrom) { const fi = $(`[data-upload="${f.name}"]`, form); if (fi) fi.accept = f.acceptFrom(v); }
      });
    };
    $$('[data-upload]', form).forEach((fi) => fi.addEventListener('change', async () => {
      const file = fi.files[0]; if (!file) return;
      const target = $(`[name="${fi.dataset.upload}"]`, form);
      const btn = fi.parentElement;
      btn.firstChild.textContent = 'Uploading…';
      try {
        const fd = new FormData(); fd.append('file', file);
        const res = await api('POST', '/api/upload', fd, true);
        target.value = res.url;
        const label = target.closest('label');
        $('.preview', label)?.remove();
        if (res.type.startsWith('image/')) label.insertAdjacentHTML('beforeend', `<img class="preview" src="${esc(res.url)}" alt="">`);
        toast('File uploaded');
      } catch (err) { toast(err.message, true); }
      btn.firstChild.textContent = 'Upload';
      fi.value = '';
    }));
  }

  function readForm(form, fields) {
    const out = {};
    flat(fields).forEach((f) => {
      const el = $(`[name="${f.name}"]`, form);
      if (!el) return;
      const visible = !f.show || !el.closest('[data-field]')?.hidden;
      if (f.type === 'checkbox') out[f.name] = el.checked;
      else if (f.type === 'number') out[f.name] = el.value === '' ? '' : Number(el.value);
      else out[f.name] = el.value.trim();
      if (!visible) out[f.name] = f.type === 'checkbox' ? false : '';
    });
    return out;
  }

  // ------------------------------------------------------------ views
  function showLogin() { $('#appView').hidden = true; $('#loginView').hidden = false; $('[name=password]').focus(); }
  function showApp() { $('#loginView').hidden = true; $('#appView').hidden = false; }

  function switchTab(name) {
    tab = name; editingId = null;
    $$('#tabs button').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === name));
    history.replaceState(null, '', `${location.pathname}${location.search}#${name}`);
    $('#panel').hidden = name === 'settings' || name === 'calendar';
    $('#settingsPanel').hidden = name !== 'settings';
    $('#calPanel').hidden = name !== 'calendar';
    $('#syncBar').hidden = !(name === 'calendar' || name === 'events');
    renderSync();
    $('#listSearch').value = '';
    if (name === 'settings') renderSettings();
    else if (name === 'calendar') renderCalendarTab();
    else { renderEditor(); renderList(); }
  }

  function renderEditor(item) {
    const cfg = CONFIG[tab];
    editingId = item?.id || null;
    $('#formTitle').textContent = item ? `Edit ${cfg.title.toLowerCase().replace(/s$/, '')}` : `Add to ${cfg.title}`;
    $('#formHint').textContent = cfg.hint;
    const form = $('#editor');
    buildForm(form, cfg.fields, item ? { ...item } : cfg.defaults(), {
      submitLabel: item ? 'Save changes' : 'Add entry',
      onCancel: item ? () => { renderEditor(); renderList(); } : null,
    });
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', form);
      let v = readForm(form, cfg.fields);
      if (cfg.beforeSave) v = cfg.beforeSave(v);
      $(`#${form.id}_err`).textContent = '';
      btn.disabled = true;
      try {
        if (editingId) {
          const saved = await api('PUT', `/api/${tab}/${editingId}`, v);
          data[tab] = data[tab].map((x) => (x.id === saved.id ? saved : x));
          toast('Saved');
        } else {
          const saved = await api('POST', `/api/${tab}`, v);
          data[tab].push(saved);
          toast('Added');
        }
        renderEditor(); renderList();
      } catch (err) {
        $(`#${form.id}_err`).textContent = err.message;
      }
      btn.disabled = false;
    };
  }

  function renderList() {
    const cfg = CONFIG[tab];
    const q = $('#listSearch').value.trim().toLowerCase();
    let items = [...data[tab]];
    if (cfg.sort) items.sort(cfg.sort);
    const all = items;
    if (q) items = items.filter((x) => cfg.text(x).toLowerCase().includes(q));
    $('#listTitle').textContent = `${cfg.title} (${data[tab].length})`;
    if (!items.length) { $('#list').innerHTML = `<p class="empty">${q ? 'Nothing matches that filter.' : 'Nothing here yet. Add the first entry using the form.'}</p>`; return; }
    $('#list').innerHTML = `<div class="table-wrap"><table>
      <thead><tr>${cfg.columns.map((c) => `<th>${esc(c)}</th>`).join('')}<th></th></tr></thead>
      <tbody>${items.map((x) => `<tr class="${x.id === editingId ? 'is-editing' : ''}">${cfg.row(x, all.indexOf(x), all).map((c) => `<td>${c}</td>`).join('')}
        <td class="actions"><button class="btn btn--ghost btn--sm" data-edit="${esc(x.id)}">Edit</button><button class="btn btn--danger btn--sm" data-del="${esc(x.id)}">Delete</button></td></tr>`).join('')}</tbody>
    </table></div>`;
  }

  $('#list').addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-del]');
    const move = e.target.closest('[data-move]');
    const tog = e.target.closest('[data-toggle-active]');
    if (tog) {
      const item = data.events.find((x) => x.id === tog.dataset.toggleActive);
      tog.disabled = true;
      try {
        const saved = await api('PUT', `/api/events/${item.id}`, { active: item.active === false });
        data.events = data.events.map((x) => (x.id === saved.id ? saved : x));
        toast(saved.active === false ? 'Hidden from the website' : 'Now showing on the website');
        if (editingId === saved.id) renderEditor(saved);
        renderList();
      } catch (err) { toast(err.message, true); tog.disabled = false; }
      return;
    }
    if (edit) {
      renderEditor(data[tab].find((x) => x.id === edit.dataset.edit));
      renderList();
      $('#editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (del) {
      const item = data[tab].find((x) => x.id === del.dataset.del);
      const name = item.player || item.title || item.caption || item.url || 'this entry';
      if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
      try {
        await api('DELETE', `/api/${tab}/${item.id}`);
        data[tab] = data[tab].filter((x) => x.id !== item.id);
        if (editingId === item.id) renderEditor();
        renderList(); toast('Deleted');
      } catch (err) { toast(err.message, true); }
    }
    if (move) {
      const i = data.media.findIndex((m) => m.id === move.dataset.id);
      const j = i + Number(move.dataset.move);
      if (j < 0 || j >= data.media.length) return;
      [data.media[i], data.media[j]] = [data.media[j], data.media[i]];
      renderList();
      try { await api('POST', '/api/media-order', { ids: data.media.map((m) => m.id) }); } catch (err) { toast(err.message, true); }
    }
  });
  $('#listSearch').addEventListener('input', renderList);

  function renderSettings() {
    const form = $('#settingsForm');
    buildForm(form, SETTINGS_FIELDS, { ...data.settings }, { submitLabel: 'Save settings' });
    form.onsubmit = async (e) => {
      e.preventDefault();
      $(`#${form.id}_err`).textContent = '';
      try {
        data.settings = await api('PUT', '/api/settings', readForm(form, SETTINGS_FIELDS));
        toast('Settings saved');
      } catch (err) { $(`#${form.id}_err`).textContent = err.message; }
    };
  }

  // ------------------------------------------------------------ calendar tab
  const C = window.BailsCal;
  const acal = { y: 0, m: 0, selected: C.todayIST() };
  {
    const want = new URLSearchParams(location.search).get('date');
    if (want && /^\d{4}-\d{2}-\d{2}$/.test(want)) acal.selected = want;
    const [y, m] = acal.selected.split('-').map(Number);
    acal.y = y; acal.m = m - 1;
  }
  const BOOK_CATS = [['hca', 'HCA division match'], ['tournament', 'Tournament day'], ['private', 'Private booking'], ['practice', 'Practice / nets'], ['maintenance', 'Ground maintenance'], ['other', 'Other (booked)']];
  const shiftDate = (date, days) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

  function renderCalendarTab() {
    $('#aCalLegend').innerHTML = C.LEGEND;
    $('#aCalMonth').textContent = C.monthLabel(acal.y, acal.m);
    const map = C.buildDayMap(data.events.map((e) => (e.active === false ? { ...e, teamA: '', teamB: '', title: `${e.title} (inactive)` } : e)), data.bookings);
    C.renderMonth($('#aCalGrid'), { year: acal.y, month: acal.m, map, selected: acal.selected, onSelect: (d) => { acal.selected = d; renderCalendarTab(); } });
    $('#aCalStats').innerHTML = C.statsHtml(C.monthStats(acal.y, acal.m, map));
    bulkDefaults();
    renderDay(map);
    renderUpcoming();
  }
  $('#aCalPrev').addEventListener('click', () => { acal.m -= 1; if (acal.m < 0) { acal.m = 11; acal.y -= 1; } renderCalendarTab(); });
  $('#aCalNext').addEventListener('click', () => { acal.m += 1; if (acal.m > 11) { acal.m = 0; acal.y += 1; } renderCalendarTab(); });
  $('#aCalToday').addEventListener('click', () => { acal.selected = C.todayIST(); const [y, m] = acal.selected.split('-').map(Number); acal.y = y; acal.m = m - 1; renderCalendarTab(); });

  function renderDay(map) {
    const date = acal.selected;
    const items = map.get(date) || [];
    const h = C.slotsTaken(items);
    const free = C.SLOT_IDS.filter((x) => !h[x]);
    const slotOpts = [...(free.length === 3 ? [['full', 'Full day (all 3 slots)']] : []), ...free.map((x) => [x, C.SLOT_NAMES[x]])];
    const tournaments = [...new Set(data.events.map((e) => e.tournament).filter(Boolean))];
    $('#aDay').innerHTML = `
      <h2>${esc(C.dayLabel(date))}</h2>
      ${items.length ? `<ul class="dayitems">${items.map((it) => `<li>
          <i class="${C.CATS[it.cat]?.cls || 'c-book'}"></i>
          <div><strong>${esc(it.label)}</strong><small>${esc([it.kind === 'fixture' ? 'Fixture' : C.CATS[it.cat]?.label, C.SLOT_NAMES[it.slot], it.time && C.time12(it.time), it.sub].filter(Boolean).join(' · '))}</small>${it.ref.note ? `<small class="note">Note: ${esc(it.ref.note)}</small>` : ''}</div>
          <span class="dayitems__act">${it.kind === 'fixture' ? `<button class="btn btn--ghost btn--sm" data-edit-fixture="${esc(it.ref.id)}">Edit</button>` : ''}<button class="btn btn--danger btn--sm" data-del-${it.kind}="${esc(it.ref.id)}">Delete</button></span>
        </li>`).join('')}</ul>` : '<p class="empty empty--sm">Nothing on this day yet.</p>'}

      <details class="dayform" ${free.length ? 'open' : ''}>
        <summary>Block a slot</summary>
        ${slotOpts.length ? `<form id="blockForm" novalidate>
          <div class="row">
            <label><span class="lbl">Slot</span><select name="slot">${slotOpts.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
            <label><span class="lbl">Reason</span><select name="category">${BOOK_CATS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
          </div>
          <label><span class="lbl">Label on the public calendar</span><input name="label" maxlength="100" placeholder="e.g. HCA A-Division league · leave blank for the reason"></label>
          <label><span class="lbl">Private note (admins only)</span><input name="note" maxlength="300" placeholder="e.g. Booked by Ravi, paid advance"></label>
          <label><span class="lbl">Repeat weekly</span><select name="repeat">${[0, 1, 2, 3, 4, 5, 7, 11, 15, 25].map((n) => `<option value="${n}">${n ? `Same day for ${n + 1} weeks` : 'Just this day'}</option>`).join('')}</select></label>
          <p class="field-error" id="blockErr" role="alert"></p>
          <div class="form__actions"><button class="btn btn--primary" type="submit">Block slot</button></div>
        </form>` : '<p class="hint">All three slots are taken. Delete an item above to free a slot.</p>'}
      </details>

      <details class="dayform" open>
        <summary>Add a fixture</summary>
        <form id="dayFixtureForm" novalidate>
          <div class="row"><label><span class="lbl">Team A *</span><input name="teamA" maxlength="100" required></label><label><span class="lbl">Team B *</span><input name="teamB" maxlength="100" required></label></div>
          <label><span class="lbl">Tournament</span><input name="tournament" list="dl_daytour" maxlength="140"><datalist id="dl_daytour">${tournaments.map((t) => `<option value="${esc(t)}">`).join('')}</datalist></label>
          <div class="row">
            <label><span class="lbl">Start time (IST) *</span><input name="time" type="time" value="${(C.SLOTS.find((s) => free.includes(s.id)) || C.SLOTS[0]).start}" required></label>
            <label><span class="lbl">Format</span><input name="format" list="dl_dayfmt" value="T20" maxlength="40"><datalist id="dl_dayfmt"><option value="T20"><option value="T10"><option value="25 overs"><option value="30 overs"><option value="40 overs"><option value="ODI (50 overs)"></datalist></label>
          </div>
          <label><span class="lbl">Round / stage</span><input name="round" maxlength="80" placeholder="League, Semi-final, Final…"></label>
          <p class="field-error" id="dayFixErr" role="alert"></p>
          <div class="form__actions"><button class="btn btn--primary" type="submit">Add fixture</button></div>
        </form>
      </details>`;

    $('#blockForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const btn = $('button[type=submit]', f); btn.disabled = true;
      const base = { slot: f.slot.value, category: f.category.value, label: f.label.value.trim(), note: f.note.value.trim() };
      const weeks = Number(f.repeat.value);
      const done = []; const skipped = [];
      for (let w = 0; w <= weeks; w++) {
        const d = shiftDate(date, w * 7);
        try { data.bookings.push(await api('POST', '/api/bookings', { ...base, date: d })); done.push(d); } catch (err) { skipped.push(`${d}: ${err.message}`); if (w === 0 && weeks === 0) { $('#blockErr').textContent = err.message; btn.disabled = false; return; } }
      }
      toast(skipped.length ? `Blocked ${done.length} day(s); skipped ${skipped.length} already taken` : done.length > 1 ? `Blocked ${done.length} days` : 'Slot blocked', skipped.length > 0);
      if (skipped.length) console.warn('Skipped:', skipped);
      renderCalendarTab();
    });

    $('#dayFixtureForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const v = Object.fromEntries([...new FormData(f)].map(([k, x]) => [k, String(x).trim()]));
      if (!v.teamA || !v.teamB) { $('#dayFixErr').textContent = 'Enter both team names'; return; }
      if (!v.time) { $('#dayFixErr').textContent = 'Enter a start time'; return; }
      const body = { kind: 'match', title: `${v.teamA} vs ${v.teamB}`, teamA: v.teamA, teamB: v.teamB, tournament: v.tournament, round: v.round, format: v.format, start: `${date}T${v.time}` };
      const clash = h[C.matchSlot(body.start)];
      if (clash && !confirm(`${C.SLOT_SHORT[C.matchSlot(body.start)]} is already taken by "${clash.label}". Add this fixture anyway?`)) return;
      const btn = $('button[type=submit]', f); btn.disabled = true;
      try { data.events.push(await api('POST', '/api/events', body)); toast('Fixture added'); renderCalendarTab(); } catch (err) { $('#dayFixErr').textContent = err.message; btn.disabled = false; }
    });
  }

  // ---- bulk block / unblock
  const bulkForm = $('#bulkForm');
  function bulkDefaults() {
    if (bulkForm.from.value) return;
    bulkForm.from.value = acal.selected;
    bulkForm.to.value = new Date(Date.UTC(acal.y, acal.m + 1, 0)).toISOString().slice(0, 10);
    bulkPreview();
  }
  function bulkBody() {
    const f = bulkForm;
    return {
      from: f.from.value, to: f.to.value, slot: f.slot.value, category: f.category.value,
      label: f.label.value.trim(), note: f.note.value.trim(),
      days: $$('input[name=day]:checked', f).map((x) => Number(x.value)),
    };
  }
  function bulkDates(b) {
    const out = [];
    if (!b.from || !b.to || b.to < b.from) return out;
    for (let d = new Date(`${b.from}T12:00:00Z`); d <= new Date(`${b.to}T12:00:00Z`) && out.length <= 400; d.setUTCDate(d.getUTCDate() + 1)) {
      if (b.days.includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10));
    }
    return out;
  }
  function bulkPreview() {
    const b = bulkBody();
    const n = bulkDates(b).length;
    $('#bulkPreview').textContent = n ? `${n} date${n > 1 ? 's' : ''} selected · ${C.SLOT_NAMES[b.slot]}` : 'No dates match. Check the range and the days.';
  }
  bulkForm.addEventListener('input', bulkPreview);
  bulkForm.addEventListener('change', bulkPreview);
  $$('[data-days]', bulkForm).forEach((btn) => btn.addEventListener('click', () => {
    $$('input[name=day]', bulkForm).forEach((x) => { x.checked = btn.dataset.days.includes(x.value); });
    bulkPreview();
  }));
  async function runBulk(mode) {
    const b = bulkBody();
    $('#bulkErr').textContent = '';
    const dates = bulkDates(b);
    if (!dates.length) { $('#bulkErr').textContent = 'No dates match. Check the range and the days.'; return; }
    if (mode === 'unblock' && !confirm(`Remove blocks (${C.SLOT_NAMES[b.slot]}) on ${dates.length} date(s)? Fixtures are not affected.`)) return;
    const btns = $$('button', bulkForm);
    btns.forEach((x) => { x.disabled = true; });
    try {
      const r = await api('POST', '/api/bookings/bulk', { ...b, mode });
      if (mode === 'unblock') {
        const set = new Set(dates);
        data.bookings = data.bookings.filter((x) => !(set.has(x.date) && C.PARTS[x.slot].some((part) => C.PARTS[b.slot].includes(part))));
        toast(`Freed ${r.removed} block${r.removed === 1 ? '' : 's'}`);
      } else {
        data.bookings.push(...r.created);
        toast(r.skipped.length ? `Blocked ${r.created.length} date(s); ${r.skipped.length} skipped (already blocked)` : `Blocked ${r.created.length} date(s)`, r.skipped.length > 0 && !r.created.length);
        if (r.skipped.length) $('#bulkErr').textContent = `Skipped: ${r.skipped.map((x) => x.date).join(', ')}`;
      }
      renderCalendarTab();
    } catch (err) { $('#bulkErr').textContent = err.message; }
    btns.forEach((x) => { x.disabled = false; });
  }
  bulkForm.addEventListener('submit', (e) => { e.preventDefault(); runBulk('block'); });
  $('#bulkUnblock').addEventListener('click', () => runBulk('unblock'));

  function renderUpcoming() {
    const today = C.todayIST();
    const list = data.bookings.filter((b) => b.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot));
    $('#aUpcoming').innerHTML = list.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Slot</th><th>Reason</th><th>Public label</th><th>Note</th><th></th></tr></thead>
      <tbody>${list.map((b) => `<tr><td><a href="#" data-goto="${esc(b.date)}">${esc(b.date)}</a></td><td>${esc(C.SLOT_NAMES[b.slot])}</td><td><span class="badge ${b.category === 'hca' ? 'badge--blue' : ''}">${esc(C.CATS[b.category]?.label || b.category)}</span></td><td>${esc(b.label || '—')}</td><td><small>${esc(b.note || '')}</small></td>
        <td class="actions"><button class="btn btn--danger btn--sm" data-del-booking="${esc(b.id)}">Delete</button></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="empty empty--sm">No upcoming blocked slots. Fixtures still show on the calendar automatically.</p>';
  }

  $('#calPanel').addEventListener('click', async (e) => {
    const go = e.target.closest('[data-goto]');
    if (go) { e.preventDefault(); acal.selected = go.dataset.goto; const [y, m] = acal.selected.split('-').map(Number); acal.y = y; acal.m = m - 1; renderCalendarTab(); return; }
    const ef = e.target.closest('[data-edit-fixture]');
    if (ef) { const item = data.events.find((x) => x.id === ef.dataset.editFixture); switchTab('events'); renderEditor(item); renderList(); return; }
    const df = e.target.closest('[data-del-fixture]');
    const db = e.target.closest('[data-del-booking]');
    if (!df && !db) return;
    const coll = df ? 'events' : 'bookings';
    const id = df ? df.dataset.delFixture : db.dataset.delBooking;
    const item = data[coll].find((x) => x.id === id);
    const name = df ? item.title : `${item.date} ${C.SLOT_SHORT[item.slot]} (${item.label || C.CATS[item.category]?.label})`;
    if (!confirm(`Delete ${df ? 'the fixture' : 'the blocked slot'} "${name}"? This cannot be undone.`)) return;
    try {
      await api('DELETE', `/api/${coll}/${id}`);
      data[coll] = data[coll].filter((x) => x.id !== id);
      toast(df ? 'Fixture deleted' : 'Slot freed');
      renderCalendarTab();
    } catch (err) { toast(err.message, true); }
  });

  // ------------------------------------------------------------ CricHeroes sync
  function ago(iso) {
    const s = Math.round((Date.now() - new Date(iso)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  }
  function renderSync() {
    const r = data.sync;
    const auto = data.settings.cricheroesAuto !== false;
    $('#syncDot').className = `syncbar__dot ${!r ? '' : r.ok ? 'is-ok' : 'is-err'}`;
    $('#syncText').textContent = !r
      ? `Not checked yet${auto ? ' · checks automatically every 6 hours' : ''}`
      : r.ok
        ? `checked ${ago(r.at)} · ${r.found} upcoming at Bails · ${r.added} new, ${r.updated} updated${r.skipped ? `, ${r.skipped} skipped` : ''}${auto ? ' · auto every 6 h' : ' · auto off'}`
        : `last check ${ago(r.at)} failed: ${r.error}`;
  }
  $('#syncBtn').addEventListener('click', async () => {
    const btn = $('#syncBtn');
    btn.disabled = true; btn.textContent = 'Checking CricHeroes…';
    try {
      const r = await fetch('/api/cricheroes/sync', { method: 'POST', credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) { showLogin(); return; }
      if (j.events) data.events = j.events;
      data.sync = j;
      if (!r.ok) throw new Error(j.error || j.message || `Failed (${r.status})`);
      toast(j.added || j.updated ? `${j.added} new and ${j.updated} updated fixture(s) from CricHeroes` : 'Up to date: no new matches on CricHeroes');
      if (tab === 'calendar') renderCalendarTab(); else if (tab === 'events') renderList();
    } catch (err) { toast(err.message, true); }
    renderSync();
    btn.disabled = false; btn.textContent = '↻ Refresh from CricHeroes';
  });

  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) switchTab(b.dataset.tab); });

  // ------------------------------------------------------------ auth
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    $('#loginError').textContent = '';
    try {
      await api('POST', '/api/login', { username: fd.get('username'), password: fd.get('password') });
      e.target.reset();
      await boot();
    } catch (err) { $('#loginError').textContent = err.message; }
  });
  $('#logout').addEventListener('click', async () => { await api('POST', '/api/logout').catch(() => {}); showLogin(); });

  async function boot() {
    try { await api('GET', '/api/me'); } catch { showLogin(); return; }
    data = await api('GET', '/api/admin-data');
    for (const k of ['honours', 'events', 'media', 'instagram', 'bookings']) data[k] ??= [];
    showApp();
    switchTab(tab);
  }
  boot();
})();
