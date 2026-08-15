// Renders the NilAllDraw site (Stoppage Time identity) from the story store.

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
  "Football news, honours even. Premier League, Champions League and world football, updated every six hours.";

const london = (opts) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", ...opts });

const fmtTime = london({ hour: "2-digit", minute: "2-digit", hour12: false });
const fmtDayKey = london({ year: "numeric", month: "2-digit", day: "2-digit" });
const fmtDayLabel = london({ weekday: "long", day: "numeric", month: "long" });
const fmtDayLabelYear = london({ weekday: "long", day: "numeric", month: "long", year: "numeric" });

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
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#131411"/><text x="32" y="44" font-family="'Arial Black',Arial,sans-serif" font-size="24" font-weight="900" text-anchor="middle" fill="#F08000">0–0</text></svg>`
  );

function storyHtml(story, { showSection = false } = {}) {
  const section = SECTIONS.find((s) => s.slug === story.section);
  return `<article class="story">
  <p class="board">${fmtTime.format(new Date(story.published))}<small>${esc(story.source)}</small></p>
  <div class="body">
    <h3><a href="${esc(story.link)}" target="_blank" rel="noopener">${esc(story.title)}</a></h3>
    ${story.snippet ? `<p class="snippet">${esc(story.snippet)}</p>` : ""}${
      showSection && section ? `\n    <span class="chip">${esc(section.label)}</span>` : ""
    }
  </div>
</article>`;
}

function archiveItemHtml(story) {
  return `<li><a href="${esc(story.link)}" target="_blank" rel="noopener">${esc(story.title)}</a>
  <span class="ameta">${esc(story.source)} · ${fmtTime.format(new Date(story.published))}</span></li>`;
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

function page({ base, title, active, now, body, footerExtra = "", canonicalPath = "" }) {
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
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#F7F7F4">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#131411">
<link rel="icon" href="${FAVICON}">
<script>
// Apply a saved theme choice before first paint to avoid a flash.
(() => {
  try {
    const t = localStorage.getItem("theme");
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  } catch {}
})();
</script>
<link rel="stylesheet" href="${base}assets/style.css">
</head>
<body>
<header class="masthead">
  <div class="wrap m-row">
    <a class="m-name" href="${base}">nilalldraw<span class="stop">.</span></a>
    <p class="m-live"><span class="pip" aria-hidden="true"></span><span id="updated" data-built="${now.toISOString()}">Last updated at ${fmtTime.format(now)}</span></p>
    <button class="theme-toggle" id="theme-toggle" type="button" aria-label="Switch theme" hidden></button>
  </div>
</header>
<nav class="tabs-bar" aria-label="Sections"><div class="wrap tabs">${navTabs}</div></nav>
<main class="wrap">
${body}
</main>
<footer class="footer wrap">
${footerExtra}
<p class="foot-line">Updated every six hours, extra time permitting.</p>
<p class="foot-line">Stories retire after 7 days. A short career, handled gracefully.</p>
<p class="foot-line muted">${SITE_NAME} — ${TAGLINE} Headlines link to their original publishers.</p>
</footer>
<script>
// Turn the build timestamp into a live relative time; the server-rendered
// absolute time stays as the no-JS fallback.
(() => {
  const el = document.getElementById("updated");
  const built = new Date(el.dataset.built).getTime();
  const render = () => {
    const mins = Math.max(0, Math.floor((Date.now() - built) / 60000));
    el.textContent =
      mins < 1
        ? "Last updated just now"
        : mins < 60
          ? \`Last updated \${mins} minute\${mins === 1 ? "" : "s"} ago\`
          : \`Last updated \${Math.floor(mins / 60)} hour\${mins < 120 ? "" : "s"} ago\`;
  };
  render();
  setInterval(render, 60000);
})();
(() => {
  const root = document.documentElement;
  const btn = document.getElementById("theme-toggle");
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  const system = matchMedia("(prefers-color-scheme: dark)");
  const current = () => root.dataset.theme || (system.matches ? "dark" : "light");
  const paint = () => {
    const dark = current() === "dark";
    btn.textContent = dark ? "☀︎" : "☾";
    btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    // Keep the browser-chrome tint in step when the choice overrides the system.
    if (root.dataset.theme) for (const m of metas) m.content = dark ? "#131411" : "#F7F7F4";
  };
  btn.addEventListener("click", () => {
    const next = current() === "dark" ? "light" : "dark";
    try {
      if (next === (system.matches ? "dark" : "light")) {
        delete root.dataset.theme;
        localStorage.removeItem("theme");
      } else {
        root.dataset.theme = next;
        localStorage.setItem("theme", next);
      }
    } catch {}
    paint();
  });
  system.addEventListener("change", paint);
  paint();
  btn.hidden = false;
})();
</script>
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

  const next = fmtTime.format(new Date(now.getTime() + 6 * 3600e3));

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
      now,
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
        now,
        canonicalPath: `${section.slug}/`,
        body:
          (recent.length ? dayGroupsHtml(groupByDay(recent, now), {}) : emptyState(section.slug)) +
          `\n<p class="archive-link"><a href="archive/">Full 7-day archive →</a></p>`,
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
        now,
        canonicalPath: `${section.slug}/archive/`,
        body: `<h1 class="page-title">${esc(section.label)} — the last 7 days</h1>\n${
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
      now,
      canonicalPath: "404.html",
      body: `<div class="empty"><p class="board-big">90+4</p><p class="big">Nothing added on. This page doesn't exist.</p><p><a href="/">Back to the latest →</a></p></div>`,
    })
  );
}
