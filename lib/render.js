// Renders the NilAllDraw site (Stoppage Time identity) from the story store.

import fs from "node:fs";
import path from "node:path";
import { writeBrandAssets } from "./icons.js";

// `short` is the label shown on narrow screens, where the full names would
// push the tab row onto a second line.
export const SECTIONS = [
  { slug: "premier-league", label: "Premier League", short: "Premier" },
  { slug: "champions-league", label: "Champions League", short: "Champions" },
  { slug: "world", label: "World Football", short: "World" },
];

const HOME_CAP = 80;
const SECTION_DAYS = 7;
const SECTION_CAP = 250;
const SITE_NAME = "NilAllDraw";
const ORIGIN = "https://nilalldraw.com";
const LOCALE = "en-GB";
const DESCRIPTION =
  "Football news, honours even. Premier League, Champions League and world football, updated every six hours.";
const sectionDescription = (label) =>
  `The latest ${label} headlines from across the football press, newest first and updated every six hours. Football news, honours even.`;
const archiveDescription = (label) =>
  `Every ${label} headline gathered by ${SITE_NAME} in the last seven days, grouped by day. Football news, honours even.`;

// Enough to describe what the page is without shipping a second copy of it.
const JSONLD_ITEMS = 20;

const london = (opts) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", ...opts });

