// Renders the NilAllDraw site (Honours Even identity) from the story store.

import fs from "node:fs";
import path from "node:path";

export const SECTIONS = [
  { slug: "premier-league", label: "Premier League" },
  { slug: "champions-league", label: "Champions League" },
  { slug: "world", label: "World Football" },
];

const HOME_CAP = 80;
const SECTION_DAYS = 7;
const SECTION_CAP = 250;
const SITE_NAME = "NilAllDraw";
const TAGLINE = "Every side of the story.";
const DESCRIPTION =
  "Football news, honours even. Premier League, Champions League and world football from sources everywhere, updated every four hours.";

const london = (opts) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", ...opts });

const fmtTime = london({ hour: "2-digit", minute: "2-digit", hour12: false });
const fmtDayKey = london({ year: "numeric", month: "2-digit", day: "2-digit" });
const fmtDayLabel = london({ weekday: "long", day: "numeric", month: "long" });
const fmtDayLabelYear = london({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtHour = london({ hour: "numeric", hour12: false });

function dayKey(iso) {
  // en-GB 2-digit gives dd/mm/yyyy; flip for sortable keys.
  const [d, m, y] = fmtDayKey.format(new Date(iso)).split("/");
  return `${y}-${m}-${d}`;
}

function dayLabel(iso, now) {
  const d = new Date(iso);
  const sameYear = fmtDayKey.format(d).slice(6) === fmtDayKey.format(now).slice(6);
  return (sameYear ? fmtDayLabel : fmtDayLabelYear).format(d);
}

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function groupByDay(stories, now) {
  const groups = new Map();
  for (const s of stories) {
    const key = dayKey(s.published);
    if (!groups.has(key)) groups.set(key, { label: dayLabel(s.published, now), stories: [] });
    groups.get(key).stories.push(s);
  }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([, g]) => g);
}

const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#1C2119"/><text x="32" y="43" font-family="Georgia,serif" font-size="26" font-weight="bold" text-anchor="middle" fill="#EFEDE2">0<tspan fill="#7DBA92">–</tspan>0</text></svg>`
  );

function langChip(story) {
  return story.lang === "en"
    ? ""
    : `<span class="lang" title="Source in ${esc(story.lang.toUpperCase())}">${esc(story.lang.toUpperCase())}</span> `;
}

function storyHtml(story, { showSection = false } = {}) {
  const section = SECTIONS.find((s) => s.slug === story.section);
  return `<article class="story">
  <h3><a href="${esc(story.link)}" target="_blank" rel="noopener">${esc(story.title)}</a></h3>
  ${story.snippet ? `<p class="snippet">${esc(story.snippet)}</p>` : ""}
  <p class="meta">${langChip(story)}<span class="src">${esc(story.source)}</span><span class="dot">·</span><span class="time">${fmtTime.format(new Date(story.published))}</span>${
    showSection && section
      ? `<span class="dot">·</span><span class="sec">${esc(section.label)}</span>`
      : ""
  }</p>
</article>`;
}

function archiveItemHtml(story) {
  return `<li><a href="${esc(story.link)}" target="_blank" rel="noopener">${esc(story.title)}</a>
  <span class="ameta">${langChip(story)}${esc(story.source)} · ${fmtTime.format(new Date(story.published))}</span></li>`;
}

function dayGroupsHtml(groups, opts) {
  return groups
    .map(
      (g) => `<section class="day">
<h2 class="day-head"><span>${esc(g.label)}</span></h2>
${g.stories.map((s) => storyHtml(s, opts)).join("\n")}
</section>`
    )
    .join("\n");
}

