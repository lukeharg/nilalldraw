# NilAllDraw

**Football news, honours even.** A static news aggregator for [nilalldraw.com](https://nilalldraw.com) — Premier League, Champions League, and World Football headlines from sources in six languages, rebuilt every four hours by GitHub Actions and served by GitHub Pages.

Headlines link to their original publishers. Stories retire after 30 days.

## How it works

```
GitHub Actions (every 4h, or manual, or on push)
  └─ node build.js
       ├─ fetches every feed in feeds.json
       ├─ merges new stories into data/stories.json (deduped by URL)
       ├─ prunes stories older than 30 days
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
3. Run the workflow once by hand: **Actions → Build and deploy → Run workflow**. From then on it runs every 4 hours.

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
  "lang": "en",                   // non-"en" gets a language chip
  "section": "world",             // premier-league | champions-league | world
  "url": "https://…/rss.xml",
  "linkFilter": ["/football/"],   // optional: keep only URLs containing any of these
  "linkExclude": ["/betting/"]    // optional: drop URLs containing any of these
}
```

Order matters: section-specific feeds are listed first so a story appearing in both a Premier League feed and a general feed lands in Premier League.

Feeds fail independently — one dead source never breaks the build. The build only refuses to publish if **every** feed fails.

## Things worth knowing

- **Schedule drift:** GitHub's cron can run a few minutes late at busy times. The ticker shows the actual build time.
- **Scheduled-workflow sleep:** GitHub disables cron workflows in repos with no activity for 60 days. The data commits normally keep it alive, but if GitHub emails you about it, one click re-enables.
- **Retention:** change `RETENTION_DAYS` in [build.js](build.js).
- **Cadence:** change the cron in [.github/workflows/build.yml](.github/workflows/build.yml) *and* the "every four hours" copy in [lib/render.js](lib/render.js) if you alter it.

## Brand

The identity is **Honours Even** — chalk paper, ink, pitch green, old gold; Newsreader for headlines. A nil-all draw favours nobody: no club, no agenda, every side of the story. The green ticker is the one inheritance from the teletext concept; language chips mark world sources in their own tongue.
