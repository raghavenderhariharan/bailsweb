/* BAIL'S Cricket Ground: front-end */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TZ = 'Asia/Kolkata';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Event times are stored as IST wall-clock "YYYY-MM-DDTHH:mm"
  const istDate = (s) => new Date(`${s.length === 10 ? s + 'T00:00' : s}:00+05:30`);
  const fmt = (d, o) => new Intl.DateTimeFormat('en-IN', { timeZone: TZ, ...o }).format(d);
  const endOfDay = (s) => istDate(`${s}T23:59`);

  $('#year').textContent = new Date().getFullYear();

  // ------------------------------------------------------------ nav
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('is-solid', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const toggle = $('#navToggle');
  const links = $('#navLinks');
  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('is-open');
    nav.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', open);
  });
  links.addEventListener('click', (e) => {
    if (e.target.closest('a')) { links.classList.remove('is-open'); nav.classList.remove('menu-open'); toggle.setAttribute('aria-expanded', 'false'); }
  });
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) $$('.nav__links a').forEach((a) => a.classList.toggle('is-current', a.getAttribute('href') === `#${en.target.id}`));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('main section[id]').forEach((s) => spy.observe(s));

  // ------------------------------------------------------------ hero slider
  const slides = $$('.hero__slide');
  const dots = $('#heroDots');
  let slideIdx = 0;
  let slideTimer;
  slides.forEach((_, i) => {
    const b = document.createElement('button');
    b.setAttribute('aria-label', `Show photo ${i + 1}`);
    b.addEventListener('click', () => { go(i); restart(); });
    dots.appendChild(b);
  });
  function go(i) {
    slides[slideIdx].classList.remove('is-active');
    dots.children[slideIdx].classList.remove('is-active');
    slideIdx = (i + slides.length) % slides.length;
    const s = slides[slideIdx];
    s.classList.remove('is-active'); void s.offsetWidth; // restart animation
    s.classList.add('is-active');
    dots.children[slideIdx].classList.add('is-active');
  }
  function restart() { clearInterval(slideTimer); if (!reduceMotion) slideTimer = setInterval(() => go(slideIdx + 1), 7000); }
  dots.children[0].classList.add('is-active');
  restart();

  // ------------------------------------------------------------ reveal + parallax
  const rev = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); rev.unobserve(en.target); } });
  }, { threshold: 0.12 });
  const observeReveals = () => $$('.reveal:not(.is-in)').forEach((el) => rev.observe(el));
  observeReveals();

  const pano = $('.panorama__img');
  if (pano && !reduceMotion) {
    const par = () => {
      const r = pano.parentElement.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      const p = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
      pano.style.transform = `translate3d(0, ${p * -60}px, 0)`;
    };
    addEventListener('scroll', par, { passive: true });
    par();
  }

  // ------------------------------------------------------------ lightbox
  const lb = $('#lightbox');
  let lbItems = [];
  let lbIdx = 0;
  let lastFocus = null;
  function openLightbox(items, i) {
    lbItems = items; lbIdx = i; lastFocus = document.activeElement;
    lb.hidden = false; document.body.style.overflow = 'hidden';
    renderLb(); $('#lbClose').focus();
  }
  function closeLightbox() {
    lb.hidden = true; document.body.style.overflow = ''; $('#lbMedia').innerHTML = '';
    lastFocus?.focus();
  }
  function renderLb() {
    const it = lbItems[lbIdx];
    const m = $('#lbMedia');
    if (it.kind === 'video') m.innerHTML = `<video src="${esc(it.src)}" controls autoplay playsinline></video>`;
    else m.innerHTML = `<img src="${esc(it.src)}" alt="${esc(it.caption || '')}">`;
    $('#lbCaption').textContent = it.caption || '';
    $('#lbPrev').hidden = $('#lbNext').hidden = lbItems.length < 2;
  }
  $('#lbClose').addEventListener('click', closeLightbox);
  $('#lbPrev').addEventListener('click', () => { lbIdx = (lbIdx - 1 + lbItems.length) % lbItems.length; renderLb(); });
  $('#lbNext').addEventListener('click', () => { lbIdx = (lbIdx + 1) % lbItems.length; renderLb(); });
  lb.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });
  addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') $('#lbPrev').click();
    if (e.key === 'ArrowRight') $('#lbNext').click();
  });
  $$('.ground__collage figure').forEach((f, i, all) => {
    f.tabIndex = 0;
    const items = all.map((x) => { const img = $('img', x); return { kind: 'image', src: img.dataset.full, caption: img.alt }; });
    const open = () => openLightbox(items, i);
    f.addEventListener('click', open);
    f.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  });

  // ------------------------------------------------------------ data
  fetch('/api/public')
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((data) => {
      siteData = data;
      applySettings(data.settings || {});
      renderEvents(data.events || [], data.bookings || [], Boolean(data.isAdmin));
      setupHonours(data.honours || []);
      renderGallery(data.media || []);
      renderInstagram(data.instagram || []);
      observeReveals();
    })
    .catch((err) => console.error('Could not load site data', err));

  // ------------------------------------------------------------ settings
  function applySettings(s) {
    const wa = s.whatsapp ? `https://wa.me/${s.whatsapp}?text=${encodeURIComponent("Hi BAIL'S Cricket Ground! I'd like to enquire about booking the ground.")}` : null;
    if (s.gwSportsUrl) {
      $$('[data-gw]').forEach((a) => { a.href = s.gwSportsUrl; a.hidden = false; });
      $$('[data-gw-item]').forEach((el) => { el.hidden = false; });
    }
    if (wa) $$('[data-wa]').forEach((a) => { a.href = wa; a.target = '_blank'; a.rel = 'noopener'; });
    const phones = [s.phone1, s.phone2].filter(Boolean);
    if (!phones.length) {
      $('#phones').textContent = 'TBD';
      const first = parseContacts(s.contacts)[0];
      if (first) $$('[data-tel]').forEach((a) => { a.href = `tel:${first.tel}`; });
    }
    if (phones.length) {
      const tel = (p) => `tel:${p.replace(/[^\d+]/g, '')}`;
      $('#phones').innerHTML = phones.map((p) => `<a href="${esc(tel(p))}">${esc(p)}</a>`).join(' · ');
      $$('[data-tel]').forEach((a) => { a.href = tel(phones[0]); });
    }
    const contacts = parseContacts(s.contacts);
    if (contacts.length) {
      const link = (c) => `<a href="tel:${esc(c.tel)}">${esc(c.name ? `${c.name} · ${c.num}` : c.num)}</a>`;
      $('#contacts').innerHTML = contacts.map(link).join(' ');
      $('#contactsItem').hidden = false;
      $('#footerContacts').innerHTML = `Contact: ${contacts.map((c) => `<a href="tel:${esc(c.tel)}">${esc(c.name || c.num)}</a>`).join(' · ')}`;
    }
    if (s.announcement) { $('#announceText').textContent = s.announcement; $('#announce').hidden = false; }
    if (s.bookingNote) $('#bookingNote').textContent = s.bookingNote;
    if (s.instagramUrl) { $('#instaBtn').href = s.instagramUrl; $('[data-social=instagram]').href = s.instagramUrl; }
    const extra = [
      ['facebookUrl', 'btn--fb', 'i-fb', 'Facebook'],
      ['youtubeUrl', 'btn--yt', 'i-yt', 'YouTube'],
    ];
    extra.forEach(([key, cls, icon, label]) => {
      if (!s[key]) return;
      $('#socialLinks').insertAdjacentHTML('beforeend', `<a class="btn ${cls}" href="${esc(s[key])}" target="_blank" rel="noopener"><svg><use href="#${icon}"/></svg>${label}</a>`);
      $('#footerSocial').insertAdjacentHTML('beforeend', `<a href="${esc(s[key])}" target="_blank" rel="noopener" aria-label="${label}"><svg><use href="#${icon}"/></svg></a>`);
    });
  }

  // "Raghu - 9908076230" per line -> [{ name, num, tel }]
  function parseContacts(text) {
    return String(text || '').split('\n').map((line) => {
      const m = line.match(/^\s*(.*?)[\s:–-]*(\+?[\d][\d\s-]{8,15}\d)\s*$/);
      if (!m) return null;
      const digits = m[2].replace(/[^\d+]/g, '');
      const tel = /^\d{10}$/.test(digits) ? `+91${digits}` : digits;
      const num = /^\d{10}$/.test(digits) ? `${digits.slice(0, 5)} ${digits.slice(5)}` : m[2].trim();
      return { name: m[1].trim(), num, tel };
    }).filter(Boolean);
  }

  // ------------------------------------------------------------ events
  function eventStatus(ev, now) {
    const start = istDate(ev.start);
    const end = ev.end ? endOfDay(ev.end) : new Date(start.getTime() + (ev.kind === 'match' ? 4 : 10) * 3600e3);
    if (now < start) return 'upcoming';
    if (now <= end) return 'live';
    return 'past';
  }

  // Turn "Raghu 99080 76230 · Aravind 97048 72506" into WhatsApp chat links
  function contactHtml(text, title) {
    const msg = encodeURIComponent(`Hi! I'd like to register a team for ${title || "the tournament"} at BAIL'S Cricket Ground.`);
    return esc(text).replace(/(\+?\d[\d\s-]{8,14}\d)/g, (num) => {
      const digits = num.replace(/\D/g, '');
      const wa = digits.length === 10 ? `91${digits}` : digits;
      return `<a href="https://wa.me/${wa}?text=${msg}" target="_blank" rel="noopener" title="WhatsApp ${num}">${num}</a>`;
    });
  }

  const posters = ['/assets/img/hills-match.jpg', '/assets/img/outfield-lush.jpg', '/assets/img/trophies-golden.jpg', '/assets/img/pavilion-team.jpg'];
  function tourneyDate(t) {
    const start = istDate(t.start);
    const range = t.end && t.end !== t.start.slice(0, 10);
    const when = range
      ? `${fmt(start, { day: 'numeric', month: 'short' })} – ${fmt(endOfDay(t.end), { day: 'numeric', month: 'short', year: 'numeric' })}`
      : fmt(start, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    if (t.tentative) return `${range ? 'Tentative dates' : 'Tentative start'}: ${when}`;
    return range || t.end ? when : `Starts ${when}`;
  }

  function tourneyCard(t, i, matches, now) {
    let tag = { upcoming: t.kind === 'event' ? 'Upcoming event' : 'Upcoming', live: 'On now', past: 'Completed' }[t.status];
    if (t.tentative && t.status === 'upcoming') tag += ' · Dates tentative';
    const count = matches.filter((m) => m.tournament && m.tournament === t.tournament && eventStatus(m, now) !== 'past').length;
    const meta = `
          <span><svg><use href="#i-cal"/></svg>${esc(tourneyDate(t))}</span>
          ${t.format ? `<span><svg><use href="#i-ball"/></svg>${esc(t.format)}</span>` : ''}
          ${t.round ? `<span><svg><use href="#i-trophy"/></svg>${esc(t.round)}</span>` : ''}
          ${count ? `<span><svg><use href="#i-pitch"/></svg>${count} fixture${count > 1 ? 's' : ''} at Bails</span>` : ''}`;
    const link = t.link ? `<a class="tourney__link" href="${esc(t.link)}" target="_blank" rel="noopener">Details &amp; live scores<svg><use href="#i-arrow"/></svg></a>` : '';
    const tagHtml = `<span class="tourney__tag ${t.status === 'live' ? 'is-live' : t.status === 'past' ? 'is-past' : ''}">${tag}</span>`;

    // Spotlight layout: a tournament with a flyer or bracket gets a full-width card
    if ((t.flyer || t.bracket) && t.status !== 'past') {
      const flyers = [t.flyer && { src: t.flyer, caption: `${t.title}: poster` }, t.bracket && { src: t.bracket, caption: `${t.title}: bracket and playoffs` }].filter(Boolean);
      const highlights = (t.highlights || '').split('\n').map((x) => x.trim()).filter(Boolean);
      return `<article class="tourney tourney--spot reveal" data-t="${i}">
        <div class="tourney__bg" style="background-image:url('${esc(t.poster || posters[i % posters.length])}')"></div>
        <div class="spot__body">
          ${tagHtml}
          <h3>${esc(t.title)}</h3>
          <div class="tourney__meta">${meta}</div>
          ${t.description ? `<p>${esc(t.description)}</p>` : ''}
          ${highlights.length ? `<ul class="spot__list">${highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
          <div class="spot__facts">
            ${t.fee ? `<div><small>Entry fee</small><b>${esc(t.fee)}</b></div>` : ''}
            ${t.contact ? `<div><small>Registrations</small><b>${contactHtml(t.contact, t.title.replace(/\s*·\s*/g, ' '))}</b></div>` : ''}
          </div>
          ${link}
        </div>
        <div class="spot__flyers">
          ${flyers.map((f, j) => `<button class="spot__flyer" type="button" data-flyer="${j}" aria-label="View ${esc(f.caption)}"><img src="${esc(f.src.startsWith('/assets/') ? f.src.replace(/\.jpg$/, '-sm.jpg') : f.src)}" alt="${esc(f.caption)}" loading="lazy"><span>${j === 0 ? 'Poster' : 'Bracket'}</span></button>`).join('')}
        </div>
      </article>`;
    }
    return `<article class="tourney reveal">
        <div class="tourney__bg" style="background-image:url('${esc(t.poster || posters[i % posters.length])}')"></div>
        ${tagHtml}
        <h3>${esc(t.title)}</h3>
        <div class="tourney__meta">${meta}</div>
        ${t.description ? `<p>${esc(t.description)}</p>` : ''}
        ${t.fee ? `<p class="tourney__fee">${esc(t.fee)}</p>` : ''}
        ${link}
      </article>`;
  }

  let fixtureFilter = 'all';
  let showPast = false;
  let countdownTimer = null;
  let siteData = null;

  function renderEvents(events, bookings, isAdmin) {
    const now = new Date();
    const tourneys = events.filter((e) => e.kind !== 'match');
    const matches = events.filter((e) => e.kind === 'match');

    // Tournament / event cards: upcoming + live first, then the 2 most recent past
    const withStatus = tourneys.map((t) => ({ ...t, status: eventStatus(t, now) }));
    const active = withStatus.filter((t) => t.status !== 'past');
    const past = withStatus.filter((t) => t.status === 'past').slice(-2).reverse();
    const isSpot = (t) => (t.flyer || t.bracket) && t.status !== 'past';
    const cards = [...active.filter(isSpot), ...active.filter((t) => !isSpot(t)), ...past];
    const tEl = $('#tourneys');
    tEl.innerHTML = cards.map((t, i) => tourneyCard(t, i, matches, now)).join('');
    const plain = $$('.tourney:not(.tourney--spot)', tEl);
    if (plain.length === 1) plain[0].classList.add('tourney--wide');
    tEl.onclick = (e) => {
      const f = e.target.closest('[data-flyer]'); if (!f) return;
      const t = cards[+f.closest('[data-t]').dataset.t];
      const items = [t.flyer && { kind: 'image', src: t.flyer, caption: `${t.title}: poster` }, t.bracket && { kind: 'image', src: t.bracket, caption: `${t.title}: bracket and playoffs` }].filter(Boolean);
      openLightbox(items, +f.dataset.flyer);
    };

    // Fixtures
    const names = [...new Set(matches.map((m) => m.tournament).filter(Boolean))];
    if (fixtureFilter !== 'all' && !names.includes(fixtureFilter)) fixtureFilter = 'all';
    const filters = $('#fixtureFilters');
    const shortName = (n) => n.replace(/,?\s*Season[-\s]*/i, ' S').replace(/Championship/i, 'Champ.');
    filters.innerHTML = names.length < 2 ? '' : [['all', 'All'], ...names.map((n) => [n, shortName(n)])].map(([k, l]) => `<button class="chip ${k === fixtureFilter ? 'is-active' : ''}" data-f="${esc(k)}" role="tab" aria-selected="${k === fixtureFilter}" title="${esc(k === 'all' ? 'All fixtures' : k)}">${esc(l)}</button>`).join('');
    filters.onclick = (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      fixtureFilter = b.dataset.f;
      $$('.chip', filters).forEach((c) => { c.classList.toggle('is-active', c === b); c.setAttribute('aria-selected', c === b); });
      draw();
    };
    const pastBtn = $('#showPast');
    pastBtn.textContent = showPast ? 'Hide past fixtures' : 'Show past fixtures';
    pastBtn.onclick = () => { showPast = !showPast; pastBtn.textContent = showPast ? 'Hide past fixtures' : 'Show past fixtures'; draw(); };

    $('#adminBar').hidden = !isAdmin;
    const nextMatch = matches.find((m) => eventStatus(m, now) !== 'past');
    function draw() {
      const list = matches.filter((m) => fixtureFilter === 'all' || m.tournament === fixtureFilter);
      const pastCount = list.filter((m) => eventStatus(m, now) === 'past').length;
      pastBtn.hidden = pastCount === 0;
      const visible = list.filter((m) => showPast || eventStatus(m, now) !== 'past');
      $('#fixturesEmpty').hidden = visible.length > 0;
      $('#fixtureList').innerHTML = visible.map((m) => {
        const d = istDate(m.start);
        const st = eventStatus(m, now);
        const teams = m.teamA && m.teamB
          ? `${esc(m.teamA)}<span class="vs">vs</span>${esc(m.teamB)}`
          : esc(m.title);
        return `<li class="fixture ${m === nextMatch ? 'is-next' : ''} ${st === 'past' ? 'is-past' : ''}">
          <div class="fixture__date"><small>${esc(fmt(d, { weekday: 'short' }))}</small><b>${esc(fmt(d, { day: '2-digit' }))}</b><small>${esc(fmt(d, { month: 'short', year: '2-digit' }))}</small></div>
          <div><div class="fixture__teams">${teams}</div><div class="fixture__sub">${esc([m.tournament, m.round, m.format].filter(Boolean).join(' · '))}</div></div>
          <div class="fixture__time">${st === 'live' ? '<span style="color:#ff6b6b">● Live</span>' : esc(fmt(d, { hour: 'numeric', minute: '2-digit', hour12: true }))}<small>${m === nextMatch ? 'Next up' : 'IST'}</small></div>
          ${isAdmin ? `<button class="fixture__del" type="button" data-del="${esc(m.id)}" aria-label="Delete fixture ${esc(m.title)}" title="Delete fixture"><svg><use href="#i-close"/></svg></button>` : ''}
        </li>`;
      }).join('');
    }
    draw();
    $('#fixtureList').onclick = async (e) => {
      const del = e.target.closest('[data-del]'); if (!del) return;
      const m = matches.find((x) => x.id === del.dataset.del);
      if (!m || !confirm(`Delete the fixture "${m.title}"? This cannot be undone.`)) return;
      del.disabled = true;
      try {
        const r = await fetch(`/api/events/${encodeURIComponent(m.id)}`, { method: 'DELETE', credentials: 'same-origin' });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Delete failed (${r.status})`);
        await reload();
      } catch (err) { alert(err.message); del.disabled = false; }
    };

    // Hero "next at Bails" + countdown
    clearInterval(countdownTimer);
    const next = [...matches, ...tourneys].filter((e) => istDate(e.start) > now).sort((a, b) => a.start.localeCompare(b.start))[0];
    $('#heroNext').hidden = !next;
    if (next) {
      $('#heroNextTitle').textContent = next.teamA && next.teamB ? `${next.teamA} vs ${next.teamB}` : next.title;
      $('#heroNextWhen').textContent = next.tentative
        ? `${fmt(istDate(next.start), { weekday: 'short', day: 'numeric', month: 'short' })} (tentative)`
        : `${fmt(istDate(next.start), { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })} IST`;
      $('#heroNext').title = [next.tournament, next.round].filter(Boolean).join(' · ');
      const target = istDate(next.start).getTime();
      const cd = $('#heroCountdown');
      const tick = () => {
        let s = Math.max(0, Math.floor((target - Date.now()) / 1000));
        const d = Math.floor(s / 86400); s %= 86400;
        const h = Math.floor(s / 3600); s %= 3600;
        const m = Math.floor(s / 60); s %= 60;
        cd.innerHTML = [[d, 'days'], [h, 'hrs'], [m, 'min'], [s, 'sec']].map(([v, l]) => `<span>${String(v).padStart(2, '0')}<small>${l}</small></span>`).join('');
      };
      tick(); countdownTimer = setInterval(tick, 1000);
    }

    renderCalendar(events, bookings, isAdmin);
  }

  // ------------------------------------------------------------ ground calendar
  const cal = { y: 0, m: 0, selected: null, map: new Map(), isAdmin: false };
  {
    const [y, m] = BailsCal.todayIST().split('-').map(Number);
    cal.y = y; cal.m = m - 1;
  }
  function renderCalendar(events, bookings, isAdmin) {
    cal.map = BailsCal.buildDayMap(events, bookings);
    cal.isAdmin = isAdmin;
    $('#calLegend').innerHTML = BailsCal.LEGEND;
    $('#calPrev').onclick = () => { cal.m -= 1; if (cal.m < 0) { cal.m = 11; cal.y -= 1; } drawMonth(); };
    $('#calNext').onclick = () => { cal.m += 1; if (cal.m > 11) { cal.m = 0; cal.y += 1; } drawMonth(); };
    drawMonth();
    renderWeek();
  }

  // ------------------------------------------------------------ open slots, next 7 days
  function renderWeek() {
    const today = BailsCal.todayIST();
    const nowHM = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(`${today}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      days.push(d.toISOString().slice(0, 10));
    }
    const html = days.map((date, i) => {
      const taken = BailsCal.slotsTaken(cal.map.get(date) || []);
      // today: slots that have already started can't be booked
      const open = BailsCal.SLOTS.filter((s) => !taken[s.id] && !(i === 0 && s.start <= nowHM));
      const dt = new Date(`${date}T12:00:00Z`);
      const wd = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dt.toLocaleString('en-IN', { weekday: 'short', timeZone: 'UTC' });
      const dm = dt.toLocaleString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
      return `<div class="wday ${open.length ? '' : 'is-full'}">
        <div class="wday__date"><b>${esc(wd)}</b><span>${esc(dm)}</span></div>
        <div class="wday__slots">
          ${open.length
            ? open.map((s) => `<button type="button" class="wslot" data-date="${date}" data-slot="${s.id}" title="${esc(`${s.name}, ${s.time}`)}"><span>${esc(BailsCal.time12(s.start))}</span><small>${esc(s.name)}</small></button>`).join('')
            : `<span class="wday__none">${i === 0 && BailsCal.SLOTS.some((s) => !taken[s.id]) ? 'No more slots today' : 'Fully booked'}</span>`}
        </div>
      </div>`;
    }).join('');
    $('#weekDays').innerHTML = html;
    $('#openSlots').hidden = false;
    $('#weekDays').onclick = (e) => {
      const b = e.target.closest('.wslot'); if (!b) return;
      const [y, m] = b.dataset.date.split('-').map(Number);
      if (cal.isAdmin || !siteData?.settings?.whatsapp) {
        // admins (or no WhatsApp number): jump to that day on the calendar
        cal.y = y; cal.m = m - 1; cal.selected = b.dataset.date; drawMonth();
        $('#calendar').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      openEnquiry(b.dataset.date, [b.dataset.slot]);
    };
  }
  function drawMonth() {
    const today = BailsCal.todayIST();
    const [ty, tm] = today.split('-').map(Number);
    $('#calPrev').disabled = cal.y * 12 + cal.m <= ty * 12 + tm - 1 - 2; // up to 2 months back
    $('#calMonth').textContent = BailsCal.monthLabel(cal.y, cal.m);
    const inMonth = (d) => d && d.startsWith(`${cal.y}-${String(cal.m + 1).padStart(2, '0')}`);
    if (!inMonth(cal.selected)) {
      // pick today if it's in view, else the first day with something on, else the 1st
      const first = [...cal.map.keys()].filter(inMonth).sort()[0];
      cal.selected = inMonth(today) ? today : first || `${cal.y}-${String(cal.m + 1).padStart(2, '0')}-01`;
    }
    BailsCal.renderMonth($('#calGrid'), { year: cal.y, month: cal.m, map: cal.map, selected: cal.selected, onSelect: (d) => { cal.selected = d; drawMonth(); } });
    // Clicking an open slot, or a day that still has open slots, opens WhatsApp with an enquiry.
    // Fully booked and past days just show their details below the calendar.
    const grid = $('#calGrid');
    const selectOnly = grid.onclick;
    grid.onclick = (e) => {
      const day = e.target.closest('button.cal__day');
      if (!day) return;
      const date = day.dataset.date;
      const chip = e.target.closest('.chip-b.is-open');
      const taken = BailsCal.slotsTaken(cal.map.get(date) || []);
      const anyOpen = BailsCal.SLOTS.some((s) => !taken[s.id]);
      selectOnly(e);
      if (date >= BailsCal.todayIST() && !cal.isAdmin && anyOpen && siteData?.settings?.whatsapp) {
        openEnquiry(date, chip ? [chip.dataset.slot] : null);
      }
    };
    $('#calStats').innerHTML = BailsCal.statsHtml(BailsCal.monthStats(cal.y, cal.m, cal.map));
    drawDay();
  }
  // ---- booking enquiry dialog
  const enq = { date: null, taken: {} };
  function openEnquiry(date, preselect) {
    enq.date = date;
    enq.taken = BailsCal.slotsTaken(cal.map.get(date) || []);
    const open = BailsCal.SLOTS.filter((s) => !enq.taken[s.id]);
    const pre = new Set(preselect || open.map((s) => s.id));
    const fullOpen = open.length === BailsCal.SLOTS.length;
    $('#enqTitle').textContent = BailsCal.dayLabel(date);
    $('#enqOptions').innerHTML = `
      <label class="enq__opt enq__opt--full ${fullOpen ? '' : 'is-taken'}">
        <input type="checkbox" value="full" ${fullOpen ? '' : 'disabled'} ${fullOpen && !preselect ? 'checked' : ''}>
        <span><b>Full day</b><small>7:00 AM – 6:00 PM · all three slots</small></span>
        <em>${fullOpen ? 'Open' : 'Not available'}</em>
      </label>
      ${BailsCal.SLOTS.map((s) => {
        const it = enq.taken[s.id];
        return `<label class="enq__opt ${it ? 'is-taken' : ''}">
          <input type="checkbox" value="${s.id}" ${it ? 'disabled' : ''} ${!it && pre.has(s.id) ? 'checked' : ''}>
          <span><b>${s.name}</b><small>${s.time}</small></span>
          <em>${it ? 'Booked' : 'Open'}</em>
        </label>`;
      }).join('')}`;
    syncFull();
    updateEnquiry();
    $('#enquiryDialog').showModal();
  }
  function enqBoxes() { return $$('#enqOptions input'); }
  function syncFull(changed) {
    const boxes = enqBoxes();
    const full = boxes.find((b) => b.value === 'full');
    const slots = boxes.filter((b) => b.value !== 'full' && !b.disabled);
    if (full.disabled) return;
    if (changed === full) slots.forEach((b) => { b.checked = full.checked; });
    else full.checked = slots.length === BailsCal.SLOTS.length && slots.every((b) => b.checked);
  }
  function enquiryText() {
    const boxes = enqBoxes();
    const full = boxes.find((b) => b.value === 'full');
    const picked = BailsCal.SLOTS.filter((s) => boxes.find((b) => b.value === s.id)?.checked);
    if (!picked.length) return null;
    const what = full.checked ? 'the full day (7:00 AM – 6:00 PM)' : picked.map((s) => `${s.name} (${s.time})`).join(', ');
    return `Hi BAIL'S Cricket Ground! I am enquiring for ${BailsCal.dayLabel(enq.date)}, ${what}. Is it available to book?`;
  }
  function updateEnquiry() {
    const msg = enquiryText();
    const go = $('#enqGo');
    $('#enqMsg').textContent = msg || 'Pick at least one slot.';
    $('#enqErr').textContent = '';
    go.classList.toggle('is-disabled', !msg);
    go.href = msg ? `https://wa.me/${siteData.settings.whatsapp}?text=${encodeURIComponent(msg)}` : '#';
  }
  $('#enqOptions').addEventListener('change', (e) => { syncFull(e.target); updateEnquiry(); });
  $('#enqGo').addEventListener('click', (e) => {
    if (!enquiryText()) { e.preventDefault(); $('#enqErr').textContent = 'Pick at least one slot first.'; return; }
    setTimeout(() => $('#enquiryDialog').close(), 100);
  });
  $('#enquiryDialog').addEventListener('click', (e) => { if (e.target.id === 'enquiryDialog') e.target.close(); });

  /** WhatsApp link: "I am enquiring for <date>, <slot(s)>" */
  function enquiryUrl(date, slots) {
    const wa = siteData?.settings?.whatsapp;
    if (!wa || !slots.length) return null;
    const slotText = slots.length === 1
      ? `${slots[0].name} (${slots[0].time})`
      : `any of these open slots: ${slots.map((s) => `${s.name} (${s.time})`).join(', ')}`;
    const msg = `Hi BAIL'S Cricket Ground! I am enquiring for ${BailsCal.dayLabel(date)}, ${slotText}. Is it available to book?`;
    return `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
  }

  function drawDay() {
    const date = cal.selected;
    const items = cal.map.get(date) || [];
    const h = BailsCal.slotsTaken(items);
    const isPast = date < BailsCal.todayIST();
    const row = (it) => `<li class="cal__item">
        <i class="${BailsCal.CATS[it.cat]?.cls || 'c-book'}"></i>
        <div><b>${esc(it.label)}</b><small>${esc([it.kind === 'fixture' ? BailsCal.SLOT_SHORT[it.slot] : BailsCal.SLOT_NAMES[it.slot], it.time && BailsCal.time12(it.time), it.sub].filter(Boolean).join(' · '))}</small></div>
      </li>`;
    const open = BailsCal.SLOTS.filter((s) => !h[s.id]);
    const ask = () => enquiryUrl(date, BailsCal.SLOTS.filter((s) => !h[s.id])) || '#visit';
    $('#calDetail').innerHTML = `
      <h4>${esc(BailsCal.dayLabel(date))}</h4>
      ${items.length ? `<ul class="cal__items">${items.map(row).join('')}</ul>` : `<p class="cal__none">Nothing booked yet.</p>`}
      ${!isPast && open.length ? `<div class="cal__open">
          <p><span class="cal__dot"></span>${open.length === 3 ? 'All three slots are open' : `${open.length} slot${open.length > 1 ? 's' : ''} open`}</p>
          <ul class="cal__slots">${BailsCal.SLOTS.map((s) => `<li class="${h[s.id] ? 'is-taken' : ''}"><b>${s.name}</b><span>${s.time}</span><em>${h[s.id] ? 'Booked' : 'Open'}</em></li>`).join('')}</ul>
          <div class="cal__book">
            <a class="btn btn--gold btn--sm" href="${esc(ask(open.length === 1 ? `${open[0].name} (${open[0].time})` : `a slot (${open.map((s) => s.name).join(', ')} open)`))}" target="_blank" rel="noopener"><svg><use href="#i-whatsapp"/></svg>Book on WhatsApp</a>
            ${siteData?.settings?.gwSportsUrl ? `<a class="btn btn--ghost btn--sm" href="${esc(siteData.settings.gwSportsUrl)}" target="_blank" rel="noopener"><svg><use href="#i-cal"/></svg>GW Sports</a>` : ''}
          </div>
        </div>` : ''}
      ${!isPast && !open.length ? '<p class="cal__full">Fully booked</p>' : ''}
      ${cal.isAdmin ? `<a class="cal__admin" href="/admin?date=${esc(date)}#calendar">Manage this day in the admin panel →</a>` : ''}`;
  }

  // ------------------------------------------------------------ admin: quick-add fixture on the site
  const fDialog = $('#fixtureDialog');
  const fForm = $('#fixtureForm');
  $('#addFixtureBtn').addEventListener('click', () => {
    fForm.reset();
    $('#fixtureError').textContent = '';
    const names = [...new Set((siteData?.events || []).map((e) => e.tournament).filter(Boolean))];
    $('#fdTournaments').innerHTML = names.map((n) => `<option value="${esc(n)}">`).join('');
    fForm.start.value = `${cal.selected && cal.selected >= BailsCal.todayIST() ? cal.selected : BailsCal.todayIST()}T07:00`;
    fDialog.showModal();
    fForm.teamA.focus();
  });
  $('#fixtureCancel').addEventListener('click', () => fDialog.close());
  fForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(fForm));
    Object.keys(v).forEach((k) => { v[k] = String(v[k]).trim(); });
    const body = { ...v, kind: 'match', title: `${v.teamA} vs ${v.teamB}` };
    const btn = $('button[type=submit]', fForm);
    btn.disabled = true;
    try {
      const r = await fetch('/api/events', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Could not add the fixture (${r.status})`);
      fDialog.close();
      await reload();
    } catch (err) { $('#fixtureError').textContent = err.message; }
    btn.disabled = false;
  });

  async function reload() {
    const r = await fetch('/api/public', { credentials: 'same-origin' });
    siteData = await r.json();
    renderEvents(siteData.events || [], siteData.bookings || [], siteData.isAdmin);
    observeReveals();
  }

  // ------------------------------------------------------------ honour board
  function setupHonours(honours) {
    let board = 'century';
    const search = $('#honourSearch');
    const year = $('#honourYear');
    $('#countCentury').textContent = honours.filter((h) => h.type === 'century').length;
    $('#countFivefor').textContent = honours.filter((h) => h.type === 'fivefor').length;
    const years = [...new Set(honours.map((h) => h.date.slice(0, 4)))].sort().reverse();
    year.insertAdjacentHTML('beforeend', years.map((y) => `<option value="${y}">${y}</option>`).join(''));

    $$('[data-board]').forEach((b) => b.addEventListener('click', () => {
      board = b.dataset.board;
      $$('[data-board]').forEach((x) => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-selected', x === b); });
      draw();
    }));
    const sortSel = $('#honourSort');
    const moreBtn = $('#boardMore');
    const PAGE = 15;
    let expanded = false;
    search.addEventListener('input', () => { expanded = false; draw(); });
    year.addEventListener('change', () => { expanded = false; draw(); });
    sortSel.addEventListener('change', draw);
    moreBtn.addEventListener('click', () => { expanded = !expanded; draw(); if (!expanded) $('#board').scrollIntoView({ block: 'start' }); });
    const better = (a, b) => (a.type === 'century'
      ? b.runs - a.runs || (a.balls || 999) - (b.balls || 999)
      : b.wickets - a.wickets || a.runsConceded - b.runsConceded);

    const figure = (h) => h.type === 'century'
      ? `${h.runs}${h.notOut ? '*' : ''}${h.balls ? ` <small>(${h.balls})</small>` : ''}`
      : `${h.wickets}/${h.runsConceded}${h.overs ? ` <small>(${h.overs} ov)</small>` : ''}`;
    const dateStr = (h) => fmt(istDate(h.date), { day: 'numeric', month: 'short', year: 'numeric' });

    let rows = [];
    function draw() {
      const q = search.value.trim().toLowerCase();
      rows = honours.filter((h) => h.type === board)
        .filter((h) => !year.value || h.date.startsWith(year.value))
        .filter((h) => !q || [h.player, h.team, h.versus, h.tournament].join(' ').toLowerCase().includes(q));
      if (sortSel.value === 'best') rows = [...rows].sort((a, b) => better(a, b) || b.date.localeCompare(a.date));
      const total = rows.length;
      if (!expanded && total > PAGE) rows = rows.slice(0, PAGE);
      moreBtn.hidden = total <= PAGE;
      moreBtn.textContent = expanded ? 'Show fewer' : `Show all ${total}`;
      $('#boardTitle').textContent = board === 'century' ? 'Centuries' : 'Five-Wicket Hauls';
      $('#boardHead').innerHTML = `<span>Player</span><span>${board === 'century' ? 'Runs (balls)' : 'Figures'}</span><span>For</span><span>Against</span><span>Date</span>`;
      $('#boardHead').hidden = rows.length === 0;
      $('#boardRows').innerHTML = rows.map((h, i) => `<li class="board-row" tabindex="0" data-i="${i}">
        <span class="board-row__player">${esc(h.player)}</span>
        <span class="board-row__fig">${figure(h)}</span>
        <span>${esc(h.team || '—')}</span>
        <span class="board-row__muted">${h.versus ? 'v ' + esc(h.versus) : '—'}</span>
        <span class="board-row__muted">${esc(dateStr(h))}</span>
      </li>`).join('');
      const totalOfType = honours.filter((h) => h.type === board).length;
      $('#boardEmpty').hidden = rows.length > 0;
      $('.board__empty-title').textContent = totalOfType === 0 ? 'This board awaits its first name' : 'No matching entries';
    }
    const open = (i) => {
      const h = rows[i]; if (!h) return;
      const isC = h.type === 'century';
      const extra = isC
        ? [['Balls', h.balls], ['Fours', h.fours], ['Sixes', h.sixes], ['Strike rate', h.balls ? (h.runs / h.balls * 100).toFixed(1) : '']]
        : [['Overs', h.overs], ['Runs conceded', h.runsConceded], ['Economy', h.overs ? (h.runsConceded / oversToBalls(h.overs) * 6).toFixed(2) : '']];
      const rowsHtml = [['Team', h.team], ['Against', h.versus], ['Tournament', h.tournament], ['Format', h.format], ['Date', dateStr(h)], ...extra, ['Notes', h.notes]]
        .filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
      $('#honourDetail').innerHTML = `<div class="hd">
        ${h.photo ? `<img class="hd__photo" src="${esc(h.photo)}" alt="${esc(h.player)}">` : ''}
        <div class="gold-text hd__fig">${isC ? `${h.runs}${h.notOut ? '*' : ''}` : `${h.wickets}/${h.runsConceded}`}</div>
        <div class="hd__name">${esc(h.player)}</div>
        <dl>${rowsHtml}</dl>
        ${h.link ? `<p style="margin-top:16px"><a href="${esc(h.link)}" target="_blank" rel="noopener">View scorecard →</a></p>` : ''}
      </div>`;
      $('#honourDialog').showModal();
    };
    $('#boardRows').addEventListener('click', (e) => { const r = e.target.closest('.board-row'); if (r) open(+r.dataset.i); });
    $('#boardRows').addEventListener('keydown', (e) => { const r = e.target.closest('.board-row'); if (r && e.key === 'Enter') open(+r.dataset.i); });
    draw();
  }
  function oversToBalls(o) { const [a, b = '0'] = String(o).split('.'); return +a * 6 + +b; }

  // ------------------------------------------------------------ gallery
  function renderGallery(media) {
    const videos = media.filter((m) => m.kind === 'video');
    const images = media.filter((m) => m.kind === 'image');
    if (videos.length) renderPlaylist(videos);
    $('#masonry').innerHTML = images.map((m, i) => `<button class="tile reveal" data-i="${i}" aria-label="Open photo: ${esc(m.caption || 'Gallery photo')}">
      <img src="${esc(m.thumb || m.src)}" alt="${esc(m.caption || '')}" loading="lazy">
      ${m.caption ? `<figcaption>${esc(m.caption)}</figcaption>` : ''}
    </button>`).join('');
    $('#masonry').addEventListener('click', (e) => { const t = e.target.closest('.tile'); if (t) openLightbox(images, +t.dataset.i); });
  }

  // Video playlist: a main player plus a column of video boxes; plays through in order
  function renderPlaylist(videos) {
    const box = $('#videos');
    box.hidden = false;
    const small = (v) => (v.thumb && v.thumb.startsWith('/assets/') ? v.thumb.replace(/\.jpg$/, '-sm.jpg') : v.thumb);
    box.innerHTML = `<div class="playlist reveal">
      <div class="playlist__stage">
        <video id="plVideo" controls playsinline preload="metadata"></video>
        <div class="playlist__now"><span class="playlist__badge">Now playing</span><b id="plTitle"></b><span id="plCount"></span></div>
      </div>
      <div class="playlist__list" role="list" aria-label="Videos">
        ${videos.map((v, i) => `<button class="pl-item" type="button" role="listitem" data-i="${i}" aria-label="Play video: ${esc(v.caption || `Video ${i + 1}`)}">
          <span class="pl-item__thumb">${v.thumb ? `<img src="${esc(small(v))}" alt="" loading="lazy">` : ''}<span class="pl-item__play"><svg><use href="#i-play"/></svg></span><span class="pl-item__dur" data-dur="${i}"></span></span>
          <span class="pl-item__txt"><small>Video ${i + 1}</small><b>${esc(v.caption || `Video ${i + 1}`)}</b></span>
        </button>`).join('')}
      </div>
    </div>`;
    const player = $('#plVideo');
    let cur = 0;
    const load = (i, play) => {
      cur = i;
      const v = videos[i];
      player.src = v.src;
      if (v.thumb) player.poster = v.thumb; else player.removeAttribute('poster');
      $('#plTitle').textContent = v.caption || `Video ${i + 1}`;
      $('#plCount').textContent = `${i + 1} / ${videos.length}`;
      $$('.pl-item', box).forEach((b, j) => { b.classList.toggle('is-active', j === i); b.setAttribute('aria-current', j === i ? 'true' : 'false'); });
      if (play) player.play().catch(() => {});
    };
    $('.playlist__list', box).onclick = (e) => { const b = e.target.closest('.pl-item'); if (b) load(+b.dataset.i, true); };
    player.onended = () => { if (cur < videos.length - 1) load(cur + 1, true); };
    load(0, false);
    // durations, read from each file's metadata
    videos.forEach((v, i) => {
      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.src = v.src;
      probe.onloadedmetadata = () => {
        const d = Math.round(probe.duration);
        if (Number.isFinite(d)) $(`[data-dur="${i}"]`, box).textContent = `${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')}`;
        probe.removeAttribute('src'); probe.load();
      };
    });
  }

  // ------------------------------------------------------------ instagram
  function renderInstagram(posts) {
    if (!posts.length) return;
    const box = $('#instaEmbeds');
    box.hidden = false;
    box.innerHTML = posts.map((p) => `<blockquote class="instagram-media" data-instgrm-permalink="${esc(p.url)}" data-instgrm-version="14"><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.caption || 'View this post on Instagram')}</a></blockquote>`).join('');
    const s = document.createElement('script');
    s.async = true; s.src = 'https://www.instagram.com/embed.js';
    document.body.appendChild(s);
  }
})();
