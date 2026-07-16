// NilAllDraw build: fetch feeds -> merge into the 30-day story store -> render dist/.
// Runs locally (`npm run build`) and in CI every four hours.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Parser from "rss-parser";
import { renderSite } from "./lib/render.js";

const ROOT = import.meta.dirname;
const DATA_FILE = path.join(ROOT, "data", "stories.json");
const DIST = path.join(ROOT, "dist");

const RETENTION_DAYS = 30;
const SNIPPET_MAX = 240;
const FETCH_TIMEOUT_MS = 20000;

const parser = new Parser({
  timeout: FETCH_TIMEOUT_MS,
  headers: {
    "User-Agent": "NilAllDrawBot/1.0 (+https://nilalldraw.com; football news aggregator)",
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
  },
});

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|cmp|at_|ns_)/i;

// linkFilter keeps only items matching any listed substring; linkExclude drops
// matches even if included. Both accept a string or an array, case-insensitive.
function linkAllowed(feed, link) {
  const lower = link.toLowerCase();
  const toList = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const includes = toList(feed.linkFilter);
  if (includes.length && !includes.some((s) => lower.includes(s.toLowerCase()))) return false;
  return !toList(feed.linkExclude).some((s) => lower.includes(s.toLowerCase()));
}

function canonicalLink(raw) {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return null;
  }
}

function storyId(link) {
  return createHash("sha1").update(link).digest("hex").slice(0, 12);
}

// Some feeds (e.g. Record) leak literal CDATA wrappers into text fields.
function stripCdata(text) {
  return text.replace(/<!\[CDATA\[|\]\]>/g, " ");
}

function cleanSnippet(item) {
  let text = item.contentSnippet || item.summary || item.content || "";
  text = stripCdata(text)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/Continue reading\.{0,3}\s*$/i, "")
    .trim();
  if (text.length > SNIPPET_MAX) {
    text = text.slice(0, SNIPPET_MAX);
    const cut = text.lastIndexOf(" ");
    if (cut > 80) text = text.slice(0, cut);
    text += "…";
  }
  return text;
}

function parseDate(item, fallback) {
  const raw = item.isoDate || item.pubDate;
  const d = raw ? new Date(raw) : null;
  if (!d || Number.isNaN(d.getTime())) return fallback;
  // Some feeds post-date embargoed items; clamp anything implausibly in the future.
  if (d.getTime() > Date.now() + 6 * 3600e3) return fallback;
  return d;
}

function loadStore() {
  try {
    return new Map(
      JSON.parse(fs.readFileSync(DATA_FILE, "utf8")).stories.map((s) => [s.id, s])
    );
  } catch {
    return new Map();
  }
}

function saveStore(stories) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify({ stories }, null, 1) + "\n");
}

// Fetch and normalize one feed without touching the store, so merging can happen
// strictly in feeds.json order (section-specific feeds claim duplicate URLs first).
async function fetchFeed(feed, now) {
  const result = { feed, candidates: [], items: 0, error: null };
  let parsed;
  try {
    parsed = await parser.parseURL(feed.url);
  } catch (err) {
    result.error = String(err.message || err).slice(0, 120);
    return result;
  }
  for (const item of parsed.items ?? []) {
    const link = canonicalLink(item.link || "");
    const title = stripCdata(item.title || "").replace(/\s+/g, " ").trim();
    if (!link || !title) continue;
    if (!linkAllowed(feed, link)) continue;
    result.items++;
    result.candidates.push({
      id: storyId(link),
      title,
      link,
      snippet: cleanSnippet(item),
      source: feed.name,
      sourceId: feed.id,
      lang: feed.lang,
      section: feed.section,
      published: parseDate(item, now).toISOString(),
      firstSeen: now.toISOString(),
    });
  }
  return result;
}

async function main() {
  const now = new Date();
  const { feeds } = JSON.parse(fs.readFileSync(path.join(ROOT, "feeds.json"), "utf8"));
  const store = loadStore();
  const before = store.size;

  const results = await Promise.all(feeds.map((f) => fetchFeed(f, now)));

  for (const result of results) {
    result.added = 0;
    for (const candidate of result.candidates) {
      if (store.has(candidate.id)) continue;
      store.set(candidate.id, candidate);
      result.added++;
    }
  }

  const cutoff = now.getTime() - RETENTION_DAYS * 24 * 3600e3;
  const stories = [...store.values()]
    .filter((s) => new Date(s.published).getTime() >= cutoff)
    .sort((a, b) => b.published.localeCompare(a.published) || a.id.localeCompare(b.id));

  saveStore(stories);
  renderSite({ stories, feeds, now, dist: DIST, root: ROOT });

  for (const r of results) {
    console.log(
      r.error
        ? `✗ ${r.feed.id}: ${r.error}`
        : `✓ ${r.feed.id}: ${r.items} items, ${r.added} new`
    );
  }
  console.log(
    `\nStore: ${before} -> ${stories.length} stories (${RETENTION_DAYS}-day window). Site written to dist/.`
  );
  if (results.every((r) => r.error)) {
    console.error("Every feed failed — refusing to publish an empty edition.");
    process.exit(1);
  }
  // rss-parser leaves sockets open (undestroyed requests on timeout/redirect),
  // which keeps the event loop alive forever; everything is written by now.
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