function page({ base, title, active, ticker, edition, body, footerExtra = "", canonicalPath = "" }) {
  const navTabs = [
    { href: base, label: "Latest", key: "latest" },
    ...SECTIONS.map((s) => ({ href: `${base}${s.slug}/`, label: s.label, key: s.slug })),
  ]
    .map(
      (t) =>
        `<a class="tab${t.key === active ? " on" : ""}" href="${t.href}"${t.key === active ? ' aria-current="page"' : ""}>${t.label}</a>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(DESCRIPTION)}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(DESCRIPTION)}">
<meta property="og:type" content="website">
<meta property="og:url" content="https://nilalldraw.com/${canonicalPath}">
<link rel="canonical" href="https://nilalldraw.com/${canonicalPath}">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#EFEDE2">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#15190F">
<link rel="icon" href="${FAVICON}">
<link rel="stylesheet" href="${base}assets/style.css">
</head>
<body>
<header class="masthead">
  <a class="m-name" href="${base}">NilAll<span class="dash">–</span>Draw</a>
  <p class="m-date">${esc(edition)}</p>
</header>
<nav class="tabs" aria-label="Sections">${navTabs}</nav>
<p class="ticker">${esc(ticker)}</p>
<main class="wrap">
${body}
</main>
<footer class="footer wrap">
${footerExtra}
<p class="foot-line">Updated every four hours, extra time permitting.</p>
<p class="foot-line">Stories retire after 30 days. A short career, handled gracefully.</p>
<p class="foot-line muted">${SITE_NAME} — ${TAGLINE} Headlines link to their original publishers.</p>
</footer>
</body>
</html>`;
}

function write(dist, relPath, html) {
  const file = path.join(dist, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

export function renderSite({ stories, feeds, now, dist, root }) {
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });
  fs.cpSync(path.join(root, "assets"), path.join(dist, "assets"), { recursive: true });
  const staticDir = path.join(root, "static");
  if (fs.existsSync(staticDir)) fs.cpSync(staticDir, dist, { recursive: true });

  const updated = fmtTime.format(now);
  const next = fmtTime.format(new Date(now.getTime() + 4 * 3600e3));
  const ticker = `UPDATED ${updated} UK · NEXT KICK-OFF ${next} · ${stories.length} STORIES ON THE PITCH`;
  const editionNo = Math.floor(Number(fmtHour.format(now)) / 4) + 1;
  const edition = `${dayLabel(now.toISOString(), now)} · Edition ${editionNo} of 6`;

  const sources = [...new Set(feeds.map((f) => f.name))].join(", ");
  const sourcesLine = `<p class="foot-line muted">Sources: ${esc(sources)}.</p>`;

  const emptyState = (slug) =>
    `<div class="empty"><p>Goalless so far. Next edition at ${next}.</p></div>`;

  // Home: latest across all sections.
  const homeStories = stories.slice(0, HOME_CAP);
  write(
    dist,
    "index.html",
    page({
      base: "./",
      title: `${SITE_NAME} — football news, honours even`,
      active: "latest",
      ticker,
      edition,
      canonicalPath: "",
      body: homeStories.length
        ? dayGroupsHtml(groupByDay(homeStories, now), { showSection: true })
        : emptyState("latest"),
      footerExtra: sourcesLine,
    })
  );

  // Section pages + archives.
  const sectionCutoff = now.getTime() - SECTION_DAYS * 24 * 3600e3;
  for (const section of SECTIONS) {
    const all = stories.filter((s) => s.section === section.slug);
    const recent = all
      .filter((s) => new Date(s.published).getTime() >= sectionCutoff)
      .slice(0, SECTION_CAP);

    write(
      dist,
      `${section.slug}/index.html`,
      page({
        base: "../",
        title: `${section.label} — ${SITE_NAME}`,
        active: section.slug,
        ticker,
        edition,
        canonicalPath: `${section.slug}/`,
        body:
          (recent.length ? dayGroupsHtml(groupByDay(recent, now), {}) : emptyState(section.slug)) +
          `\n<p class="archive-link"><a href="archive/">Full 30-day archive →</a></p>`,
        footerExtra: sourcesLine,
      })
    );

    write(
      dist,
      `${section.slug}/archive/index.html`,
      page({
        base: "../../",
        title: `${section.label} archive — ${SITE_NAME}`,
        active: section.slug,
        ticker,
        edition,
        canonicalPath: `${section.slug}/archive/`,
        body: `<h1 class="page-title">${esc(section.label)} — the last 30 days</h1>\n${
          all.length
            ? groupByDay(all, now)
                .map(
                  (g) => `<section class="day">
<h2 class="day-head"><span>${esc(g.label)}</span></h2>
<ul class="archive">${g.stories.map(archiveItemHtml).join("\n")}</ul>
</section>`
                )
                .join("\n")
            : emptyState(section.slug)
        }`,
      })
    );
  }

  // 404.
  write(
    dist,
    "404.html",
    page({
      base: "/",
      title: `Not found — ${SITE_NAME}`,
      active: "",
      ticker,
      edition,
      canonicalPath: "404.html",
      body: `<div class="empty"><p class="big">Nothing here. A page playing for the point.</p><p><a href="/">Back to the latest →</a></p></div>`,
    })
  );
}
