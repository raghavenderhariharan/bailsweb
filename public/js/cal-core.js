/* BAIL'S Cricket Ground: shared month-calendar logic (public site + admin) */
(() => {
  'use strict';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TZ = 'Asia/Kolkata';

  const CATS = {
    fixture: { label: 'Fixture', cls: 'c-fix' },
    hca: { label: 'HCA division match', cls: 'c-hca' },
    tournament: { label: 'Tournament', cls: 'c-fix' },
    private: { label: 'Private booking', cls: 'c-book' },
    practice: { label: 'Practice / nets', cls: 'c-book' },
    maintenance: { label: 'Ground maintenance', cls: 'c-maint' },
    other: { label: 'Booked', cls: 'c-book' },
  };
  // Three playing slots a day (the ground is open 7 AM – 6 PM)
  const SLOTS = [
    { id: 's1', name: 'Slot 1', time: '7:00 – 10:30 AM', start: '07:00' },
    { id: 's2', name: 'Slot 2', time: '10:45 AM – 2:15 PM', start: '10:45' },
    { id: 's3', name: 'Slot 3', time: '2:30 – 6:00 PM', start: '14:30' },
  ];
  const SLOT_IDS = SLOTS.map((s) => s.id);
  const SLOT_NAMES = { full: 'Full day', ...Object.fromEntries(SLOTS.map((s) => [s.id, `${s.name} (${s.time})`])) };
  const SLOT_SHORT = { full: 'Full day', ...Object.fromEntries(SLOTS.map((s) => [s.id, s.name])) };
  const PARTS = { full: SLOT_IDS, s1: ['s1'], s2: ['s2'], s3: ['s3'] };

  const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const time12 = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
  };

  /** Which slot a fixture falls in, from its start time: before 10:30 → 1, before 2:15 PM → 2, else 3. */
  const matchSlot = (start) => {
    const hm = start.slice(11, 16);
    return hm < '10:30' ? 's1' : hm < '14:15' ? 's2' : 's3';
  };

  /** Short name for a fixture chip: "Elite Corporate League Season 17" -> "ECL" */
  const shortTournament = (name) => {
    const base = String(name || '').split(/\s+(?:season|s\d)/i)[0].replace(/[·:,-].*$/, '').trim();
    const words = base.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
    return words.length >= 2 ? words.map((w) => w[0].toUpperCase()).join('') : base;
  };

  /** Build date -> [{slot, cat, label, short, time, kind, ref}] from fixtures and bookings. */
  function buildDayMap(events, bookings) {
    const map = new Map();
    const add = (date, item) => { if (!map.has(date)) map.set(date, []); map.get(date).push(item); };
    events.filter((e) => e.kind === 'match').forEach((e) => {
      const label = e.teamA && e.teamB ? `${e.teamA} vs ${e.teamB}` : e.title;
      add(e.start.slice(0, 10), {
        kind: 'fixture', slot: matchSlot(e.start), cat: 'fixture', time: e.start.slice(11, 16),
        label, short: e.tournament ? shortTournament(e.tournament) : label, sub: e.tournament || '', ref: e,
      });
    });
    bookings.forEach((b) => {
      const label = b.label || CATS[b.category]?.label || 'Booked';
      add(b.date, { kind: 'booking', slot: b.slot, cat: b.category, label, short: label, sub: '', ref: b });
    });
    for (const list of map.values()) list.sort((a, b) => (a.slot === 'full' ? -1 : b.slot === 'full' ? 1 : 0) || a.slot.localeCompare(b.slot) || (a.time || '').localeCompare(b.time || ''));
    return map;
  }

  /** Which item (if any) occupies each slot of the day: { s1, s2, s3 }. */
  function slotsTaken(items = []) {
    const out = Object.fromEntries(SLOT_IDS.map((id) => [id, null]));
    items.forEach((it) => (PARTS[it.slot] || []).forEach((p) => { out[p] ??= it; }));
    return out;
  }

  /** Chips for one day: a red "Full Day" chip, or one chip per slot (red = blocked, green = open). */
  function dayChips(date, items, today) {
    const full = items.find((it) => it.slot === 'full');
    if (full) return `<span class="chip-b is-blocked" title="${esc(`Full day: ${full.label}`)}">Full Day · ${esc(full.short)}</span>`;
    const h = slotsTaken(items);
    return SLOTS.map((s) => {
      const it = h[s.id];
      if (it) return `<span class="chip-b is-blocked" title="${esc(`${s.name} (${s.time}): ${it.label}${it.sub ? ` · ${it.sub}` : ''}`)}">${time12(it.time || s.start)} · ${esc(it.short)}</span>`;
      if (date < today) return '';
      return `<span class="chip-b is-open" data-slot="${s.id}" title="${esc(`${s.name} (${s.time}): open. Click to enquire on WhatsApp`)}">${time12(s.start)} · Open</span>`;
    }).join('');
  }

  /**
   * Render a month grid into `el`.
   * opts: { year, month (0-11), map, selected, onSelect(date) }
   */
  function renderMonth(el, { year, month, map, selected, onSelect }) {
    const today = todayIST();
    const first = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // Monday = 0
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const prevDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    let html = dow.map((d, i) => `<span class="cal__dow${i >= 5 ? ' is-we' : ''}">${d}</span>`).join('');
    for (let i = first - 1; i >= 0; i--) html += `<span class="cal__day is-other"><span class="cal__n">${prevDays - i}</span></span>`;
    for (let d = 1; d <= days; d++) {
      const date = ymd(year, month, d);
      const items = map.get(date) || [];
      const h = slotsTaken(items);
      const taken = SLOT_IDS.filter((id) => h[id]).length;
      const cls = ['cal__day', date === today && 'is-today', date < today && 'is-past', date === selected && 'is-sel', taken && 'has-items', taken === 3 && 'is-full', (first + d - 1) % 7 >= 5 && 'is-we'].filter(Boolean).join(' ');
      const status = taken === 3 ? 'fully booked' : taken ? `${taken} of 3 slots booked` : 'all slots open';
      html += `<button type="button" class="${cls}" data-date="${date}" aria-label="${esc(`${d} ${new Date(Date.UTC(year, month, d)).toLocaleString('en-IN', { month: 'long', timeZone: 'UTC' })}: ${status}`)}" aria-pressed="${date === selected}">
        <span class="cal__n">${d}</span>
        <span class="cal__chips">${dayChips(date, items, today)}</span>
      </button>`;
    }
    const trailing = (7 - ((first + days) % 7)) % 7;
    for (let d = 1; d <= trailing; d++) html += `<span class="cal__day is-other"><span class="cal__n">${d}</span></span>`;
    el.innerHTML = html;
    el.onclick = (e) => { const b = e.target.closest('button.cal__day'); if (b) onSelect?.(b.dataset.date); };
  }

  /** Month totals: full days blocked, single slots blocked (outside full days), open slots from today on. */
  function monthStats(year, month, map) {
    const today = todayIST();
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    let fullDays = 0; let slots = 0; let open = 0;
    for (let d = 1; d <= days; d++) {
      const date = ymd(year, month, d);
      const items = map.get(date) || [];
      const h = slotsTaken(items);
      const taken = SLOT_IDS.filter((id) => h[id]).length;
      if (items.some((it) => it.slot === 'full')) fullDays += 1; else slots += taken;
      if (date >= today) open += 3 - taken;
    }
    return { fullDays, slots, open };
  }
  const statsHtml = (st) => `
    <div class="cal-stat is-red"><small>Full days blocked</small><b>${st.fullDays}</b></div>
    <div class="cal-stat is-red"><small>Slots blocked</small><b>${st.slots}</b><em>on other days</em></div>
    <div class="cal-stat is-green"><small>Open slots</small><b>${st.open}</b><em>from today</em></div>`;

  const monthLabel = (y, m) => new Date(Date.UTC(y, m, 1)).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const dayLabel = (date) => new Date(`${date}T12:00:00Z`).toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  const LEGEND = `<span><i class="c-open"></i>Open slot</span><span><i class="c-blocked"></i>Blocked / booked</span><span><i class="c-today"></i>Today</span>`;

  window.BailsCal = { CATS, SLOTS, SLOT_IDS, SLOT_NAMES, SLOT_SHORT, PARTS, buildDayMap, slotsTaken, renderMonth, monthStats, statsHtml, shortTournament, monthLabel, dayLabel, todayIST, time12, matchSlot, esc, LEGEND };
})();
