// Reads upcoming matches for a ground from its public CricHeroes page.
// The page embeds its data in Next.js "flight" chunks: self.__next_f.push([1,"..."]).

const UA = 'Mozilla/5.0 (compatible; BailsCricketGroundSite/1.0)';

export function groundUrl(groundId) {
  return `https://cricheroes.com/cricket-ground-detail/${groundId}/hyderabad-(telangana)/bails-cricket-ground`;
}

/** Pull every {"match_id": ...} object out of the page's embedded data. */
export function extractMatches(html) {
  let flight = '';
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  for (const m of html.matchAll(re)) {
    try { flight += JSON.parse(m[1]); } catch { /* skip a chunk we can't read */ }
  }
  const out = new Map();
  let i = flight.indexOf('{"match_id":');
  while (i !== -1) {
    const end = matchingBrace(flight, i);
    if (end === -1) break;
    try {
      const obj = JSON.parse(flight.slice(i, end + 1));
      if (obj.match_id && obj.match_start_time) out.set(obj.match_id, obj);
    } catch { /* not a full object */ }
    i = flight.indexOf('{"match_id":', i + 12);
  }
  return [...out.values()];
}

function matchingBrace(s, start) {
  let depth = 0; let inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}

/** "Elite Corporate League, Season-17" -> "Elite Corporate League Season 17" */
export function tidyTournament(name) {
  return String(name || '').replace(/,?\s*Season\s*-\s*/i, ' Season ').replace(/\s+-\s+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/** UTC ISO -> IST wall clock "YYYY-MM-DDTHH:mm" */
function toIST(iso) {
  const d = new Date(new Date(iso).getTime() + 330 * 60000);
  return d.toISOString().slice(0, 16);
}

/** Map a CricHeroes match to this site's event fields. */
export function toEvent(m) {
  const overs = Number(m.overs);
  return {
    kind: 'match',
    title: `${m.team_a} vs ${m.team_b}`.slice(0, 140),
    teamA: String(m.team_a || '').slice(0, 100),
    teamB: String(m.team_b || '').slice(0, 100),
    tournament: tidyTournament(m.tournament_name).slice(0, 140),
    round: String(m.tournament_round_name || '').slice(0, 80),
    start: toIST(m.match_start_time),
    format: overs === 20 ? 'T20' : overs === 10 ? 'T10' : overs ? `${overs} overs` : '',
    chMatchId: String(m.match_id),
  };
}

/** Fetch the ground page and return its upcoming matches as site events. */
export async function fetchUpcoming(groundId) {
  const res = await fetch(groundUrl(groundId), { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`CricHeroes returned ${res.status}`);
  const html = await res.text();
  const matches = extractMatches(html).filter((m) => String(m.ground_id) === String(groundId) && m.status === 'upcoming');
  return matches.map(toEvent);
}
