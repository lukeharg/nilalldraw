# NilAllDraw

**Football news, honours even.** A static news aggregator for [nilalldraw.com](https://nilalldraw.com) — Premier League, Champions League, and World Football headlines, rebuilt every six hours by GitHub Actions and served by GitHub Pages.

Headlines link to their original publishers. Stories retire after 7 days.

## How it works

```
GitHub Actions (every 6h, or manual, or on push)
  └─ node build.js
       ├─ fetches every feed in feeds.json
       ├─ merges new stories into data/stories.json (deduped by URL)
       ├─ prunes stories older than 7 days
       ├─ commits the refreshed store back to main
       └─ renders dist/ (all pages, plain HTML + one stylesheet)
  └─ deploys dist/ to GitHub Pages
```

There is no server and no database. `data/stories.json` is the store; its git history is the archive.

## Local development

```bash
npm install
npm run build     # fetches live feeds, writes data/ and dist/
npm run serve     # serves dist/ at http://localhost:3000
```

## Deploying (one-time setup)

1. Create a GitHub repository (public, for free Pages + Actions) and push this project to `main`.
2. In the repo: **Settings → Pages → Source: GitHub Actions**.
3. Run the workflow once by hand: **Actions → Build and deploy → Run workflow**. From then on it runs every 6 hours.

### Pointing nilalldraw.com at it

1. At your DNS provider, add for the apex domain (`nilalldraw.com`):
   - `A` records → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - Optionally `www` as a `CNAME` → `<your-username>.github.io`
2. In the repo: **Settings → Pages → Custom domain** → `nilalldraw.com`, then tick **Enforce HTTPS** once the certificate is issued (can take up to an hour).
3. The `static/CNAME` file is already in place so deployments keep the domain binding.

Until the domain is attached, the site lives at `https://<your-username>.github.io/<repo>/` — note that internal links assume the site is served at the domain root, so expect the 404 page's home link to be off until the custom domain is set.

## Editing the sources

Everything is in [feeds.json](feeds.json). Each feed:

```jsonc
{
  "id": "unique-slug",
  "name": "Display Name",         // shown in story metadata
  "section": "world",             // premier-league | champions-league | world
  "url": "https://…/rss.xml",
  "linkFilter": "/football/"      // optional: keep only URLs containing this substring
}
```

Order matters: section-specific feeds are listed first so a story appearing in both a Premier League feed and a general feed lands in Premier League.

Feeds fail independently — one dead source never breaks the build. The build only refuses to publish if **every** feed fails.

## Things worth knowing

- **Schedule drift:** GitHub's cron can run a few minutes late at busy times.
- **Scheduled-workflow sleep:** GitHub disables cron workflows in repos with no activity for 60 days. The data commits normally keep it alive, but if GitHub emails you about it, one click re-enables.
- **Retention:** change `RETENTION_DAYS` in [build.js](build.js).
- **Times are local to the reader.** Pages are rendered in Europe/London, and every clock time ships as `<time datetime="…">` alongside a `data-day` key on each day section. A script in [lib/render.js](lib/render.js) then re-times *and* re-groups the page for the reader's own zone, so a story always sits under its own local date. Clocks stay 24-hour everywhere, which keeps the board numerals a fixed width. With JavaScript off, the London rendering stands. The client formatters mirror `fmtTime`/`dayKey`/`dayLabel` at the top of the same file — change one, change both.
- **Cadence:** change the cron in [.github/workflows/build.yml](.github/workflows/build.yml) *and* the "every six hours" copy in [lib/render.js](lib/render.js) if you alter it.

## Brand

The identity is **Stoppage Time** — the fourth official's board: floodlit white (or black) ground, heavy Archivo Black numerals, one LED-amber accent. Each story leads with its published time as a board numeral. A nil-all draw favours nobody: no club, no agenda, every side of the story.

### Icons and the social card

[lib/icons.js](lib/icons.js) draws the `0–0` mark from primitives — two rings and a bar — and encodes it to PNG/ICO in process, writing into `dist/` on every build:

| File | Used by |
| --- | --- |
| `favicon.svg`, `favicon.ico` | browser tabs and bookmarks |
| `icon-192.png`, `icon-512.png` | `site.webmanifest`, Android home screen, Google's search-result favicon |
| `apple-touch-icon.png` | **iOS "Add to Home Screen"** — iOS ignores `rel="icon"` and will not take an SVG or a `data:` URI here, so this file is the only thing standing between the site and a screenshot thumbnail |
| `og.png` | link previews (`og:image`) |

Proportions live in the `CAP` table at the top of the file; every output derives from `markShapes`, so a change there moves all of them together.

The mark is drawn rather than typeset because the build has one dependency and runs on a bare CI runner, with no font rasteriser to hand. That is also why `og.png` carries the mark alone and not the `nilalldraw.` wordmark. If you want a typeset card, export a 1200×630 PNG by hand, drop it in [static/](static/), and delete the `ogCard` call — everything else keeps working.

## SEO

Rendered into every page by [lib/render.js](lib/render.js):

- One `<h1>` per page — the wordmark on the home page (`mastheadIsTitle`), a real heading everywhere else. Section pages carry theirs as `.vh`: the tabs already say which section you are on, so the heading is there for screen readers and crawlers rather than the layout. Archive pages show theirs.
- Per-page `<title>` and description; canonical, Open Graph, and Twitter card tags.
- JSON-LD: `WebSite` + `Organization` on every page, a `CollectionPage` whose `mainEntity` is an `ItemList` of the first 20 headlines, and a `BreadcrumbList` on section and archive pages. Stories are marked up as list items pointing at their publisher, never as `NewsArticle` — the reporting isn't ours to claim.
- `sitemap.xml` (all seven indexable pages, `lastmod` = build time), referenced from `static/robots.txt`.
- The 404 page is `noindex, follow` and carries no canonical.
- Both woff2 faces are preloaded; the URLs must resolve to exactly what the `@font-face` rules request or each file is fetched twice.

After the first deploy, submit `https://nilalldraw.com/sitemap.xml` in Google Search Console.
