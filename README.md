# BAILS Cricket Ground: website

Website for **BAILS Cricket Ground**, 642/2 Dayara, Rampally Village, Keesara, Hyderabad, Telangana 501302.

It has a scenic home page with a photo slideshow, amenities, the **Bails Cricket League** and other tournaments, upcoming fixtures with a countdown, a monthly **ground calendar** with three slots a day, a gold-lettered **honour board** for centuries and five-wicket hauls, a gallery with a video playlist, Google reviews, Instagram, WhatsApp and GW Sports booking links, and a map. A password-protected **admin panel** at `/admin` manages all of the changing content.

## Run it

Requires Node.js 22.9 or newer.

```bash
npm install
cp .env.example .env        # then set ADMIN_PASSWORD and SESSION_SECRET
npm start                   # http://localhost:3000   ·   admin: http://localhost:3000/admin
```

If `ADMIN_PASSWORD` isn't set, a temporary password is printed to the console on each start.

When you're signed in as admin, the home page also shows **+ Add fixture** and a delete button on each fixture.

### CricHeroes sync

The server reads upcoming matches from the ground's public CricHeroes page (ground ID `750279`) 30 seconds after it starts and then every 6 hours. Set `CRICHEROES_SYNC_HOURS` to change the interval. Admins can also click **↻ Refresh from CricHeroes** on the Calendar or Events tab.

- New matches are added as active fixtures and tagged **CricHeroes** in the admin list. Known ones get their date, teams and round updated.
- A fixture you delete is remembered and isn't imported again. To hide one for now, set it to Inactive instead.
- Tournaments listed in Settings → "Skip CricHeroes tournaments containing" (default `Octa`) are never imported.
- The ground page lists about the next 10 matches, so the sync sees that far ahead.
- If Node shows `unable to get local issuer certificate` on a company network, start it with `NODE_OPTIONS=--use-system-ca npm start`. Render doesn't need this.

## Admin panel (`/admin`)

| Tab | What it manages |
| --- | --- |
| 🗓️ Calendar | Month view of the ground. Pick a day to add or delete fixtures and to block or free its three slots: Slot 1 (7:00 – 10:30 AM), Slot 2 (10:45 AM – 2:15 PM), Slot 3 (2:30 – 6:00 PM) or the full day. Reasons include HCA division match, tournament, private booking, practice and maintenance. Blocks can repeat weekly. Each block has a public label and a private note that only admins see. The server refuses overlapping blocks. |
| 🏆 Honour Board | Centuries (runs, balls, 4s, 6s, not out) and five-wicket hauls (wickets, runs, overs), with team, opposition, date, tournament, photo and scorecard link. The server checks that a century has 100+ runs and a five-for has 5+ wickets. |
| 📅 Events & Fixtures | Tournaments and individual match fixtures. Times are IST. A tournament with a flyer or bracket image appears as a large spotlight card with its entry fee, contacts and highlights. A match's title fills in from the team names automatically. |
| 🖼️ Gallery & Videos | Photo uploads and MP4/WebM video uploads, with captions and ordering. |
| 📸 Instagram | Links to posts or reels on `instagram.com/bailscricket`, embedded with Instagram's official embed. |
| ⚙️ Settings | Phone numbers, contact people, WhatsApp number (all booking buttons use it), the GW Sports booking page, announcement bar, booking note, and Instagram, Facebook and YouTube links. A blank link hides its button. |

## How it's built

- `server.js`: Express 5 server with the JSON API, cookie sessions (HMAC-signed, HttpOnly, SameSite=Strict), login rate limiting, field validation, upload type and size limits, and security headers (CSP).
- `data/seed.json`: starting content. On first run it is copied to `data/db.json`, which holds live data and is git-ignored.
- `public/`: the static site (`index.html`, `css/`, `js/`), the admin panel (`admin/`), images (`assets/img/`) and admin uploads (`uploads/`, git-ignored).

### Deploying

Any Node host will run it (Render, Railway, Fly.io, a VPS with PM2, and so on). Two things matter:

1. Set `ADMIN_PASSWORD` and `SESSION_SECRET` as environment variables.
2. Put `DATA_DIR` and `UPLOAD_DIR` on a **persistent disk**, or honour-board entries and uploads will be lost on redeploy.

Serve it over HTTPS. The session cookie is marked `Secure` automatically behind an HTTPS proxy.

## Content sources (gathered November 2026)

- **Google Maps listing:** address, plus code, hours (7 AM – 6 PM daily), rating (4.7★, 111 reviews), review quotes, accessibility details and 10 photos.
- **CricHeroes ground page:** facilities list, 4.9/5 rating, 13 photos including the crest, and the upcoming fixtures (Elite Corporate League S17 and Octa Legends Championship S2).
- **Instagram:** [@bailscricket](https://www.instagram.com/bailscricket/), "Bails Cricket Ground", whose bio supplies the tagline "Our Own 'Dharamshala'".
- **Booking numbers:** from the "For Bookings" board at the ground (photo on CricHeroes). Contact people and the WhatsApp booking number (Raghu, 99080 76230) came from the ground team.
- **Honour board:** 87 centuries and 62 five-wicket hauls from the CricHeroes scorecards of the 748 scored matches played at Bails between 23 Nov 2024 and 22 Nov 2026. Each entry links to its scorecard. Player names are as entered by the scorers on CricHeroes.
- **Bails Cricket League Season 1:** details and posters supplied by the ground (`assets/img/bcl-*.jpg`).
- **Videos:** the two videos on the Google Maps listing, in 720p (`assets/video/`).
- **GW Sports:** Bails didn't have its own GW Sports venue page when this was built, so the booking link points to GW Sports' Hyderabad cricket ground listings. Paste the venue's own page into Settings once it's listed.

The photos and videos are user and owner uploads on those platforms. Before going live, confirm the ground is happy to use them, or swap in its own originals through the admin panel.