// hourCycle rather than hour12:false, to match the client formatter exactly —
// older engines read hour12:false as h24 and render midnight as "24:05".
const fmtTime = london({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
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

// Run-together source names ("FourFourTwo") have no natural break point for the
// narrow time column, so offer one at each internal capital. Names that already
// contain a space wrap there on their own.
function escSource(s) {
  return esc(s).replace(/(?<=[a-z])(?=[A-Z])/g, "​");
}

// Every rendered clock time carries its absolute instant, so the client script
// can re-time and re-group the page for the reader's own zone. The London text
// stays as the no-JS fallback.
function timeHtml(iso) {
  const d = new Date(iso);
  return `<time datetime="${d.toISOString()}">${fmtTime.format(d)}</time>`;
}

function groupByDay(stories, now) {
  const groups = new Map();
  for (const s of stories) {
    const key = dayKey(s.published);
    if (!groups.has(key)) groups.set(key, { key, label: dayLabel(s.published, now), stories: [] });
    groups.get(key).stories.push(s);
  }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([, g]) => g);
}

// Structured data. Every page is a CollectionPage of links out to the press
// rather than an article of our own, so the stories are described as an
// ItemList of external URLs — NewsArticle would be claiming authorship of
// someone else's reporting.
function jsonLdGraph({ canonicalPath, title, description, now, crumbs = [], stories = [] }) {
  const pageUrl = `${ORIGIN}/${canonicalPath}`;
  const listed = stories.slice(0, JSONLD_ITEMS);
  const graph = [
    {
      "@type": "WebSite",
      "@id": `${ORIGIN}/#website`,
      url: `${ORIGIN}/`,
      name: SITE_NAME,
      description: DESCRIPTION,
      inLanguage: LOCALE,
      publisher: { "@id": `${ORIGIN}/#org` },
    },
    {
      "@type": "Organization",
      "@id": `${ORIGIN}/#org`,
      name: SITE_NAME,
      url: `${ORIGIN}/`,
      logo: { "@type": "ImageObject", url: `${ORIGIN}/icon-512.png`, width: 512, height: 512 },
    },
    {
      "@type": "CollectionPage",
      "@id": `${pageUrl}#page`,
      url: pageUrl,
      name: title,
      description,
      inLanguage: LOCALE,
      isPartOf: { "@id": `${ORIGIN}/#website` },
      dateModified: now.toISOString(),
      ...(listed.length && {
        mainEntity: {
          "@type": "ItemList",
          itemListOrder: "https://schema.org/ItemListOrderDescending",
          numberOfItems: listed.length,
          itemListElement: listed.map((s, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: s.title,
            url: s.link,
          })),
        },
      }),
    },
  ];
  if (crumbs.length) {
    graph.push({
      "@type": "BreadcrumbList",
      "@id": `${pageUrl}#breadcrumbs`,
      itemListElement: crumbs.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        item: `${ORIGIN}/${c.path}`,
      })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

// "<" is the only character that can break out of a JSON-LD block.
function jsonLdScript(graph) {
  return `<script type="application/ld+json">${JSON.stringify(graph).replaceAll("<", "\\u003c")}</script>`;
}

// `base` is only needed alongside showSection, where the chip links through to
// that section's own page.
function storyHtml(story, { showSection = false, base = "./" } = {}) {
  const section = SECTIONS.find((s) => s.slug === story.section);
  return `<article class="story">
  <p class="board">${timeHtml(story.published)}<small>${escSource(story.source)}</small></p>
  <div class="body">
    <h3><a href="${esc(story.link)}" target="_blank" rel="noopener">${esc(story.title)}</a></h3>
    ${story.snippet ? `<p class="snippet">${esc(story.snippet)}</p>` : ""}${
      showSection && section
        ? `\n    <a class="chip" href="${base}${section.slug}/">${esc(section.label)}</a>`
        : ""
    }
  </div>
</article>`;
}

function archiveItemHtml(story) {
  return `<li><a href="${esc(story.link)}" target="_blank" rel="noopener">${esc(story.title)}</a>
  <span class="ameta">${esc(story.source)} · ${timeHtml(story.published)}</span></li>`;
}

// Both page shapes share this wrapper: the client script relies on data-day
// (the server's London key) to tell whether regrouping is needed, and on the
// <span> inside the heading, which .day-head::after needs as a flex sibling.
function daySectionHtml(g, inner) {
  return `<section class="day" data-day="${g.key}">
<h2 class="day-head"><span>${esc(g.label)}</span></h2>
${inner}
</section>`;
}

function dayGroupsHtml(groups, opts) {
  return groups
    .map((g) => daySectionHtml(g, g.stories.map((s) => storyHtml(s, opts)).join("\n")))
    .join("\n");
}

function archiveGroupsHtml(groups) {
  return groups
    .map((g) =>
      daySectionHtml(g, `<ul class="archive">${g.stories.map(archiveItemHtml).join("\n")}</ul>`)
    )
    .join("\n");
}

function page({
  base,
  title,
  description,
  active,
  now,
  body,
  canonicalPath = "",
  noindex = false,
  graph = null,
  // The home page has no headline of its own, so the wordmark is its <h1>;
  // every other page carries a real one in <main> and the wordmark drops to a
  // plain link. Both render identically — see .m-name in style.css.
  mastheadIsTitle = false,
}) {
  const pageUrl = `${ORIGIN}/${canonicalPath}`;
  const mast = mastheadIsTitle ? "h1" : "p";
  const navTabs = [
    { href: base, label: "Latest", short: "Latest", key: "latest" },
    ...SECTIONS.map((s) => ({
      href: `${base}${s.slug}/`,
      label: s.label,
      short: s.short,
      key: s.slug,
    })),
  ]
    .map(
      (t) =>
        `<a class="tab${t.key === active ? " on" : ""}" href="${t.href}" aria-label="${esc(t.label)}"${t.key === active ? ' aria-current="page"' : ""}><span class="t-full">${esc(t.label)}</span><span class="t-short">${esc(t.short)}</span></a>`
    )
    .join("");

  return `<!doctype html>
<html lang="${LOCALE}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-snippet:-1"}">
${noindex ? "" : `<link rel="canonical" href="${pageUrl}">\n`}<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="en_GB">
${noindex ? "" : `<meta property="og:url" content="${pageUrl}">\n`}<meta property="og:image" content="${ORIGIN}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="The NilAllDraw 0–0 mark">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${ORIGIN}/og.png">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#F7F7F4">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#131411">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="apple-mobile-web-app-title" content="${SITE_NAME}">
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
${/* Both faces are above the fold — the wordmark in Black, everything else in
      the regular — so neither should wait for the stylesheet to be parsed.
      These URLs must resolve to exactly what the @font-face rules ask for, or
      the browser fetches each file twice. */ ""}<link rel="preload" href="${base}assets/fonts/archivo-black.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${base}assets/fonts/archivo.woff2" as="font" type="font/woff2" crossorigin>
${graph ? jsonLdScript(graph) + "\n" : ""}</head>
<body>
<header class="wrap">
  <div class="mast">
    <div class="m-row">
      <${mast} class="m-name"><a href="${base}">nilalldraw<span class="stop">.</span></a></${mast}>
      <p class="m-live"><span class="pip" aria-hidden="true"></span><span id="updated" data-built="${now.toISOString()}">Last updated at ${fmtTime.format(now)}</span></p>
      <button class="theme-toggle" id="theme-toggle" type="button" aria-label="Switch theme" hidden><svg class="ball" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><circle class="ball-edge" cx="12" cy="12" r="9.4"/><path class="ball-panel" d="M12 8 15.8 10.76 14.35 15.24 9.65 15.24 8.2 10.76Z"/><path class="ball-seam" d="M12 8V2.6M15.8 10.76 20.94 9.1M14.35 15.24 17.53 19.6M9.65 15.24 6.47 19.6M8.2 10.76 3.06 9.1"/></svg></button>
    </div>
  </div>
</header>
<nav class="wrap" aria-label="Sections"><div class="tabs">${navTabs}</div></nav>
<main class="wrap">
${body}
</main>
<footer class="wrap">
  <div class="foot">
    <span>Updated every six hours</span>
    <span>Stories retire after 7 days</span>
  </div>
</footer>
<script>
// Re-time the page for the reader's own zone. The server renders Europe/London
// and that stays the no-JS truth; this corrects it in place, and writes nothing
// at all when the two already agree. Formatters mirror the ones at the top of
// lib/render.js, with the timeZone omitted so each resolves to local. Written
// without template literals: this whole block is itself inside one.
(() => {
  try {
    const fmtTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const fmtKey = new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" });
    const fmtLabel = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
    const fmtLabelYear = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    // en-GB 2-digit gives dd/mm/yyyy; flip for sortable keys.
    const dayKey = (d) => { const p = fmtKey.format(d).split("/"); return p[2] + "-" + p[1] + "-" + p[0]; };
    const thisYear = dayKey(new Date()).slice(0, 4);
    const dayLabel = (d) => (dayKey(d).slice(0, 4) === thisYear ? fmtLabel : fmtLabelYear).format(d);
    const set = (el, text) => { if (el.textContent !== text) el.textContent = text; };
    const listOf = (sec) => sec.querySelector("ul.archive");
    const itemsOf = (sec) => [...(listOf(sec) || sec).children].filter((el) => el.tagName !== "H2");

    // Read everything before writing anything: a throw here leaves the page as
    // the server rendered it, rather than local times under London headings.
    const sections = [...document.querySelectorAll("main section.day")];
    const itemsBySection = sections.map(itemsOf);
    // Stories are sorted newest-first by absolute instant, and converting zones
    // preserves that order, so regrouping never reorders — it only moves the
    // cuts. Walk the flat list and start a group at each day-key change.
    const segs = [];
    for (const items of itemsBySection) {
      for (const el of items) {
        const d = new Date(el.querySelector("time[datetime]").dateTime);
        const key = dayKey(d);
        const last = segs[segs.length - 1];
        if (last && last.key === key) last.items.push(el);
        else segs.push({ key: key, date: d, items: [el] });
      }
    }

    // Clocks stay 24-hour HH:MM for everyone, so the numerals keep their width
    // and this pass cannot shift the layout. Runs before the early return below
    // so the empty state's "next edition" time is localised too.
    for (const el of document.querySelectorAll("time[datetime]")) {
      set(el, fmtTime.format(new Date(el.dateTime)));
    }
    if (!segs.length) return;

    // Fast path: the cuts already match what the server rendered, as they do
    // for every UK reader, so no node moves at all.
    const unchanged =
      segs.length === sections.length &&
      segs.every((s, i) => s.key === sections[i].dataset.day && s.items.length === itemsBySection[i].length);
    if (unchanged) {
      // A label can still turn over at new year even when the cuts do not.
      segs.forEach((s, i) => set(sections[i].querySelector(".day-head span"), dayLabel(s.date)));
      return;
    }

    const parent = sections[0].parentNode;
    let anchor = sections[0];
    segs.forEach((seg, i) => {
      let sec = sections[i];
      if (!sec) {
        // Clone the heading so render.js stays the only source of its markup.
        sec = document.createElement("section");
        sec.className = "day";
        sec.appendChild(sections[0].querySelector(".day-head").cloneNode(true));
        if (listOf(sections[0])) {
          const ul = document.createElement("ul");
          ul.className = "archive";
          sec.appendChild(ul);
        }
        parent.insertBefore(sec, anchor.nextSibling);
      }
      const target = listOf(sec) || sec;
      let at = target.firstElementChild;
      if (at && at.tagName === "H2") at = at.nextElementSibling;
      for (const el of seg.items) {
        if (at === el) { at = el.nextElementSibling; continue; }
        target.insertBefore(el, at);
      }
      // Only ever the span: setting h2.textContent would delete it, and
      // .day-head::after needs it as the flex item beside the rule.
      set(sec.querySelector(".day-head span"), dayLabel(seg.date));
      sec.dataset.day = seg.key;
      anchor = sec;
    });
    // Surplus sections are emptied by the moves above; drop them.
    for (let i = segs.length; i < sections.length; i++) sections[i].remove();
  } catch {}
})();
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
    // The ball is server-rendered SVG styled from theme tokens, so there is no
    // icon to swap here — writing to btn would delete it.
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

function sitemapXml(now) {
  const lastmod = now.toISOString();
  const urls = [
    { path: "", changefreq: "hourly", priority: "1.0" },
    ...SECTIONS.flatMap((s) => [
      { path: `${s.slug}/`, changefreq: "hourly", priority: "0.8" },
      { path: `${s.slug}/archive/`, changefreq: "daily", priority: "0.5" },
    ]),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${ORIGIN}/${u.path}</loc><lastmod>${lastmod}</lastmod>` +
      `<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
  )
  .join("\n")}
</urlset>
`;
}

const WEBMANIFEST = JSON.stringify(
  {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#131411",
    theme_color: "#131411",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  null,
  2
);

export function renderSite({ stories, now, dist, root }) {
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });
  fs.cpSync(path.join(root, "assets"), path.join(dist, "assets"), { recursive: true });
  const staticDir = path.join(root, "static");
  if (fs.existsSync(staticDir)) fs.cpSync(staticDir, dist, { recursive: true });
  // Icons live at the root: iOS and browsers both probe for them there, and
  // robots.txt points at the sitemap by absolute URL.
  writeBrandAssets(dist);
  fs.writeFileSync(path.join(dist, "site.webmanifest"), WEBMANIFEST + "\n");
  fs.writeFileSync(path.join(dist, "sitemap.xml"), sitemapXml(now));

  const next = timeHtml(new Date(now.getTime() + 6 * 3600e3).toISOString());

  const emptyState = () =>
    `<div class="empty"><p>Goalless so far. Next edition at ${next}.</p></div>`;

  // Home: latest across all sections.
  const homeStories = stories.slice(0, HOME_CAP);
  write(
    dist,
    "index.html",
    page({
      base: "./",
      title: `${SITE_NAME} — football news, honours even`,
      description: DESCRIPTION,
      active: "latest",
      now,
      canonicalPath: "",
      mastheadIsTitle: true,
      graph: jsonLdGraph({
        canonicalPath: "",
        title: `${SITE_NAME} — football news, honours even`,
        description: DESCRIPTION,
        now,
        stories: homeStories,
      }),
      body: homeStories.length
        ? dayGroupsHtml(groupByDay(homeStories, now), { showSection: true, base: "./" })
        : emptyState(),
    })
  );

  // Section pages + archives.
  const sectionCutoff = now.getTime() - SECTION_DAYS * 24 * 3600e3;
  for (const section of SECTIONS) {
    const all = stories.filter((s) => s.section === section.slug);
    const recent = all
      .filter((s) => new Date(s.published).getTime() >= sectionCutoff)
      .slice(0, SECTION_CAP);

    const sectionTitle = `${section.label} news — latest headlines | ${SITE_NAME}`;
    const archiveTitle = `${section.label} — the last 7 days | ${SITE_NAME}`;
    const crumb = { name: section.label, path: `${section.slug}/` };

    write(
      dist,
      `${section.slug}/index.html`,
      page({
        base: "../",
        title: sectionTitle,
        description: sectionDescription(section.label),
        active: section.slug,
        now,
        canonicalPath: `${section.slug}/`,
        graph: jsonLdGraph({
          canonicalPath: `${section.slug}/`,
          title: sectionTitle,
          description: sectionDescription(section.label),
          now,
          crumbs: [{ name: "Latest", path: "" }, crumb],
          stories: recent,
        }),
        body:
          `<h1 class="page-title">${esc(section.label)} news</h1>\n` +
          (recent.length ? dayGroupsHtml(groupByDay(recent, now), {}) : emptyState()) +
          `\n<p class="archive-link"><a href="archive/">Full 7-day archive →</a></p>`,
      })
    );

    write(
      dist,
      `${section.slug}/archive/index.html`,
      page({
        base: "../../",
        title: archiveTitle,
        description: archiveDescription(section.label),
        active: section.slug,
        now,
        canonicalPath: `${section.slug}/archive/`,
        graph: jsonLdGraph({
          canonicalPath: `${section.slug}/archive/`,
          title: archiveTitle,
          description: archiveDescription(section.label),
          now,
          crumbs: [
            { name: "Latest", path: "" },
            crumb,
            { name: "Archive", path: `${section.slug}/archive/` },
          ],
          stories: all,
        }),
        body: `<h1 class="page-title">${esc(section.label)} — the last 7 days</h1>\n${
          all.length ? archiveGroupsHtml(groupByDay(all, now)) : emptyState()
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
      description: "That page doesn't exist. Back to the latest football headlines.",
      active: "",
      now,
      // Never a search result, so no canonical and nothing to index — but the
      // links out of it are still worth following.
      noindex: true,
      body: `<div class="empty"><p class="board-big">90+4</p><h1 class="big">Nothing added on. This page doesn't exist.</h1><p><a href="/">Back to the latest →</a></p></div>`,
    })
  );
}
